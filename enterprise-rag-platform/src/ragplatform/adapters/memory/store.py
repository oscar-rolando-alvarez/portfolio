"""In-memory adapter implementing every persistence port.

Used for unit tests, the offline eval harness and the zero-dependency demo. It mirrors the
Postgres semantics that matter: tenant + ACL filtering happens *before* ranking (the
analogue of filtering inside the SQL query), BM25 for lexical ranking, cosine for vectors.
"""

from __future__ import annotations

import asyncio
import math
from collections import Counter, defaultdict
from collections.abc import Sequence
from dataclasses import replace
from datetime import datetime, timedelta
from uuid import UUID, uuid4

from ragplatform.domain.errors import NotFoundError
from ragplatform.domain.models import (
    ApiKeyRecord,
    Candidate,
    Chunk,
    Document,
    DocumentStatus,
    IngestionJob,
    JobStatus,
    Principal,
    UsageEvent,
    utcnow,
)
from ragplatform.domain.ports import CachedAnswer
from ragplatform.domain.text import content_terms
from ragplatform.ingestion.chunker import search_text


def cosine(a: Sequence[float], b: Sequence[float]) -> float:
    dot = sum(x * y for x, y in zip(a, b, strict=True))
    na = math.sqrt(sum(x * x for x in a)) or 1.0
    nb = math.sqrt(sum(y * y for y in b)) or 1.0
    return dot / (na * nb)


