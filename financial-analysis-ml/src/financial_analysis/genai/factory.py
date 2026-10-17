"""Builds the configured `PortfolioNarrator` from settings."""

from __future__ import annotations

from financial_analysis.config import Settings
from financial_analysis.genai.narrator import (
    FakeNarrator,
    OpenAICompatibleNarrator,
    PortfolioNarrator,
)


def build_narrator(settings: Settings) -> PortfolioNarrator | None:
    """Return a narrator for `LLM_PROVIDER`, or None when narratives are disabled."""
    match settings.llm_provider:
        case "disabled":
            return None
        case "fake":
            return FakeNarrator()
        case "openai":
            from openai import AsyncOpenAI

            api_key = settings.llm_api_key.get_secret_value() if settings.llm_api_key else None
            client = AsyncOpenAI(
                base_url=settings.llm_base_url,
                # Local OpenAI-compatible servers (e.g. Ollama) accept any key.
                api_key=api_key or "not-needed",
                timeout=settings.llm_timeout_seconds,
                max_retries=settings.llm_max_retries,
            )
            return OpenAICompatibleNarrator(
                client, model=settings.llm_model, temperature=settings.llm_temperature
            )
