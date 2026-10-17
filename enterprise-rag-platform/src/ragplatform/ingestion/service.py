"""Ingestion use cases: submit (sync, idempotent) and process (async-capable worker step)."""

from __future__ import annotations

import time
from dataclasses import dataclass
from uuid import UUID, uuid4, uuid5

import structlog
from opentelemetry.trace import SpanKind

from ragplatform.config import IngestionMode, Settings
from ragplatform.domain.errors import (
    DocumentTooLargeError,
    NotFoundError,
    PermissionDeniedError,
)
from ragplatform.domain.models import (
    TENANT_WIDE_GROUP,
    Chunk,
    Document,
    DocumentStatus,
    Principal,
    utcnow,
)
from ragplatform.domain.ports import DocumentStore, EmbeddingProvider, JobQueue
from ragplatform.domain.text import sha256_hex
from ragplatform.generation.guardrails import InjectionDetector
from ragplatform.ingestion.chunker import StructureAwareChunker, search_text
from ragplatform.ingestion.parsers import parse_document, resolve_mime_type
from ragplatform.ingestion.pii import PiiRedactor
from ragplatform.observability.cost import CostMeter
from ragplatform.observability.telemetry import genai_span_attributes, record_model_call, tracer

log = structlog.get_logger(__name__)


@dataclass(frozen=True, slots=True)
class SubmitResult:
    document: Document
    deduplicated: bool
    job_id: UUID | None