class InMemoryStore:
    def __init__(self) -> None:
        self.documents: dict[UUID, Document] = {}
        self.raw: dict[UUID, bytes] = {}
        self.chunks: dict[UUID, list[Chunk]] = {}
        self.corpus_versions: dict[str, int] = defaultdict(int)
        self.jobs: dict[UUID, dict[str, object]] = {}
        self.cache: list[dict[str, object]] = []
        self.usage: list[UsageEvent] = []
        self.api_keys: dict[str, ApiKeyRecord] = {}
        self._lock = asyncio.Lock()

    # ----------------------------------------------------------------- health
    async def ping(self) -> bool:
        return True

    # ----------------------------------------------------------------- documents
    async def get_by_external_id(self, tenant_id: str, external_id: str) -> Document | None:
        for d in self.documents.values():
            if d.tenant_id == tenant_id and d.external_id == external_id:
                return replace(d, acl_groups=list(d.acl_groups), metadata=dict(d.metadata))
        return None

    async def get(self, tenant_id: str, document_id: UUID) -> Document | None:
        d = self.documents.get(document_id)
        if d is None or d.tenant_id != tenant_id:
            return None
        return replace(d, acl_groups=list(d.acl_groups), metadata=dict(d.metadata))

    async def list_visible(
        self, principal: Principal, *, limit: int, offset: int
    ) -> list[Document]:
        groups = set(principal.effective_groups)
        docs = [
            d
            for d in self.documents.values()
            if d.tenant_id == principal.tenant_id
            and (principal.is_admin or groups & set(d.acl_groups))
        ]
        docs.sort(key=lambda d: d.created_at, reverse=True)
        return docs[offset : offset + limit]

    async def save(self, document: Document, raw: bytes | None) -> None:
        self.documents[document.id] = replace(
            document, acl_groups=list(document.acl_groups), metadata=dict(document.metadata)
        )
        if raw is not None:
            self.raw[document.id] = raw

    async def load_raw(self, tenant_id: str, document_id: UUID) -> bytes:
        d = self.documents.get(document_id)
        if d is None or d.tenant_id != tenant_id or document_id not in self.raw:
            raise NotFoundError(f"raw content for {document_id} not found")
        return self.raw[document_id]

    async def set_status(
        self,
        tenant_id: str,
        document_id: UUID,
        status: DocumentStatus,
        *,
        error: str | None = None,
        chunk_count: int | None = None,
    ) -> None:
        d = self.documents.get(document_id)
        if d is None or d.tenant_id != tenant_id:
            return
        d.status = status
        d.error = error
        if chunk_count is not None:
            d.chunk_count = chunk_count
        d.updated_at = utcnow()

    async def replace_chunks(self, tenant_id: str, document_id: UUID, chunks: list[Chunk]) -> None:
        self.chunks[document_id] = list(chunks)

    async def embeddings_by_hash(
        self, tenant_id: str, content_hashes: Sequence[str]
    ) -> dict[str, list[float]]:
        wanted = set(content_hashes)
        out: dict[str, list[float]] = {}
        for chunks in self.chunks.values():
            for c in chunks:
                if c.tenant_id == tenant_id and c.content_hash in wanted and c.embedding:
                    out[c.content_hash] = c.embedding
        return out

    async def delete(self, tenant_id: str, document_id: UUID) -> bool:
        d = self.documents.get(document_id)
        if d is None or d.tenant_id != tenant_id:
            return False
        del self.documents[document_id]
        self.raw.pop(document_id, None)
        self.chunks.pop(document_id, None)
        return True

    async def corpus_version(self, tenant_id: str) -> int:
        return self.corpus_versions[tenant_id]

    async def bump_corpus_version(self, tenant_id: str) -> int:
        self.corpus_versions[tenant_id] += 1
        return self.corpus_versions[tenant_id]

    # ----------------------------------------------------------------- search
    def _visible_chunks(self, principal: Principal) -> list[tuple[Chunk, Document]]:
        groups = set(principal.effective_groups)
        out: list[tuple[Chunk, Document]] = []
        for doc_id, chunks in self.chunks.items():
            doc = self.documents.get(doc_id)
            if (
                doc is None
                or doc.tenant_id != principal.tenant_id
                or doc.status != DocumentStatus.READY
            ):
                continue
            out.extend((c, doc) for c in chunks if groups & set(c.acl_groups))
        return out

    async def hybrid_candidates(
        self, principal: Principal, query_text: str, query_vector: list[float], *, limit: int
    ) -> list[Candidate]:
        visible = self._visible_chunks(principal)  # ACL applied before any ranking
        if not visible:
            return []
        docs_terms = [
            Counter(content_terms(search_text(d.title, c.section_path, c.content)))
            for c, d in visible
        ]
        avgdl = sum(sum(t.values()) for t in docs_terms) / len(docs_terms)
        q_terms = set(content_terms(query_text))
        df = {t: sum(1 for dt in docs_terms if t in dt) for t in q_terms}
        n = len(docs_terms)
        k1, b = 1.2, 0.75
        lexical: list[tuple[float, int]] = []
        for i, dt in enumerate(docs_terms):
            dl = sum(dt.values())
            score = 0.0
            for t in q_terms:
                tf = dt.get(t, 0)
                if not tf:
                    continue
                idf = math.log(1 + (n - df[t] + 0.5) / (df[t] + 0.5))
                score += idf * tf * (k1 + 1) / (tf + k1 * (1 - b + b * dl / avgdl))
            if score > 0:
                lexical.append((score, i))
        lexical.sort(key=lambda x: -x[0])
        vector = sorted(
            (
                (cosine(query_vector, c.embedding or []), i)
                for i, (c, _) in enumerate(visible)
                if c.embedding
            ),
            key=lambda x: -x[0],
        )
        lex_rank = {i: r for r, (_, i) in enumerate(lexical[:limit], start=1)}
        vec_rank = {i: r for r, (_, i) in enumerate(vector[:limit], start=1)}
        out = []
        for i in set(lex_rank) | set(vec_rank):
            c, d = visible[i]
            out.append(
                Candidate(
                    chunk_id=c.id,
                    document_id=d.id,
                    document_title=d.title,
                    content=c.content,
                    section_path=list(c.section_path),
                    page=c.page,
                    lexical_rank=lex_rank.get(i),
                    vector_rank=vec_rank.get(i),
                    metadata=dict(c.metadata),
                )
            )
        return out

    # ----------------------------------------------------------------- jobs
    async def enqueue(self, tenant_id: str, document_id: UUID) -> UUID:
        job_id = uuid4()
        self.jobs[job_id] = {
            "tenant_id": tenant_id,
            "document_id": document_id,
            "status": JobStatus.QUEUED,
            "attempts": 0,
            "run_after": utcnow(),
            "error": None,
        }
        return job_id

    async def claim(self) -> IngestionJob | None:
        async with self._lock:
            now = utcnow()
            for job_id, job in self.jobs.items():
                run_after = job["run_after"]
                assert isinstance(run_after, datetime)
                if job["status"] == JobStatus.QUEUED and run_after <= now:
                    job["status"] = JobStatus.RUNNING
                    attempts = int(str(job["attempts"])) + 1
                    job["attempts"] = attempts
                    tenant = str(job["tenant_id"])
                    doc_id = job["document_id"]
                    assert isinstance(doc_id, UUID)
                    return IngestionJob(job_id, tenant, doc_id, attempts)
        return None

    async def complete(self, job_id: UUID) -> None:
        self.jobs[job_id]["status"] = JobStatus.SUCCEEDED

    async def fail(self, job_id: UUID, error: str, *, retry_at: datetime | None) -> None:
        job = self.jobs[job_id]
        job["error"] = error
        if retry_at is None:
            job["status"] = JobStatus.FAILED
        else:
            job["status"] = JobStatus.QUEUED
            job["run_after"] = retry_at

    # ----------------------------------------------------------------- semantic cache
    async def lookup(
        self,
        principal: Principal,
        corpus_version: int,
        vector: list[float],
        *,
        min_similarity: float,
    ) -> CachedAnswer | None:
        now = utcnow()
        best: CachedAnswer | None = None
        for entry in self.cache:
            expires = entry["expires_at"]
            assert isinstance(expires, datetime)
            if (
                entry["tenant_id"] != principal.tenant_id
                or entry["acl_key"] != principal.acl_key
                or entry["corpus_version"] != corpus_version
                or expires < now
            ):
                continue
            vec = entry["vector"]
            assert isinstance(vec, list)
            sim = cosine(vector, vec)
            if sim >= min_similarity and (best is None or sim > best.similarity):
                payload = entry["payload"]
                assert isinstance(payload, dict)
                best = CachedAnswer(payload, sim)
        return best

    async def store(
        self,
        principal: Principal,
        corpus_version: int,
        query: str,
        vector: list[float],
        payload: dict[str, object],
        *,
        ttl_s: int,
    ) -> None:
        self.cache.append(
            {
                "tenant_id": principal.tenant_id,
                "acl_key": principal.acl_key,
                "corpus_version": corpus_version,
                "query": query,
                "vector": vector,
                "payload": payload,
                "expires_at": utcnow() + timedelta(seconds=ttl_s),
            }
        )

    # ----------------------------------------------------------------- usage
    async def record(self, event: UsageEvent) -> None:
        self.usage.append(event)

    async def summary(self, tenant_id: str, since: datetime) -> list[dict[str, object]]:
        agg: dict[tuple[str, str], dict[str, float]] = {}
        for e in self.usage:
            if e.tenant_id != tenant_id or e.created_at < since:
                continue
            row = agg.setdefault(
                (e.operation, e.model),
                {"calls": 0, "input_tokens": 0, "output_tokens": 0, "cost_usd": 0.0},
            )
            row["calls"] += 1
            row["input_tokens"] += e.input_tokens
            row["output_tokens"] += e.output_tokens
            row["cost_usd"] += e.cost_usd
        return [
            {"operation": op, "model": model, **dict(vals.items())}
            for (op, model), vals in sorted(agg.items())
        ]

    # ----------------------------------------------------------------- api keys
    async def find_by_hash(self, key_hash: str) -> ApiKeyRecord | None:
        return self.api_keys.get(key_hash)

    async def create(self, record: ApiKeyRecord, key_hash: str) -> None:
        self.api_keys[key_hash] = record
