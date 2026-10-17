"""PostgreSQL + pgvector adapters for the persistence ports.

SQL is written explicitly (SQLAlchemy Core ``text``) because the interesting parts —
hybrid retrieval, ``FOR UPDATE SKIP LOCKED`` queues, RLS — are PostgreSQL features best
expressed directly. All values are bound parameters.
"""

from __future__ import annotations

import json
import re
from collections.abc import Sequence
from datetime import datetime
from typing import Any
from uuid import UUID

from sqlalchemy import text

from ragplatform.adapters.postgres.database import Database, as_json, parse_vector, vector_literal
from ragplatform.domain.errors import NotFoundError
from ragplatform.domain.models import (
    ApiKeyRecord,
    Candidate,
    Chunk,
    Document,
    DocumentStatus,
    IngestionJob,
    Principal,
    UsageEvent,
)
from ragplatform.domain.ports import CachedAnswer
from ragplatform.domain.text import content_terms

_DOC_COLS = (
    "id, tenant_id, external_id, title, mime_type, content_hash, acl_groups, redact_pii, "
    "status, version, chunk_count, error, metadata, created_at, updated_at"
)


def _doc(row: Any) -> Document:
    m = row._mapping
    return Document(
        id=UUID(str(m["id"])),
        tenant_id=m["tenant_id"],
        external_id=m["external_id"],
        title=m["title"],
        mime_type=m["mime_type"],
        content_hash=m["content_hash"],
        acl_groups=list(m["acl_groups"]),
        redact_pii=m["redact_pii"],
        status=DocumentStatus(m["status"]),
        version=m["version"],
        chunk_count=m["chunk_count"],
        error=m["error"],
        metadata=as_json(m["metadata"]) or {},
        created_at=m["created_at"],
        updated_at=m["updated_at"],
    )


