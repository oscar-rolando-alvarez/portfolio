"""Application settings loaded from environment variables (12-factor)."""

from __future__ import annotations

from functools import lru_cache
from typing import Literal

from pydantic import Field, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Typed runtime configuration. Every field can be overridden via env or `.env`."""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_name: str = "financial-analysis-ml"
    environment: Literal["development", "test", "production"] = "development"
    log_level: str = "INFO"
    log_json: bool = True

    database_url: str = "sqlite+aiosqlite:///./financial_analysis.db"
    db_echo: bool = False

    jwt_secret_key: SecretStr = SecretStr("change-me-in-production")
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 30

    allowed_origins: list[str] = Field(default_factory=lambda: ["http://localhost:3000"])

    # GenAI narrative reports (provider-agnostic, OpenAI-compatible API)
    llm_provider: Literal["fake", "openai", "disabled"] = "fake"
    llm_base_url: str | None = None
    llm_api_key: SecretStr | None = None
    llm_model: str = "gpt-4o-mini"
    llm_timeout_seconds: float = 30.0
    llm_max_retries: int = 2
    llm_temperature: float = 0.2

    # Risk analytics defaults
    risk_free_rate: float = 0.02
    trading_days_per_year: int = 252


@lru_cache
def get_settings() -> Settings:
    """Return the cached settings singleton (override in tests via dependency_overrides)."""
    return Settings()
