from __future__ import annotations

import json
from collections.abc import Iterator
from pathlib import Path

import jwt
import pytest
from fastapi.testclient import TestClient

from ragplatform.adapters.memory.store import InMemoryStore
from ragplatform.api.app import create_app
from ragplatform.api.auth import mint_token
from ragplatform.config import Settings
from ragplatform.container import build_container
from tests.conftest import CORPUS, make_settings


@pytest.fixture
def api_settings() -> Settings:
    return make_settings()


@pytest.fixture
def client(api_settings: Settings) -> Iterator[TestClient]:
    container = build_container(api_settings, memory_store=InMemoryStore())
    with TestClient(create_app(api_settings, container)) as c:
        yield c


def auth(
    settings: Settings,
    *,
    tenant: str = "acme",
    groups: list[str] | None = None,
    roles: list[str] | None = None,
) -> dict[str, str]:
    token = mint_token(
        settings,
        tenant_id=tenant,
        subject="alice",
        groups=groups or [],
        roles=roles or ["reader"],
    )
    return {"Authorization": f"Bearer {token}"}


def upload(
    client: TestClient, settings: Settings, path: Path, groups: list[str], **form: str
) -> dict:  # type: ignore[type-arg]
    resp = client.post(
        "/v1/documents",
        headers=auth(settings, roles=["admin"]),
        files={"file": (path.name, path.read_bytes())},
        data={"acl_groups": ",".join(groups), **form},
    )
    assert resp.status_code in (200, 201), resp.text
    return resp.json()  # type: ignore[no-any-return]


def test_health_and_openapi(client: TestClient) -> None:
    assert client.get("/healthz").json() == {"status": "ok"}
    assert client.get("/readyz").status_code == 200
    spec = client.get("/openapi.json").json()
    assert "/v1/query" in spec["paths"]
    schemes = spec["components"]["securitySchemes"]
    assert {"HTTPBearer", "APIKeyHeader"} <= set(schemes)


def test_requires_credentials(client: TestClient) -> None:
    resp = client.post("/v1/query", json={"question": "hello there"})
    assert resp.status_code == 401
    assert resp.headers["content-type"].startswith("application/problem+json")


def test_rejects_bad_tokens(client: TestClient, api_settings: Settings) -> None:
    forged = jwt.encode(
        {"sub": "x", "tid": "acme"}, "wrong-secret-wrong-secret-wrong-secret", "HS256"
    )
    assert client.get("/v1/me", headers={"Authorization": f"Bearer {forged}"}).status_code == 401
    expired = mint_token(
        api_settings, tenant_id="acme", subject="a", groups=[], roles=[], ttl_s=-120
    )
    assert client.get("/v1/me", headers={"Authorization": f"Bearer {expired}"}).status_code == 401


def test_upload_query_and_acl(client: TestClient, api_settings: Settings) -> None:
    doc = upload(client, api_settings, CORPUS / "finance-q3-forecast.md", ["finance"])
    assert doc["document"]["status"] == "ready"
    assert doc["document"]["acl_groups"] == ["finance"]
    doc_id = doc["document"]["id"]

    # idempotent re-upload
    again = client.post(
        "/v1/documents",
        headers=auth(api_settings, roles=["admin"]),
        files={
            "file": ("finance-q3-forecast.md", (CORPUS / "finance-q3-forecast.md").read_bytes())
        },
        data={"acl_groups": "finance"},
    )
    assert again.status_code == 200
    assert again.json()["deduplicated"] is True

    finance = auth(api_settings, groups=["finance"])
    engineering = auth(api_settings, groups=["engineering"])

    resp = client.post(
        "/v1/query", headers=finance, json={"question": "What is the Q3 revenue forecast?"}
    )
    body = resp.json()
    assert resp.status_code == 200
    assert not body["refused"]
    assert "48.2 million" in body["answer"]
    assert body["citations"][0]["document_id"] == doc_id

    resp = client.post(
        "/v1/query", headers=engineering, json={"question": "What is the Q3 revenue forecast?"}
    )
    assert resp.json()["refused"] is True

    # invisible documents are 404, never 403 (no existence oracle)
    assert client.get(f"/v1/documents/{doc_id}", headers=engineering).status_code == 404
    assert client.get(f"/v1/documents/{doc_id}", headers=finance).status_code == 200
    assert [d["id"] for d in client.get("/v1/documents", headers=engineering).json()] == []
    # other tenant with same groups sees nothing
    other = auth(api_settings, tenant="globex", groups=["finance"])
    assert client.get(f"/v1/documents/{doc_id}", headers=other).status_code == 404