class PostgresDocumentStore:
    def __init__(self, db: Database) -> None:
        self._db = db

    async def get_by_external_id(self, tenant_id: str, external_id: str) -> Document | None:
        async with self._db.tenant_tx(tenant_id) as conn:
            row = (
                await conn.execute(
                    text(
                        f"SELECT {_DOC_COLS} FROM documents WHERE tenant_id = :t AND external_id = :e"
                    ),
                    {"t": tenant_id, "e": external_id},
                )
            ).first()
        return _doc(row) if row else None

    async def get(self, tenant_id: str, document_id: UUID) -> Document | None:
        async with self._db.tenant_tx(tenant_id) as conn:
            row = (
                await conn.execute(
                    text(f"SELECT {_DOC_COLS} FROM documents WHERE tenant_id = :t AND id = :id"),
                    {"t": tenant_id, "id": document_id},
                )
            ).first()
        return _doc(row) if row else None

    async def list_visible(
        self, principal: Principal, *, limit: int, offset: int
    ) -> list[Document]:
        acl = "" if principal.is_admin else "AND acl_groups && CAST(:g AS text[])"
        params: dict[str, Any] = {"t": principal.tenant_id, "lim": limit, "off": offset}
        if not principal.is_admin:
            params["g"] = principal.effective_groups
        async with self._db.tenant_tx(principal.tenant_id) as conn:
            rows = await conn.execute(
                text(
                    f"SELECT {_DOC_COLS} FROM documents WHERE tenant_id = :t {acl} "
                    "ORDER BY created_at DESC, id LIMIT :lim OFFSET :off"
                ),
                params,
            )
            return [_doc(r) for r in rows]

    async def save(self, document: Document, raw: bytes | None) -> None:
        d = document
        async with self._db.tenant_tx(d.tenant_id) as conn:
            await conn.execute(
                text(
                    "INSERT INTO documents (id, tenant_id, external_id, title, mime_type, content_hash, "
                    "acl_groups, redact_pii, status, version, chunk_count, error, metadata, created_at, "
                    "updated_at) VALUES (:id, :t, :e, :title, :mime, :hash, :acl, :redact, :status, "
                    ":version, :cc, :error, CAST(:meta AS jsonb), :created, :updated) "
                    "ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title, mime_type = EXCLUDED.mime_type, "
                    "content_hash = EXCLUDED.content_hash, acl_groups = EXCLUDED.acl_groups, "
                    "redact_pii = EXCLUDED.redact_pii, status = EXCLUDED.status, version = EXCLUDED.version, "
                    "chunk_count = EXCLUDED.chunk_count, error = EXCLUDED.error, "
                    "metadata = EXCLUDED.metadata, updated_at = EXCLUDED.updated_at"
                ),
                {
                    "id": d.id,
                    "t": d.tenant_id,
                    "e": d.external_id,
                    "title": d.title,
                    "mime": d.mime_type,
                    "hash": d.content_hash,
                    "acl": d.acl_groups,
                    "redact": d.redact_pii,
                    "status": d.status.value,
                    "version": d.version,
                    "cc": d.chunk_count,
                    "error": d.error,
                    "meta": json.dumps(d.metadata),
                    "created": d.created_at,
                    "updated": d.updated_at,
                },
            )
            if raw is not None:
                await conn.execute(
                    text(
                        "INSERT INTO document_blobs (document_id, tenant_id, data) VALUES (:id, :t, :data) "
                        "ON CONFLICT (document_id) DO UPDATE SET data = EXCLUDED.data"
                    ),
                    {"id": d.id, "t": d.tenant_id, "data": raw},
                )
            # keep chunk ACLs in sync immediately (ACL revocation must not wait for re-indexing)
            await conn.execute(
                text(
                    "UPDATE chunks SET acl_groups = :acl WHERE tenant_id = :t AND document_id = :id"
                ),
                {"acl": d.acl_groups, "t": d.tenant_id, "id": d.id},
            )

    async def load_raw(self, tenant_id: str, document_id: UUID) -> bytes:
        async with self._db.tenant_tx(tenant_id) as conn:
            data = (
                await conn.execute(
                    text(
                        "SELECT data FROM document_blobs WHERE tenant_id = :t AND document_id = :id"
                    ),
                    {"t": tenant_id, "id": document_id},
                )
            ).scalar_one_or_none()
        if data is None:
            raise NotFoundError(f"raw content for {document_id} not found")
        return bytes(data)

    async def set_status(
        self,
        tenant_id: str,
        document_id: UUID,
        status: DocumentStatus,
        *,
        error: str | None = None,
        chunk_count: int | None = None,
    ) -> None:
        async with self._db.tenant_tx(tenant_id) as conn:
            await conn.execute(
                text(
                    "UPDATE documents SET status = :s, error = :err, "
                    "chunk_count = COALESCE(:cc, chunk_count), updated_at = now() "
                    "WHERE tenant_id = :t AND id = :id"
                ),
                {
                    "s": status.value,
                    "err": error,
                    "cc": chunk_count,
                    "t": tenant_id,
                    "id": document_id,
                },
            )

    async def replace_chunks(self, tenant_id: str, document_id: UUID, chunks: list[Chunk]) -> None:
        async with self._db.tenant_tx(tenant_id) as conn:
            await conn.execute(
                text("DELETE FROM chunks WHERE tenant_id = :t AND document_id = :d"),
                {"t": tenant_id, "d": document_id},
            )
            if not chunks:
                return
            await conn.execute(
                text(
                    "INSERT INTO chunks (id, tenant_id, document_id, ordinal, title, section_text, content, "
                    "content_hash, token_count, section_path, page, acl_groups, metadata, embedding) VALUES "
                    "(:id, :t, :d, :ord, :title, :sect, :content, :hash, :tokens, :path, :page, :acl, "
                    "CAST(:meta AS jsonb), CAST(:emb AS vector))"
                ),
                [
                    {
                        "id": c.id,
                        "t": tenant_id,
                        "d": document_id,
                        "ord": c.ordinal,
                        "title": str(c.metadata.get("title", "")),
                        "sect": " ".join(c.section_path),
                        "content": c.content,
                        "hash": c.content_hash,
                        "tokens": c.token_count,
                        "path": c.section_path,
                        "page": c.page,
                        "acl": c.acl_groups,
                        "meta": json.dumps(c.metadata),
                        "emb": vector_literal(c.embedding or []),
                    }
                    for c in chunks
                ],
            )

    async def embeddings_by_hash(
        self, tenant_id: str, content_hashes: Sequence[str]
    ) -> dict[str, list[float]]:
        if not content_hashes:
            return {}
        async with self._db.tenant_tx(tenant_id) as conn:
            rows = await conn.execute(
                text(
                    "SELECT DISTINCT ON (content_hash) content_hash, embedding::text AS emb FROM chunks "
                    "WHERE tenant_id = :t AND content_hash = ANY(CAST(:h AS text[]))"
                ),
                {"t": tenant_id, "h": list(content_hashes)},
            )
            return {r.content_hash: parse_vector(r.emb) for r in rows}

    async def delete(self, tenant_id: str, document_id: UUID) -> bool:
        async with self._db.tenant_tx(tenant_id) as conn:
            result = await conn.execute(
                text("DELETE FROM documents WHERE tenant_id = :t AND id = :id RETURNING id"),
                {"t": tenant_id, "id": document_id},
            )
            return result.first() is not None

    async def corpus_version(self, tenant_id: str) -> int:
        async with self._db.system_tx() as conn:
            v = (
                await conn.execute(
                    text("SELECT corpus_version FROM tenants WHERE id = :t"), {"t": tenant_id}
                )
            ).scalar_one_or_none()
        return int(v or 0)

    async def bump_corpus_version(self, tenant_id: str) -> int:
        async with self._db.system_tx() as conn:
            v = (
                await conn.execute(
                    text(
                        "INSERT INTO tenants (id, corpus_version) VALUES (:t, 1) ON CONFLICT (id) DO "
                        "UPDATE SET corpus_version = tenants.corpus_version + 1 RETURNING corpus_version"
                    ),
                    {"t": tenant_id},
                )
            ).scalar_one()
        return int(v)


