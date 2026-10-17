"""Integration tests against PostgreSQL + pgvector (run ``ragplatform migrate`` first).

Each test uses a unique tenant id so tests are independent and re-runnable.
"""

from __future__ import annotations

import asyncio
import os
import uuid
from collections.abc import AsyncIterator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text

from ragplatform.adapters.postgres.database import Database
from ragplatform.adapters.postgres.repositories import PostgresJobQueue
from ragplatform.api.app import create_app
from ragplatform.api.auth import mint_token
from ragplatform.container import Container, build_container
from ragplatform.domain.models import DocumentStatus, Principal, Role
from tests.conftest import CORPUS, ingest_corpus, make_settings

DB_URL = os.environ.get("RAG_DATABASE_URL")
pytestmark = [
    pytest.mark.integration,
    pytest.mark.skipif(not DB_URL, reason="RAG_DATABASE_URL not set"),
]


def tenant() -> str:
    return f"it-{uuid.uuid4().hex[:10]}"


@pytest.fixture
async def pg() -> AsyncIterator[Container]:
    c = build_container(make_settings(database_url=DB_URL))
    try:
        yield c
    finally:
        await c.aclose()


async def test_ingest_and_answer_with_acl_inside_sql(pg: Container) -> None:
    t = tenant()
    ids = await ingest_corpus(pg, tenant=t)
    engineer = Principal(t, "eng", frozenset({"engineering"}))
    prepared = await pg.retrieval.prepare(
        engineer, "Q3 revenue forecast and how to roll back a deployment"
    )
    candidates = await pg.index.hybrid_candidates(
        engineer, prepared.rewritten, prepared.vector, limit=200
    )
    assert candidates, "hybrid search returned nothing"
    assert ids["finance-q3-forecast"] not in {str(c.document_id) for c in candidates}
    assert any(c.lexical_rank is not None for c in candidates)
    assert any(c.vector_rank is not None for c in candidates)

    finance = Principal(t, "fin", frozenset({"finance"}))
    answer = await pg.answers.answer(finance, "What is the Q3 revenue forecast?", use_cache=False)
    assert not answer.refused
    assert "48.2 million" in answer.text
    refused = await pg.answers.answer(engineer, "What is the Q3 revenue forecast?", use_cache=False)
    assert refused.refused


async def test_tenant_isolation_and_rls(pg: Container) -> None:
    t1, t2 = tenant(), tenant()
    await ingest_corpus(pg, tenant=t1)
    stranger = Principal(t2, "x", frozenset({"finance", "engineering", "hr"}))
    prepared = await pg.retrieval.prepare(stranger, "vacation days")
    assert (
        await pg.index.hybrid_candidates(stranger, prepared.rewritten, prepared.vector, limit=50)
        == []
    )

    # Row-level security: a non-superuser role only sees rows of app.tenant_id
    assert DB_URL is not None
    db = Database(DB_URL)
    try:
        async with db.engine.begin() as conn:
            await conn.execute(
                text(
                    "DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'rls_probe') "
                    "THEN CREATE ROLE rls_probe NOLOGIN; END IF; END $$"
                )
            )
            await conn.execute(text("GRANT SELECT ON chunks, documents TO rls_probe"))
        async with db.engine.begin() as conn:
            await conn.execute(text("SET LOCAL ROLE rls_probe"))
            unscoped = (await conn.execute(text("SELECT count(*) FROM chunks"))).scalar_one()
            await conn.execute(text("SELECT set_config('app.tenant_id', :t, true)"), {"t": t1})
            scoped = (
                await conn.execute(text("SELECT count(DISTINCT tenant_id) FROM chunks"))
            ).scalar_one()
            mine = (await conn.execute(text("SELECT count(*) FROM chunks"))).scalar_one()
            await conn.execute(text("SELECT set_config('app.tenant_id', :t, true)"), {"t": t2})
            other = (await conn.execute(text("SELECT count(*) FROM chunks"))).scalar_one()
        assert unscoped == 0
        assert scoped == 1
        assert mine > 0
        assert other == 0
    finally:
        await db.dispose()


