from __future__ import annotations

from collections.abc import Iterator
from pathlib import Path
from typing import Any

import pytest
from opentelemetry import trace
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import SimpleSpanProcessor
from opentelemetry.sdk.trace.export.in_memory_span_exporter import InMemorySpanExporter

from ragplatform.adapters.memory.store import InMemoryStore
from ragplatform.config import Settings
from ragplatform.container import Container, build_container
from ragplatform.domain.models import Principal, Role

ROOT = Path(__file__).resolve().parents[1]
CORPUS = ROOT / "evals" / "corpus"

_EXPORTER = InMemorySpanExporter()
_provider = TracerProvider()
_provider.add_span_processor(SimpleSpanProcessor(_EXPORTER))
trace.set_tracer_provider(_provider)


@pytest.fixture
def spans() -> Iterator[InMemorySpanExporter]:
    _EXPORTER.clear()
    yield _EXPORTER
    _EXPORTER.clear()


def make_settings(**overrides: Any) -> Settings:
    base: dict[str, Any] = {
        "database_url": None,
        "ingestion_mode": "inline",
        "otel_exporter_otlp_endpoint": None,
    }
    base.update(overrides)
    return Settings(_env_file=None, **base)  # type: ignore[call-arg]


@pytest.fixture
def settings() -> Settings:
    return make_settings()


@pytest.fixture
def store() -> InMemoryStore:
    return InMemoryStore()


@pytest.fixture
def container(settings: Settings, store: InMemoryStore) -> Container:
    return build_container(settings, memory_store=store)


def principal(
    tenant: str = "acme", groups: tuple[str, ...] = (), roles: tuple[str, ...] = ("reader",)
) -> Principal:
    return Principal(
        tenant, f"user-{'-'.join(groups) or 'none'}", frozenset(groups), frozenset(roles)
    )


@pytest.fixture
def admin() -> Principal:
    return Principal("acme", "admin@acme", frozenset(), frozenset({Role.ADMIN.value}))


async def ingest_corpus(container: Container, tenant: str = "acme") -> dict[str, str]:
    """Ingest the eval corpus for ``tenant``; returns external_id -> document id."""
    import json

    admin = Principal(tenant, "admin", frozenset(), frozenset({Role.ADMIN.value}))
    ids: dict[str, str] = {}
    manifest = json.loads((CORPUS / "manifest.json").read_text())
    for entry in manifest["documents"]:
        if entry.get("tenant"):
            continue
        path = CORPUS / entry["file"]
        result = await container.ingestion.submit(
            admin,
            data=path.read_bytes(),
            filename=path.name,
            mime_type=None,
            external_id=entry["external_id"],
            acl_groups=entry["acl_groups"],
        )
        ids[entry["external_id"]] = str(result.document.id)
    await container.worker.drain()
    return ids