# --------------------------------------------------------------------------- retrieval

_SAFE_TERM = re.compile(r"^[a-z0-9]+$")

# Both legs filter on tenant_id AND acl_groups && :groups *inside* their index scans, so a
# chunk the caller may not read can never be ranked, returned, or influence scores.
HYBRID_SQL = """
WITH lexical AS (
    SELECT id, row_number() OVER (ORDER BY score DESC, id) AS rnk FROM (
        SELECT c.id, ts_rank_cd(c.tsv, q.query, 32) AS score
        FROM chunks c, to_tsquery('english', :tsq) AS q(query)
        WHERE c.tenant_id = :tenant
          AND c.acl_groups && CAST(:groups AS text[])
          AND c.tsv @@ q.query
        ORDER BY score DESC
        LIMIT :limit
    ) s
),
semantic AS (
    SELECT id, row_number() OVER (ORDER BY dist, id) AS rnk FROM (
        SELECT c.id, c.embedding <=> CAST(:vec AS vector) AS dist
        FROM chunks c
        WHERE c.tenant_id = :tenant
          AND c.acl_groups && CAST(:groups AS text[])
        ORDER BY dist
        LIMIT :limit
    ) s
)
SELECT c.id, c.document_id, c.title, c.content, c.section_path, c.page, c.metadata,
       l.rnk AS lexical_rank, v.rnk AS vector_rank
FROM lexical l
FULL OUTER JOIN semantic v ON v.id = l.id
JOIN chunks c ON c.id = COALESCE(l.id, v.id)
"""


def build_tsquery(text_: str) -> str | None:
    """OR-of-terms tsquery from sanitised terms (natural-language questions rarely match
    an AND of every word; ``ts_rank_cd`` rewards documents covering more terms)."""
    terms = sorted({t for t in content_terms(text_) if _SAFE_TERM.match(t)})
    return " | ".join(terms[:32]) if terms else None


class PostgresSearchIndex:
    def __init__(self, db: Database, *, ef_search: int = 100) -> None:
        self._db = db
        self._ef_search = int(ef_search)

    async def hybrid_candidates(
        self, principal: Principal, query_text: str, query_vector: list[float], *, limit: int
    ) -> list[Candidate]:
        tsq = build_tsquery(query_text) or "zzzznomatch"
        async with self._db.tenant_tx(principal.tenant_id) as conn:
            # pgvector >= 0.8: keep scanning the HNSW graph until enough rows pass the
            # tenant/ACL filter, instead of silently returning fewer than LIMIT rows.
            await conn.execute(text("SET LOCAL hnsw.iterative_scan = relaxed_order"))
            await conn.execute(text(f"SET LOCAL hnsw.ef_search = {self._ef_search}"))
            rows = await conn.execute(
                text(HYBRID_SQL),
                {
                    "tsq": tsq,
                    "tenant": principal.tenant_id,
                    "groups": principal.effective_groups,
                    "vec": vector_literal(query_vector),
                    "limit": limit,
                },
            )
            return [
                Candidate(
                    chunk_id=UUID(str(r.id)),
                    document_id=UUID(str(r.document_id)),
                    document_title=r.title,
                    content=r.content,
                    section_path=list(r.section_path),
                    page=r.page,
                    lexical_rank=r.lexical_rank,
                    vector_rank=r.vector_rank,
                    metadata=as_json(r.metadata) or {},
                )
                for r in rows
            ]