class IngestionService:
    def __init__(
        self,
        settings: Settings,
        store: DocumentStore,
        queue: JobQueue,
        embedder: EmbeddingProvider,
        cost: CostMeter,
        *,
        chunker: StructureAwareChunker | None = None,
        pii: PiiRedactor | None = None,
        injection: InjectionDetector | None = None,
    ) -> None:
        self._settings = settings
        self._store = store
        self._queue = queue
        self._embedder = embedder
        self._cost = cost
        self._chunker = chunker or StructureAwareChunker(
            settings.chunk_target_tokens, settings.chunk_overlap_tokens
        )
        self._pii = pii or PiiRedactor()
        self._injection = injection or InjectionDetector()

    async def submit(
        self,
        principal: Principal,
        *,
        data: bytes,
        filename: str | None,
        mime_type: str | None,
        external_id: str | None = None,
        title: str | None = None,
        acl_groups: list[str] | None = None,
        redact_pii: bool | None = None,
    ) -> SubmitResult:
        if not principal.can_write:
            raise PermissionDeniedError("uploading requires the editor or admin role")
        if len(data) > self._settings.max_upload_bytes:
            raise DocumentTooLargeError(
                f"max upload size is {self._settings.max_upload_bytes} bytes"
            )
        if not data.strip():
            raise DocumentTooLargeError("empty document")
        resolved_mime = resolve_mime_type(filename, mime_type)
        groups = sorted(set(acl_groups or sorted(principal.groups) or [TENANT_WIDE_GROUP]))
        if not principal.may_grant(groups):
            raise PermissionDeniedError("cannot share a document with groups you do not belong to")
        redact = self._settings.redact_pii_default if redact_pii is None else redact_pii
        ext_id = external_id or filename or sha256_hex(data)[:16]
        content_hash = sha256_hex(data + f"|redact={int(redact)}".encode())

        existing = await self._store.get_by_external_id(principal.tenant_id, ext_id)
        if (
            existing is not None
            and existing.content_hash == content_hash
            and existing.acl_groups == groups
            and existing.status != DocumentStatus.FAILED
        ):
            log.info(
                "ingest.deduplicated", document_id=str(existing.id), tenant=principal.tenant_id
            )
            return SubmitResult(existing, deduplicated=True, job_id=None)

        if existing is not None:
            doc = existing
            doc.content_hash = content_hash
            doc.acl_groups = groups
            doc.mime_type = resolved_mime
            doc.redact_pii = redact
            doc.title = title or existing.title
            if title:
                doc.metadata = {**doc.metadata, "title_provided": True}
            doc.version += 1
            doc.status = DocumentStatus.PENDING
            doc.error = None
            doc.updated_at = utcnow()
        else:
            doc = Document(
                id=uuid4(),
                tenant_id=principal.tenant_id,
                external_id=ext_id,
                title=title or filename or ext_id,
                mime_type=resolved_mime,
                content_hash=content_hash,
                acl_groups=groups,
                redact_pii=redact,
                metadata={
                    "uploaded_by": principal.subject,
                    "filename": filename,
                    "title_provided": title is not None,
                },
            )
        await self._store.save(doc, data)

        if self._settings.ingestion_mode == IngestionMode.INLINE:
            await self.process(principal.tenant_id, doc.id)
            refreshed = await self._store.get(principal.tenant_id, doc.id)
            return SubmitResult(refreshed or doc, deduplicated=False, job_id=None)
        job_id = await self._queue.enqueue(principal.tenant_id, doc.id)
        return SubmitResult(doc, deduplicated=False, job_id=job_id)

    async def process(self, tenant_id: str, document_id: UUID) -> int:
        """Parse -> chunk -> PII -> injection scoring -> embed -> atomic swap. Returns chunks."""
        with tracer.start_as_current_span(
            "rag.ingest", attributes={"rag.tenant_id": tenant_id}
        ) as span:
            doc = await self._store.get(tenant_id, document_id)
            if doc is None:
                raise NotFoundError(f"document {document_id} not found")
            span.set_attribute("rag.document_id", str(document_id))
            await self._store.set_status(tenant_id, document_id, DocumentStatus.PROCESSING)
            try:
                count = await self._process(doc)
            except Exception as exc:
                await self._store.set_status(
                    tenant_id, document_id, DocumentStatus.FAILED, error=str(exc)[:500]
                )
                span.record_exception(exc)
                raise
            span.set_attribute("rag.chunks", count)
            return count

    async def _process(self, doc: Document) -> int:
        raw = await self._store.load_raw(doc.tenant_id, doc.id)
        parsed = parse_document(raw, doc.mime_type, fallback_title=doc.title)
        title = doc.title if doc.metadata.get("title_provided") else parsed.title
        chunks: list[Chunk] = []
        pii_totals: dict[str, int] = {}
        for ordinal, rc in enumerate(self._chunker.chunk(parsed)):
            pii = self._pii.scan(rc.content, redact=doc.redact_pii)
            for label, n in pii.counts.items():
                pii_totals[label] = pii_totals.get(label, 0) + n
            verdict = self._injection.assess(pii.text)
            text_for_index = search_text(title, rc.section_path, pii.text)
            chash = sha256_hex(text_for_index)
            chunks.append(
                Chunk(
                    id=uuid5(doc.id, f"{ordinal}:{chash}"),
                    tenant_id=doc.tenant_id,
                    document_id=doc.id,
                    ordinal=ordinal,
                    content=pii.text,
                    content_hash=chash,
                    token_count=rc.token_count,
                    section_path=rc.section_path,
                    acl_groups=doc.acl_groups,
                    page=rc.page,
                    metadata={
                        "title": title,
                        "pii": pii.counts,
                        "injection_score": verdict.score,
                        "injection_signals": verdict.signals,
                    },
                )
            )
        await self._embed(doc, title, chunks)
        await self._store.replace_chunks(doc.tenant_id, doc.id, chunks)
        doc.title = title
        doc.status = DocumentStatus.READY
        doc.chunk_count = len(chunks)
        doc.error = None
        doc.metadata = {**doc.metadata, "pii": pii_totals}
        doc.updated_at = utcnow()
        await self._store.save(doc, None)
        await self._store.bump_corpus_version(doc.tenant_id)
        log.info(
            "ingest.completed",
            document_id=str(doc.id),
            tenant=doc.tenant_id,
            chunks=len(chunks),
            pii=pii_totals,
            flagged=sum(
                1 for c in chunks if c.injection_score >= self._settings.injection_threshold
            ),
        )
        return len(chunks)

    async def _embed(self, doc: Document, title: str, chunks: list[Chunk]) -> None:
        reuse = await self._store.embeddings_by_hash(
            doc.tenant_id, [c.content_hash for c in chunks]
        )
        missing = [c for c in chunks if c.content_hash not in reuse]
        for c in chunks:
            c.embedding = reuse.get(c.content_hash)
        if not missing:
            return
        model = self._embedder.model
        with tracer.start_as_current_span(
            f"embeddings {model}",
            kind=SpanKind.CLIENT,
            attributes=genai_span_attributes("embeddings", self._embedder.provider_name, model),
        ) as span:
            started = time.perf_counter()
            result = await self._embedder.embed(
                [search_text(title, c.section_path, c.content) for c in missing]
            )
            elapsed = time.perf_counter() - started
            usage = await self._cost.charge(
                tenant_id=doc.tenant_id,
                subject=None,
                operation="ingest.embed",
                model=model,
                input_tokens=result.input_tokens,
                output_tokens=0,
                latency_ms=elapsed * 1000,
            )
            record_model_call(
                span=span,
                operation="embeddings",
                provider=self._embedder.provider_name,
                model=model,
                input_tokens=result.input_tokens,
                output_tokens=0,
                duration_s=elapsed,
                cost_usd=usage.cost_usd,
                tenant_id=doc.tenant_id,
            )
            span.set_attribute("rag.embeddings.reused", len(chunks) - len(missing))
        for c, vec in zip(missing, result.vectors, strict=True):
            c.embedding = vec
