"""Public API contract (Pydantic v2). Kept separate from domain models on purpose."""

from __future__ import annotations

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from ragplatform.domain.models import Document


class ChatTurn(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(max_length=4000)


class QueryRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    question: str = Field(
        min_length=2, max_length=2000, examples=["How many vacation days do new hires get?"]
    )
    history: list[ChatTurn] = Field(default_factory=list, max_length=20)
    top_k: int | None = Field(default=None, ge=1, le=20)
    use_cache: bool = True


class CitationOut(BaseModel):
    chunk_id: UUID
    document_id: UUID
    document_title: str
    section: str
    page: int | None
    snippet: str


class UsageOut(BaseModel):
    input_tokens: int
    output_tokens: int
    cost_usd: float


class AnswerOut(BaseModel):
    answer: str
    citations: list[CitationOut]
    refused: bool
    refusal_reason: str | None
    rewritten_query: str
    cached: bool
    usage: UsageOut
    guardrails: dict[str, object]


class DocumentOut(BaseModel):
    id: UUID
    external_id: str
    title: str
    mime_type: str
    status: str
    version: int
    chunk_count: int
    acl_groups: list[str]
    redact_pii: bool
    content_hash: str
    error: str | None
    created_at: datetime
    updated_at: datetime

    @classmethod
    def of(cls, d: Document) -> DocumentOut:
        return cls(
            id=d.id,
            external_id=d.external_id,
            title=d.title,
            mime_type=d.mime_type,
            status=d.status.value,
            version=d.version,
            chunk_count=d.chunk_count,
            acl_groups=d.acl_groups,
            redact_pii=d.redact_pii,
            content_hash=d.content_hash,
            error=d.error,
            created_at=d.created_at,
            updated_at=d.updated_at,
        )


class UploadOut(BaseModel):
    document: DocumentOut
    deduplicated: bool
    job_id: UUID | None


class UsageRow(BaseModel):
    operation: str
    model: str
    calls: int
    input_tokens: int
    output_tokens: int
    cost_usd: float


class UsageReport(BaseModel):
    tenant_id: str
    since: datetime
    total_cost_usd: float
    rows: list[UsageRow]


class PrincipalOut(BaseModel):
    tenant_id: str
    subject: str
    groups: list[str]
    roles: list[str]


class Problem(BaseModel):
    type: str
    title: str
    status: int
    detail: str