# --------------------------------------------------------------------------- jobs


class PostgresJobQueue:
    def __init__(self, db: Database, *, lease_minutes: int = 15) -> None:
        self._db = db
        self._lease = int(lease_minutes)

    async def enqueue(self, tenant_id: str, document_id: UUID) -> UUID:
        async with self._db.system_tx() as conn:
            job_id = (
                await conn.execute(
                    text(
                        "INSERT INTO ingestion_jobs (tenant_id, document_id) VALUES (:t, :d) RETURNING id"
                    ),
                    {"t": tenant_id, "d": document_id},
                )
            ).scalar_one()
        return UUID(str(job_id))

    async def claim(self) -> IngestionJob | None:
        async with self._db.system_tx() as conn:
            row = (
                await conn.execute(
                    text(
                        "UPDATE ingestion_jobs SET status = 'running', attempts = attempts + 1, "
                        "locked_at = now(), updated_at = now() WHERE id = ("
                        "  SELECT id FROM ingestion_jobs"
                        "  WHERE (status = 'queued' AND run_after <= now())"
                        f"     OR (status = 'running' AND locked_at < now() - interval '{self._lease} minutes')"
                        "  ORDER BY run_after FOR UPDATE SKIP LOCKED LIMIT 1"
                        ") RETURNING id, tenant_id, document_id, attempts"
                    )
                )
            ).first()
        if row is None:
            return None
        return IngestionJob(
            UUID(str(row.id)), row.tenant_id, UUID(str(row.document_id)), row.attempts
        )

    async def complete(self, job_id: UUID) -> None:
        async with self._db.system_tx() as conn:
            await conn.execute(
                text(
                    "UPDATE ingestion_jobs SET status = 'succeeded', last_error = NULL, "
                    "updated_at = now() WHERE id = :id"
                ),
                {"id": job_id},
            )

    async def fail(self, job_id: UUID, error: str, *, retry_at: datetime | None) -> None:
        async with self._db.system_tx() as conn:
            await conn.execute(
                text(
                    "UPDATE ingestion_jobs SET status = CASE WHEN CAST(:ra AS timestamptz) IS NULL "
                    "THEN 'failed' ELSE 'queued' END, run_after = COALESCE(CAST(:ra AS timestamptz), "
                    "run_after), last_error = :err, updated_at = now() WHERE id = :id"
                ),
                {"id": job_id, "err": error[:1000], "ra": retry_at},
            )

    async def stats(self) -> dict[str, int]:
        async with self._db.system_tx() as conn:
            rows = await conn.execute(
                text("SELECT status, count(*) AS n FROM ingestion_jobs GROUP BY status")
            )
            return {r.status: int(r.n) for r in rows}


# --------------------------------------------------------------------------- cache


