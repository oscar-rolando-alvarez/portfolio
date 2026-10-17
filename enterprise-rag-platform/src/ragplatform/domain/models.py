"""Core domain model. Pure Python: no framework, ORM or network imports."""

from __future__ import annotations

import hashlib
from dataclasses import dataclass, field
from datetime import UTC, datetime
from enum import StrEnum
from typing import Any
from uuid import UUID

#: Group every member of a tenant implicitly belongs to ("visible to the whole tenant").
TENANT_WIDE_GROUP = "*"


def utcnow() -> datetime:
    return datetime.now(UTC)


class Role(StrEnum):
    READER = "reader"
    EDITOR = "editor"
    ADMIN = "admin"


@dataclass(frozen=True, slots=True)
class Principal:
    """An authenticated caller. Every data access is scoped by ``tenant_id`` + ``groups``."""

    tenant_id: str
    subject: str
    groups: frozenset[str] = frozenset()
    roles: frozenset[str] = frozenset({Role.READER})

    @property
    def effective_groups(self) -> list[str]:
        """Groups used for ACL matching, always including the tenant-wide group."""
        return sorted(self.groups | {TENANT_WIDE_GROUP})

    @property
    def acl_key(self) -> str:
        """Stable fingerprint of the caller's visibility; partitions the semantic cache."""
        raw = "\x1f".join(self.effective_groups)
        return hashlib.sha256(raw.encode()).hexdigest()[:32]

    @property
    def is_admin(self) -> bool:
        return Role.ADMIN in self.roles

    @property
    def can_write(self) -> bool:
        return self.is_admin or Role.EDITOR in self.roles

    def can_see(self, tenant_id: str, acl_groups: list[str]) -> bool:
        if tenant_id != self.tenant_id:
            return False
        return self.is_admin or bool(set(acl_groups) & set(self.effective_groups))

    def may_grant(self, acl_groups: list[str]) -> bool:
        """Least privilege: editors may only share documents with groups they belong to."""
        if self.is_admin:
            return True
        allowed = self.groups | {TENANT_WIDE_GROUP}
        return set(acl_groups) <= allowed


class DocumentStatus(StrEnum):
    PENDING = "pending"
    PROCESSING = "processing"
    READY = "ready"
    FAILED = "failed"


@dataclass(slots=True)
class Document:
    id: UUID
    tenant_id: str
    external_id: str
    title: str
    mime_type: str
    content_hash: str
    acl_groups: list[str]
    redact_pii: bool
    status: DocumentStatus = DocumentStatus.PENDING
    version: int = 1
    chunk_count: int = 0
    error: str | None = None
    metadata: dict[str, Any] = field(default_factory=dict)
    created_at: datetime = field(default_factory=utcnow)
    updated_at: datetime = field(default_factory=utcnow)


class BlockKind(StrEnum):
    HEADING = "heading"
    PARAGRAPH = "paragraph"
    LIST = "list"
    CODE = "code"
    TABLE = "table"


@dataclass(frozen=True, slots=True)
class Block:
    """A structural unit produced by a parser (heading, paragraph, table...)."""

    kind: BlockKind
    text: str
    level: int = 0
    page: int | None = None


@dataclass(frozen=True, slots=True)
class ParsedDocument:
    title: str
    blocks: list[Block]


@dataclass(slots=True)
class Chunk:
    id: UUID
    tenant_id: str
    document_id: UUID
    ordinal: int
    content: str
    content_hash: str
    token_count: int
    section_path: list[str]
    acl_groups: list[str]
    page: int | None = None
    embedding: list[float] | None = None
    metadata: dict[str, Any] = field(default_factory=dict)

    @property
    def injection_score(self) -> float:
        return float(self.metadata.get("injection_score", 0.0))


@dataclass(slots=True)
class Candidate:
    """A chunk surfaced by retrieval, carrying the ranks from each retriever."""

    chunk_id: UUID
    document_id: UUID
    document_title: str
    content: str
    section_path: list[str]
    page: int | None
    lexical_rank: int | None = None
    vector_rank: int | None = None
    fused_score: float = 0.0
    rerank_score: float | None = None
    metadata: dict[str, Any] = field(default_factory=dict)

    @property
    def injection_score(self) -> float:
        return float(self.metadata.get("injection_score", 0.0))

    @property
    def relevance(self) -> float:
        return self.rerank_score if self.rerank_score is not None else self.fused_score


@dataclass(frozen=True, slots=True)
class Citation:
    chunk_id: UUID
    document_id: UUID
    document_title: str
    section: str
    page: int | None
    snippet: str


@dataclass(slots=True)
class TokenUsage:
    input_tokens: int = 0
    output_tokens: int = 0
    cost_usd: float = 0.0

    def add(self, other: TokenUsage) -> None:
        self.input_tokens += other.input_tokens
        self.output_tokens += other.output_tokens
        self.cost_usd += other.cost_usd


class RefusalReason(StrEnum):
    NO_EVIDENCE = "no_evidence"
    LOW_RELEVANCE = "low_relevance"
    MODEL_DECLINED = "model_declined"
    UNGROUNDED = "ungrounded"
    UNSAFE_QUERY = "unsafe_query"


@dataclass(slots=True)
class Answer:
    text: str
    citations: list[Citation]
    refused: bool
    refusal_reason: RefusalReason | None
    rewritten_query: str
    usage: TokenUsage
    cached: bool = False
    guardrails: dict[str, Any] = field(default_factory=dict)
    retrieved: list[Candidate] = field(default_factory=list)


@dataclass(frozen=True, slots=True)
class UsageEvent:
    tenant_id: str
    operation: str
    model: str
    input_tokens: int
    output_tokens: int
    cost_usd: float
    latency_ms: float
    subject: str | None = None
    created_at: datetime = field(default_factory=utcnow)


@dataclass(frozen=True, slots=True)
class ApiKeyRecord:
    key_id: str
    tenant_id: str
    name: str
    groups: list[str]
    roles: list[str]
    revoked: bool = False


class JobStatus(StrEnum):
    QUEUED = "queued"
    RUNNING = "running"
    SUCCEEDED = "succeeded"
    FAILED = "failed"


@dataclass(frozen=True, slots=True)
class IngestionJob:
    id: UUID
    tenant_id: str
    document_id: UUID
    attempts: int
