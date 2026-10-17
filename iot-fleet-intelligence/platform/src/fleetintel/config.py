"""Typed configuration. Every knob is an environment variable (prefix ``FLEETINTEL_``)."""

from __future__ import annotations

from enum import StrEnum
from functools import lru_cache

from pydantic import Field, SecretStr, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Backend(StrEnum):
    AWS = "aws"  # DynamoDB + SQS (real AWS, or moto-server / emulators locally)
    MEMORY = "memory"  # in-process fakes: unit tests, evals, quick demos


class LLMProvider(StrEnum):
    FAKE = "fake"  # deterministic, offline - default for CI and evals
    OPENAI_COMPATIBLE = "openai_compatible"  # OpenAI, Azure OpenAI, vLLM, Ollama, LiteLLM, ...


class EnrichmentMode(StrEnum):
    FAKE = "fake"  # deterministic fixtures, no network
    LIVE = "live"  # real third-party HTTP APIs behind the same ports


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="FLEETINTEL_", env_file=None, extra="ignore")

    backend: Backend = Backend.MEMORY
    table_name: str = "fleetintel"
    enrichment_queue_url: str = ""
    diagnosis_queue_url: str = ""
    quarantine_queue_url: str = ""  # poison telemetry records (validation failures)
    aws_endpoint_url: str | None = None  # moto-server / emulator endpoint for local runs

    # --- detection -------------------------------------------------------
    window_seconds: int = Field(default=60, ge=10, le=3600)
    allowed_lateness_seconds: int = Field(default=30, ge=0, le=3600)
    z_threshold: float = Field(default=4.0, gt=0)
    ewma_alpha: float = Field(default=0.2, gt=0, lt=1)
    min_samples: int = Field(default=8, ge=1)
    episode_gap_windows: int = Field(default=3, ge=1)

    # --- enrichment ------------------------------------------------------
    enrichment_mode: EnrichmentMode = EnrichmentMode.FAKE
    http_timeout_seconds: float = Field(default=2.5, gt=0, le=30)
    http_retries: int = Field(default=2, ge=0, le=5)
    breaker_failure_threshold: int = Field(default=5, ge=1)
    breaker_reset_seconds: float = Field(default=30.0, gt=0)
    cache_ttl_seconds: int = Field(default=900, ge=0)
    open_meteo_url: str = "https://api.open-meteo.com/v1/forecast"
    opencellid_url: str = "https://opencellid.org/cell/get"
    opencellid_api_key: SecretStr = SecretStr("")
    status_feed_url: str = ""  # Statuspage-compatible ".../api/v2/incidents/unresolved.json"

    # --- LLM ---------------------------------------------------------------
    llm_provider: LLMProvider = LLMProvider.FAKE
    llm_base_url: str = "https://api.openai.com/v1"
    llm_api_key: SecretStr = SecretStr("")
    llm_model: str = "gpt-4o-mini"
    llm_embedding_model: str = "text-embedding-3-small"
    llm_timeout_seconds: float = Field(default=30.0, gt=0)
    llm_max_output_tokens: int = Field(default=800, ge=64, le=8192)
    llm_temperature: float = Field(default=0.0, ge=0, le=2)
    rag_top_k: int = Field(default=3, ge=1, le=10)
    min_confidence: float = Field(default=0.55, ge=0, le=1)

    # --- API ---------------------------------------------------------------
    # Comma-separated "tenant:sha256(api_key)" pairs. Only hashes are configured.
    api_keys: str = ""
    max_page_size: int = Field(default=100, ge=1, le=1000)

    @field_validator("api_keys")
    @classmethod
    def _validate_api_keys(cls, v: str) -> str:
        for pair in filter(None, (p.strip() for p in v.split(","))):
            tenant, _, digest = pair.partition(":")
            if not tenant or len(digest) != 64:
                raise ValueError("api_keys entries must be 'tenant:<sha256 hex>'")
        return v

    def api_key_index(self) -> dict[str, str]:
        """Map sha256(api_key) -> tenant."""
        out: dict[str, str] = {}
        for pair in filter(None, (p.strip() for p in self.api_keys.split(","))):
            tenant, _, digest = pair.partition(":")
            out[digest.lower()] = tenant
        return out


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
