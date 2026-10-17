"""Provider-agnostic narrative generation for portfolio analytics.

`PortfolioNarrator` is the port; adapters:

* `FakeNarrator` - deterministic, template-based. Default for local dev and tests.
* `OpenAICompatibleNarrator` - any OpenAI-compatible Chat Completions endpoint
  (OpenAI, Azure OpenAI, Ollama, vLLM, LM Studio, a LiteLLM proxy, ...).

The LLM receives only pre-computed metrics as JSON and is instructed to narrate them,
never to compute or invent numbers (grounded generation).
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from typing import TYPE_CHECKING, Protocol, runtime_checkable

import structlog

from financial_analysis.analysis.metrics import PortfolioMetrics

if TYPE_CHECKING:
    from openai import AsyncOpenAI

logger = structlog.get_logger(__name__)

DISCLAIMER = (
    "This report is generated automatically for informational purposes only and "
    "does not constitute financial advice."
)

SYSTEM_PROMPT = (
    "You are a buy-side portfolio analyst. Write a concise, neutral report (max 180 words) "
    "about the portfolio described by the JSON metrics you receive. Rules: use ONLY the numbers "
    "provided; do not compute new figures or invent data; express ratios as percentages with one "
    "decimal; cover performance, risk (volatility, drawdown, VaR), concentration and the "
    "top/bottom contributors; never give buy/sell recommendations."
)


class NarrativeUnavailableError(RuntimeError):
    """Raised when narrative generation is disabled or the provider failed."""


@dataclass(frozen=True, slots=True)
class Narrative:
    text: str
    provider: str
    model: str
    disclaimer: str = DISCLAIMER


@runtime_checkable
class PortfolioNarrator(Protocol):
    """Port: turns computed metrics into a human-readable narrative."""

    async def narrate(self, metrics: PortfolioMetrics, *, portfolio_name: str) -> Narrative: ...


def _pct(value: float) -> str:
    return f"{value * 100:.1f}%"


class FakeNarrator:
    """Deterministic template narrator: same metrics in, same text out."""

    provider = "fake"
    model = "template-v1"

    async def narrate(self, metrics: PortfolioMetrics, *, portfolio_name: str) -> Narrative:
        top = metrics.holdings[0]
        bottom = metrics.holdings[-1]
        sharpe = "n/a" if metrics.sharpe_ratio is None else f"{metrics.sharpe_ratio:.2f}"
        concentration = (
            "highly concentrated"
            if metrics.concentration_hhi >= 0.25
            else "moderately diversified"
            if metrics.concentration_hhi >= 0.15
            else "well diversified"
        )
        text = (
            f"{portfolio_name} returned {_pct(metrics.total_return)} over "
            f"{metrics.observations} observations ({_pct(metrics.annualized_return)} annualized) "
            f"with {_pct(metrics.annualized_volatility)} annualized volatility and a Sharpe ratio "
            f"of {sharpe}. The maximum drawdown was {_pct(metrics.max_drawdown)} and the one-day "
            f"95% historical VaR is {_pct(metrics.value_at_risk_95)}. The portfolio is "
            f"{concentration} (HHI {metrics.concentration_hhi:.2f}). {top.symbol} was the largest "
            f"contributor ({_pct(top.contribution_to_return)}), while {bottom.symbol} contributed "
            f"the least ({_pct(bottom.contribution_to_return)})."
        )
        return Narrative(text=text, provider=self.provider, model=self.model)


class OpenAICompatibleNarrator:
    """Narrator backed by any OpenAI-compatible Chat Completions API."""

    provider = "openai-compatible"

    def __init__(self, client: AsyncOpenAI, model: str, temperature: float = 0.2) -> None:
        self._client = client
        self.model = model
        self._temperature = temperature

    async def narrate(self, metrics: PortfolioMetrics, *, portfolio_name: str) -> Narrative:
        payload = {"portfolio_name": portfolio_name, "metrics": metrics.to_dict()}
        try:
            completion = await self._client.chat.completions.create(
                model=self.model,
                temperature=self._temperature,
                messages=[
                    {"role": "system", "content": SYSTEM_PROMPT},
                    {"role": "user", "content": json.dumps(payload, default=float)},
                ],
            )
        except Exception as exc:
            logger.warning("llm.narrate.failed", error=type(exc).__name__)
            raise NarrativeUnavailableError("LLM provider request failed") from exc

        text = (completion.choices[0].message.content or "").strip()
        if not text:
            raise NarrativeUnavailableError("LLM provider returned an empty response")
        return Narrative(text=text, provider=self.provider, model=completion.model or self.model)
