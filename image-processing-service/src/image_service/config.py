"""Typed settings from environment variables."""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import Field, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_name: str = "image-processing-service"
    environment: Literal["development", "test", "production"] = "development"
    log_level: str = "INFO"
    log_json: bool = True
    cors_origins: list[str] = Field(default_factory=lambda: ["http://localhost:3000"])

    # Upload safety limits
    max_upload_mb: float = 10.0
    max_pixels: int = 40_000_000
    max_output_dimension: int = 8000
    allowed_formats: list[str] = Field(
        default_factory=lambda: ["JPEG", "PNG", "WEBP", "GIF", "BMP", "TIFF"]
    )

    # Local storage for uploaded originals
    storage_dir: Path = Path("./data/images")

    # Vision captioning (provider-agnostic, OpenAI-compatible API)
    vision_provider: Literal["fake", "openai", "disabled"] = "fake"
    llm_base_url: str | None = None
    llm_api_key: SecretStr | None = None
    llm_vision_model: str = "gpt-4o-mini"
    llm_timeout_seconds: float = 30.0
    llm_max_retries: int = 2
    vision_max_side: int = 1024

    # Optional AI extras
    ocr_languages: str = "eng"
    detection_model: str = "yolo11n.pt"
    detection_confidence: float = 0.35

    @property
    def max_upload_bytes(self) -> int:
        return int(self.max_upload_mb * 1024 * 1024)


@lru_cache
def get_settings() -> Settings:
    return Settings()
