"""Typed, environment-driven configuration (12-factor).

Every setting is read from ``RAG_*`` environment variables (or a ``.env`` file).
Defaults are chosen so that the whole platform runs offline with deterministic
fake providers; real providers are activated purely by configuration.
"""

from __future__ import annotations

from enum import StrEnum
from functools import lru_cache
from typing import Annotated
from urllib.parse import quote

from pydantic import Field, SecretStr, field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict


class ProviderKind(StrEnum):
    FAKE = "fake"
    OPENAI_COMPATIBLE = "openai"


class RerankerKind(StrEnum):
    NONE = "none"
    LEXICAL = "lexical"
    HTTP = "http"
    LLM = "llm"


class RewriterKind(StrEnum):
    HEURISTIC = "heuristic"
    LLM = "llm"


class InjectionPolicy(StrEnum):
    DROP = "drop"
    ANNOTATE = "annotate"


class IngestionMode(StrEnum):
    INLINE = "inline"
    QUEUE = "queue"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="RAG_", env_file=".env", extra="ignore", frozen=True
    )

    # --- runtime -----------------------------------------------------------
    environment: str = "local"
    log_level: str = "INFO"
    service_name: str = "enterprise-rag-platform"

    # --- storage -----------------------------------------------------------
    database_url: SecretStr | None = Field(
        default=None,
        description="postgresql+asyncpg://... ; when unset an in-memory store is used (demo/tests).",
    )
    # Alternative to database_url for platforms that inject credentials separately
    # (e.g. ECS secrets from an RDS-managed Secrets Manager secret).
    db_host: str | None = None
    db_port: int = 5432
    db_name: str = "rag"
    db_user: str | None = None
    db_password: SecretStr | None = None
    db_ssl: str | None = Field(default=None, description="asyncpg ssl mode, e.g. 'require'")
    db_pool_size: int = 10
    embedding_dim: int = Field(default=384, ge=8, le=4096)

    # --- auth --------------------------------------------------------------
    jwt_secret: SecretStr = SecretStr("change-me-dev-only-secret-at-least-32-bytes")
    jwt_algorithm: str = "HS256"
    jwt_public_key: str | None = None
    jwt_issuer: str = "https://auth.example.com/"
    jwt_audience: str = "rag-platform"
    allow_dev_tokens: bool = True

    # --- providers ---------------------------------------------------------
    llm_provider: ProviderKind = ProviderKind.FAKE
    llm_base_url: str = "https://api.openai.com/v1"
    llm_api_key: SecretStr | None = None
    llm_model: str = "fake-extractive-1"
    llm_timeout_s: float = 60.0
    llm_max_output_tokens: int = 700
    llm_temperature: float = 0.0

    embedding_provider: ProviderKind = ProviderKind.FAKE
    embedding_base_url: str = "https://api.openai.com/v1"
    embedding_api_key: SecretStr | None = None
    embedding_model: str = "fake-hash-embedding"
    embedding_batch_size: int = 64

    reranker: RerankerKind = RerankerKind.LEXICAL
    reranker_url: str | None = None
    reranker_api_key: SecretStr | None = None
    reranker_model: str | None = None

    query_rewriter: RewriterKind = RewriterKind.HEURISTIC

    # --- retrieval / generation policy ---------------------------------------
    retrieval_candidates: int = Field(default=40, ge=1, le=500)
    retrieval_top_k: int = Field(default=6, ge=1, le=50)
    rrf_k: int = Field(default=60, ge=1)
    min_relevance: float = Field(
        default=0.12, description="Reranker score below which evidence counts as insufficient."
    )
    max_context_tokens: int = 3000
    injection_policy: InjectionPolicy = InjectionPolicy.DROP
    injection_threshold: float = 0.5

    # --- ingestion -----------------------------------------------------------
    ingestion_mode: IngestionMode = IngestionMode.INLINE
    chunk_target_tokens: int = Field(default=220, ge=32, le=2000)
    chunk_overlap_tokens: int = Field(default=40, ge=0, le=500)
    max_upload_bytes: int = 20 * 1024 * 1024
    redact_pii_default: bool = True
    worker_poll_interval_s: float = 1.0
    worker_max_attempts: int = 5

    # --- semantic cache --------------------------------------------------------
    cache_enabled: bool = True
    cache_similarity: float = Field(default=0.97, ge=0.5, le=1.0)
    cache_ttl_s: int = 3600

    # --- cost --------------------------------------------------------------------
    model_pricing: dict[str, dict[str, float]] = Field(
        default_factory=lambda: {
            "fake-extractive-1": {"input": 0.0, "output": 0.0},
            "fake-hash-embedding": {"input": 0.0, "output": 0.0},
            "gpt-4o-mini": {"input": 0.00015, "output": 0.0006},
            "text-embedding-3-small": {"input": 0.00002, "output": 0.0},
        },
        description="USD per 1K tokens, JSON-encoded in the environment.",
    )

    # --- observability -----------------------------------------------------------
    otel_exporter_otlp_endpoint: str | None = None
    otel_console: bool = False

    cors_origins: Annotated[list[str], NoDecode] = Field(default_factory=list)

    @field_validator("cors_origins", mode="before")
    @classmethod
    def _split_csv(cls, v: object) -> object:
        if isinstance(v, str):
            return [s.strip() for s in v.split(",") if s.strip()]
        return v

    @field_validator("jwt_secret")
    @classmethod
    def _secret_len(cls, v: SecretStr) -> SecretStr:
        if len(v.get_secret_value()) < 32:
            raise ValueError("RAG_JWT_SECRET must be at least 32 bytes")
        return v

    @property
    def resolved_database_url(self) -> str | None:
        """``RAG_DATABASE_URL`` if set, else a URL assembled from the ``RAG_DB_*`` parts."""
        if self.database_url is not None:
            return self.database_url.get_secret_value()
        if not (self.db_host and self.db_user and self.db_password):
            return None
        user = quote(self.db_user, safe="")
        password = quote(self.db_password.get_secret_value(), safe="")
        url = f"postgresql+asyncpg://{user}:{password}@{self.db_host}:{self.db_port}/{self.db_name}"
        return f"{url}?ssl={self.db_ssl}" if self.db_ssl else url

    def price_for(self, model: str) -> dict[str, float]:
        return self.model_pricing.get(model, {"input": 0.0, "output": 0.0})


@lru_cache
def get_settings() -> Settings:
    return Settings()
