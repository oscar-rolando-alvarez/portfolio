"""Typed application settings (12-factor, environment driven)."""

from __future__ import annotations

from functools import lru_cache
from typing import Literal

from pydantic import Field, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_name: str = "graphql-recommendation-api"
    environment: Literal["development", "test", "production"] = "development"
    log_level: str = "INFO"
    log_json: bool = True

    database_url: str = "sqlite+aiosqlite:///./recommender.db"
    db_echo: bool = False
    seed_demo_data: bool = True

    # Optional Redis cache for recommendation results; in-process TTL cache when unset.
    redis_url: str | None = None
    cache_ttl_seconds: int = 300

    jwt_secret_key: SecretStr = SecretStr("change-me-in-production")
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 60

    cors_origins: list[str] = Field(default_factory=lambda: ["http://localhost:3000"])
    graphql_max_depth: int = 8
    graphql_ide: bool = True

    # Embeddings (provider-agnostic, OpenAI-compatible API)
    embedding_provider: Literal["fake", "openai"] = "fake"
    llm_base_url: str | None = None
    llm_api_key: SecretStr | None = None
    embedding_model: str = "text-embedding-3-small"
    embedding_dimensions: int = 512
    embedding_send_dimensions: bool = True
    llm_timeout_seconds: float = 20.0
    llm_max_retries: int = 2

    # Vector store: in-process NumPy index by default, Qdrant optional.
    vector_store: Literal["memory", "qdrant"] = "memory"
    qdrant_url: str | None = None
    qdrant_api_key: SecretStr | None = None
    qdrant_collection: str = "items"

    # Hybrid recommender weights
    weight_collaborative: float = 0.4
    weight_content: float = 0.2
    weight_semantic: float = 0.3
    weight_popularity: float = 0.1


@lru_cache
def get_settings() -> Settings:
    return Settings()
