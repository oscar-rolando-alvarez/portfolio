"""Unit tests for the provider-agnostic narrator adapters."""

from __future__ import annotations

import json
from types import SimpleNamespace
from typing import Any

import pytest
from pydantic import SecretStr

from financial_analysis.analysis.metrics import compute_portfolio_metrics
from financial_analysis.config import Settings
from financial_analysis.genai.factory import build_narrator
from financial_analysis.genai.narrator import (
    DISCLAIMER,
    FakeNarrator,
    NarrativeUnavailableError,
    OpenAICompatibleNarrator,
    PortfolioNarrator,
)

METRICS = compute_portfolio_metrics(
    {"AAPL": [100, 102, 101, 105], "MSFT": [200, 198, 202, 204]},
    {"AAPL": 0.5, "MSFT": 0.5},
)


class _StubCompletions:
    def __init__(self, content: str | None = "Grounded summary.", fail: bool = False) -> None:
        self.content = content
        self.fail = fail
        self.calls: list[dict[str, Any]] = []

    async def create(self, **kwargs: Any) -> Any:
        self.calls.append(kwargs)
        if self.fail:
            raise TimeoutError("upstream timeout")
        message = SimpleNamespace(content=self.content)
        return SimpleNamespace(choices=[SimpleNamespace(message=message)], model="stub-model")


def _client(completions: _StubCompletions) -> Any:
    return SimpleNamespace(chat=SimpleNamespace(completions=completions))


async def test_fake_narrator_is_deterministic_and_grounded():
    narrator = FakeNarrator()

    first = await narrator.narrate(METRICS, portfolio_name="Core")
    second = await narrator.narrate(METRICS, portfolio_name="Core")

    assert first == second
    assert first.text.startswith("Core returned")
    assert f"{METRICS.total_return * 100:.1f}%" in first.text
    assert first.disclaimer == DISCLAIMER
    assert isinstance(narrator, PortfolioNarrator)


async def test_openai_narrator_sends_only_computed_metrics():
    completions = _StubCompletions()
    narrator = OpenAICompatibleNarrator(_client(completions), model="my-model")

    narrative = await narrator.narrate(METRICS, portfolio_name="Core")

    assert narrative.text == "Grounded summary."
    assert narrative.model == "stub-model"
    call = completions.calls[0]
    assert call["model"] == "my-model"
    assert "use ONLY the numbers" in call["messages"][0]["content"]
    payload = json.loads(call["messages"][1]["content"])
    assert payload["metrics"]["total_return"] == pytest.approx(METRICS.total_return)


@pytest.mark.parametrize("completions", [_StubCompletions(fail=True), _StubCompletions("  ")])
async def test_openai_narrator_failures_are_wrapped(completions):
    narrator = OpenAICompatibleNarrator(_client(completions), model="m")

    with pytest.raises(NarrativeUnavailableError):
        await narrator.narrate(METRICS, portfolio_name="Core")


def test_factory_selects_provider():
    assert build_narrator(Settings(llm_provider="disabled")) is None
    assert isinstance(build_narrator(Settings(llm_provider="fake")), FakeNarrator)
    real = build_narrator(
        Settings(
            llm_provider="openai",
            llm_base_url="http://localhost:11434/v1",
            llm_api_key=SecretStr("k"),
            llm_model="llama3.2",
        )
    )
    assert isinstance(real, OpenAICompatibleNarrator)
    assert real.model == "llama3.2"