class PostgresSemanticCache:
    def __init__(self, db: Database) -> None:
        self._db = db

    async def lookup(
        self,
        principal: Principal,
        corpus_version: int,
        vector: list[float],
        *,
        min_similarity: float,
    ) -> CachedAnswer | None:
        async with self._db.tenant_tx(principal.tenant_id) as conn:
            row = (
                await conn.execute(
                    text(
                        "SELECT payload, 1 - (embedding <=> CAST(:v AS vector)) AS sim "
                        "FROM semantic_cache WHERE tenant_id = :t AND acl_key = :k "
                        "AND corpus_version = :cv AND expires_at > now() "
                        "ORDER BY embedding <=> CAST(:v AS vector) LIMIT 1"
                    ),
                    {
                        "v": vector_literal(vector),
                        "t": principal.tenant_id,
                        "k": principal.acl_key,
                        "cv": corpus_version,
                    },
                )
            ).first()
        if row is None or float(row.sim) < min_similarity:
            return None
        return CachedAnswer(as_json(row.payload), float(row.sim))

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
        async with self._db.tenant_tx(principal.tenant_id) as conn:
            await conn.execute(
                text(
                    "INSERT INTO semantic_cache (tenant_id, acl_key, corpus_version, query, embedding, "
                    "payload, expires_at) VALUES (:t, :k, :cv, :q, CAST(:v AS vector), "
                    "CAST(:p AS jsonb), now() + make_interval(secs => :ttl))"
                ),
                {
                    "t": principal.tenant_id,
                    "k": principal.acl_key,
                    "cv": corpus_version,
                    "q": query,
                    "v": vector_literal(vector),
                    "p": json.dumps(payload),
                    "ttl": ttl_s,
                },
            )
            # opportunistic eviction of stale generations for this partition
            await conn.execute(
                text(
                    "DELETE FROM semantic_cache WHERE tenant_id = :t AND "
                    "(expires_at < now() OR corpus_version < :cv)"
                ),
                {"t": principal.tenant_id, "cv": corpus_version},
            )


# --------------------------------------------------------------------------- usage & keys


class PostgresUsageLedger:
    def __init__(self, db: Database) -> None:
        self._db = db

    async def record(self, event: UsageEvent) -> None:
        async with self._db.tenant_tx(event.tenant_id) as conn:
            await conn.execute(
                text(
                    "INSERT INTO usage_events (tenant_id, subject, operation, model, input_tokens, "
                    "output_tokens, cost_usd, latency_ms, created_at) VALUES (:t, :s, :op, :m, :i, :o, "
                    ":c, :l, :at)"
                ),
                {
                    "t": event.tenant_id,
                    "s": event.subject,
                    "op": event.operation,
                    "m": event.model,
                    "i": event.input_tokens,
                    "o": event.output_tokens,
                    "c": event.cost_usd,
                    "l": event.latency_ms,
                    "at": event.created_at,
                },
            )

    async def summary(self, tenant_id: str, since: datetime) -> list[dict[str, object]]:
        async with self._db.tenant_tx(tenant_id) as conn:
            rows = await conn.execute(
                text(
                    "SELECT operation, model, count(*) AS calls, sum(input_tokens) AS input_tokens, "
                    "sum(output_tokens) AS output_tokens, sum(cost_usd) AS cost_usd "
                    "FROM usage_events WHERE tenant_id = :t AND created_at >= :since "
                    "GROUP BY operation, model ORDER BY operation, model"
                ),
                {"t": tenant_id, "since": since},
            )
            return [
                {
                    "operation": r.operation,
                    "model": r.model,
                    "calls": int(r.calls),
                    "input_tokens": int(r.input_tokens or 0),
                    "output_tokens": int(r.output_tokens or 0),
                    "cost_usd": float(r.cost_usd or 0),
                }
                for r in rows
            ]


class PostgresApiKeyStore:
    def __init__(self, db: Database) -> None:
        self._db = db

    async def find_by_hash(self, key_hash: str) -> ApiKeyRecord | None:
        async with self._db.system_tx() as conn:
            r = (
                await conn.execute(
                    text(
                        "SELECT key_id, tenant_id, name, groups, roles, revoked FROM api_keys "
                        "WHERE key_hash = :h"
                    ),
                    {"h": key_hash},
                )
            ).first()
        if r is None:
            return None
        return ApiKeyRecord(r.key_id, r.tenant_id, r.name, list(r.groups), list(r.roles), r.revoked)

    async def create(self, record: ApiKeyRecord, key_hash: str) -> None:
        async with self._db.system_tx() as conn:
            await conn.execute(
                text(
                    "INSERT INTO api_keys (key_hash, key_id, tenant_id, name, groups, roles) "
                    "VALUES (:h, :id, :t, :n, :g, :r)"
                ),
                {
                    "h": key_hash,
                    "id": record.key_id,
                    "t": record.tenant_id,
                    "n": record.name,
                    "g": record.groups,
                    "r": record.roles,
                },
            )
