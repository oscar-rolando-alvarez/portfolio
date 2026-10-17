"""Ports (hexagonal architecture). Application services depend only on these protocols;
adapters (Postgres, in-memory, OpenAI-compatible HTTP, fakes) implement them."""

from __future__ import annotations

from collections.abc import AsyncIterator, Sequence
from dataclasses import dataclass
from datetime import datetime
from typing import Literal, Protocol
from uuid import UUID

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

# --------------------------------------------------------------------------- models


@dataclass(frozen=True, slots=True)
class EmbeddingResult:
    vectors: list[list[float]]
    input_tokens: int


@dataclass(frozen=True, slots=True)
class ChatMessage:
    role: Literal["system", "user", "assistant"]
    content: str


@dataclass(frozen=True, slots=True)
class Completion:
    text: str
    input_tokens: int
    output_tokens: int
    model: str
    finish_reason: str = "stop"


@dataclass(frozen=True, slots=True)
class StreamDelta:
    """A streamed fragment. The final item has ``done=True`` and carries usage."""

    text: str = ""
    done: bool = False
    input_tokens: int = 0
    output_tokens: int = 0
    model: str = ""


@dataclass(frozen=True, slots=True)
class CachedAnswer:
    payload: dict[str, object]
    similarity: float


# --------------------------------------------------------------------------- providers


class EmbeddingProvider(Protocol):
    @property
    def model(self) -> str: ...

    @property
    def provider_name(self) -> str: ...

    async def embed(self, texts: Sequence[str]) -> EmbeddingResult: ...


class LLMProvider(Protocol):
    @property
    def model(self) -> str: ...

    @property
    def provider_name(self) -> str: ...

    async def complete(
        self, messages: Sequence[ChatMessage], *, max_tokens: int, temperature: float
    ) -> Completion: ...

    def stream(
        self, messages: Sequence[ChatMessage], *, max_tokens: int, temperature: float
    ) -> AsyncIterator[StreamDelta]: ...


class Reranker(Protocol):
    @property
    def name(self) -> str: ...

    async def rerank(self, query: str, candidates: list[Candidate]) -> list[Candidate]:
        """Return candidates sorted by descending ``rerank_score`` (0..1)."""
        ...


class QueryRewriter(Protocol):
    async def rewrite(self, query: str, history: Sequence[ChatMessage]) -> str: ...


# --------------------------------------------------------------------------- persistence


class DocumentStore(Protocol):
    async def get_by_external_id(self, tenant_id: str, external_id: str) -> Document | None: ...

    async def get(self, tenant_id: str, document_id: UUID) -> Document | None: ...

    async def list_visible(
        self, principal: Principal, *, limit: int, offset: int
    ) -> list[Document]: ...

    async def save(self, document: Document, raw: bytes | None) -> None:
        """Insert or update a document (and optionally its raw bytes)."""
        ...

    async def load_raw(self, tenant_id: str, document_id: UUID) -> bytes: ...

    async def set_status(
        self,
        tenant_id: str,
        document_id: UUID,
        status: DocumentStatus,
        *,
        error: str | None = None,
        chunk_count: int | None = None,
    ) -> None: ...

    async def replace_chunks(self, tenant_id: str, document_id: UUID, chunks: list[Chunk]) -> None:
        """Atomically swap a document's chunks (re-ingestion is all-or-nothing)."""
        ...

    async def embeddings_by_hash(
        self, tenant_id: str, content_hashes: Sequence[str]
    ) -> dict[str, list[float]]:
        """Reuse embeddings of unchanged chunks to avoid paying for them twice."""
        ...

    async def delete(self, tenant_id: str, document_id: UUID) -> bool: ...

    async def corpus_version(self, tenant_id: str) -> int: ...

    async def bump_corpus_version(self, tenant_id: str) -> int: ...


class SearchIndex(Protocol):
    async def hybrid_candidates(
        self,
        principal: Principal,
        query_text: str,
        query_vector: list[float],
        *,
        limit: int,
    ) -> list[Candidate]:
        """Lexical + vector candidates with per-retriever ranks.

        Implementations MUST apply tenant and ACL filtering inside the query so that a
        chunk the principal cannot see is never returned (no post-filtering).
        """
        ...


class JobQueue(Protocol):
    async def enqueue(self, tenant_id: str, document_id: UUID) -> UUID: ...

    async def claim(self) -> IngestionJob | None: ...

    async def complete(self, job_id: UUID) -> None: ...

    async def fail(self, job_id: UUID, error: str, *, retry_at: datetime | None) -> None: ...


class SemanticCache(Protocol):
    async def lookup(
        self,
        principal: Principal,
        corpus_version: int,
        vector: list[float],
        *,
        min_similarity: float,
    ) -> CachedAnswer | None: ...

    async def store(
        self,
        principal: Principal,
        corpus_version: int,
        query: str,
        vector: list[float],
        payload: dict[str, object],
        *,
        ttl_s: int,
    ) -> None: ...


class UsageLedger(Protocol):
    async def record(self, event: UsageEvent) -> None: ...

    async def summary(self, tenant_id: str, since: datetime) -> list[dict[str, object]]: ...


class ApiKeyStore(Protocol):
    async def find_by_hash(self, key_hash: str) -> ApiKeyRecord | None: ...

    async def create(self, record: ApiKeyRecord, key_hash: str) -> None: ...


class HealthCheck(Protocol):
    async def ping(self) -> bool: ...