def test_reader_cannot_upload_or_delete(client: TestClient, api_settings: Settings) -> None:
    resp = client.post(
        "/v1/documents",
        headers=auth(api_settings),
        files={"file": ("a.txt", b"hello world")},
    )
    assert resp.status_code == 403
    doc = upload(client, api_settings, CORPUS / "it-support.md", ["*"])
    doc_id = doc["document"]["id"]
    assert client.delete(f"/v1/documents/{doc_id}", headers=auth(api_settings)).status_code == 403
    editor = auth(api_settings, roles=["editor"])
    assert client.delete(f"/v1/documents/{doc_id}", headers=editor).status_code == 204
    assert client.get(f"/v1/documents/{doc_id}", headers=editor).status_code == 404


def test_unsupported_and_validation(client: TestClient, api_settings: Settings) -> None:
    admin = auth(api_settings, roles=["admin"])
    resp = client.post("/v1/documents", headers=admin, files={"file": ("x.exe", b"MZ...")})
    assert resp.status_code == 415
    resp = client.post("/v1/query", headers=admin, json={"question": "x", "extra": 1})
    assert resp.status_code == 422


def test_streaming_endpoint(client: TestClient, api_settings: Settings) -> None:
    upload(client, api_settings, CORPUS / "it-support.md", ["*"])
    with client.stream(
        "POST",
        "/v1/query/stream",
        headers=auth(api_settings),
        json={"question": "Which VPN client should I install?"},
    ) as resp:
        assert resp.status_code == 200
        assert resp.headers["content-type"].startswith("text/event-stream")
        raw = "".join(resp.iter_text())
    events = [blk for blk in raw.split("\n\n") if blk.strip()]
    names = [e.split("\n")[0].removeprefix("event: ") for e in events]
    assert names[0] == "meta"
    assert names[-1] == "done"
    assert "token" in names
    done = json.loads(events[-1].split("\n")[1].removeprefix("data: "))
    assert "NorthVPN" in done["answer"]
    assert done["citations"]


def test_api_keys_and_usage(client: TestClient, api_settings: Settings) -> None:
    admin = auth(api_settings, roles=["admin"])
    upload(client, api_settings, CORPUS / "expense-policy.md", ["*"])
    resp = client.post(
        "/v1/admin/api-keys",
        headers=admin,
        json={"name": "bot", "groups": ["ops"], "roles": ["reader"]},
    )
    assert resp.status_code == 201
    key = resp.json()["api_key"]
    assert key.startswith("rag_")
    me = client.get("/v1/me", headers={"X-API-Key": key}).json()
    assert me["tenant_id"] == "acme"
    assert me["groups"] == ["ops"]
    resp = client.post(
        "/v1/query",
        headers={"X-API-Key": key},
        json={"question": "What is the meal per diem for international travel?"},
    )
    assert "100 USD" in resp.json()["answer"]
    assert client.get("/v1/me", headers={"X-API-Key": "rag_nope_nope_nope_nope"}).status_code == 401

    # usage is admin-only and tenant-scoped
    assert client.get("/v1/usage", headers=auth(api_settings)).status_code == 403
    report = client.get("/v1/usage", headers=admin).json()
    ops = {r["operation"] for r in report["rows"]}
    assert {"ingest.embed", "query.embed", "query.generate"} <= ops
    # readers cannot mint keys
    assert (
        client.post(
            "/v1/admin/api-keys", headers=auth(api_settings), json={"name": "x"}
        ).status_code
        == 403
    )