async def test_reingestion_is_idempotent_and_reuses_embeddings(pg: Container) -> None:
    t = tenant()
    admin = Principal(t, "admin", frozenset(), frozenset({Role.ADMIN.value}))
    data = (CORPUS / "employee-handbook.md").read_bytes()
    first = await pg.ingestion.submit(admin, data=data, filename="hb.md", mime_type=None)
    dup = await pg.ingestion.submit(admin, data=data, filename="hb.md", mime_type=None)
    assert dup.deduplicated
    v2 = await pg.ingestion.submit(
        admin,
        data=data + b"\n## Pets\n\nDogs are welcome on Fridays.\n",
        filename="hb.md",
        mime_type=None,
    )
    assert v2.document.version == 2
    assert v2.document.chunk_count == first.document.chunk_count + 1
    rows = await pg.ledger.summary(t, first.document.created_at.replace(year=2000))
    embed = next(r for r in rows if r["operation"] == "ingest.embed")
    assert embed["calls"] == 2  # second call embedded only the new chunk


async def test_queue_skip_locked_concurrency() -> None:
    assert DB_URL is not None
    c = build_container(make_settings(database_url=DB_URL, ingestion_mode="queue"))
    try:
        t = tenant()
        admin = Principal(t, "admin", frozenset(), frozenset({Role.ADMIN.value}))
        docs = []
        for i in range(4):
            r = await c.ingestion.submit(
                admin,
                data=f"Document number {i} about topic {i}.".encode(),
                filename=f"d{i}.txt",
                mime_type=None,
            )
            assert r.job_id is not None
            docs.append(r.document.id)
        queue = c.queue
        assert isinstance(queue, PostgresJobQueue)
        claimed = await asyncio.gather(*(queue.claim() for _ in range(6)))
        ids = [j.id for j in claimed if j is not None]
        assert len(ids) == len(set(ids))  # no job handed out twice
        for job_id in ids:
            await queue.complete(job_id)
        # remaining jobs (from other concurrently running tests) are untouched; process ours
        for doc_id in docs:
            await c.ingestion.process(t, doc_id)
            doc = await c.documents.get(t, doc_id)
            assert doc is not None
            assert doc.status == DocumentStatus.READY
    finally:
        await c.aclose()


async def test_semantic_cache_roundtrip(pg: Container) -> None:
    t = tenant()
    await ingest_corpus(pg, tenant=t)
    user = Principal(t, "u", frozenset())
    q = "Which VPN client should I install?"
    first = await pg.answers.answer(user, q)
    second = await pg.answers.answer(user, q)
    assert not first.cached
    assert second.cached
    assert second.citations == first.citations
    other_acl = await pg.answers.answer(Principal(t, "u2", frozenset({"hr"})), q)
    assert not other_acl.cached


def test_api_end_to_end_with_postgres() -> None:
    settings = make_settings(database_url=DB_URL)
    t = tenant()
    token = mint_token(
        settings, tenant_id=t, subject="ed", groups=["engineering"], roles=["editor"]
    )
    headers = {"Authorization": f"Bearer {token}"}
    with TestClient(create_app(settings)) as client:
        assert client.get("/readyz").status_code == 200
        resp = client.post(
            "/v1/documents",
            headers=headers,
            files={"file": ("oncall.md", (CORPUS / "oncall-runbook.md").read_bytes())},
        )
        assert resp.status_code == 201, resp.text
        assert resp.json()["document"]["acl_groups"] == ["engineering"]
        resp = client.post(
            "/v1/query",
            headers=headers,
            json={"question": "How quickly must a Sev1 page be acknowledged?"},
        )
        body = resp.json()
        assert not body["refused"], body
        assert "5 minutes" in body["answer"]
