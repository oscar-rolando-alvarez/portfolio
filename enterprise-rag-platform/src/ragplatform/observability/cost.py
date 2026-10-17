"""Per-tenant cost accounting: every model call becomes a ``UsageEvent`` in the ledger."""

from __future__ import annotations

from ragplatform.config import Settings
from ragplatform.domain.models import TokenUsage, UsageEvent
from ragplatform.domain.ports import UsageLedger


class CostMeter:
    def __init__(self, settings: Settings, ledger: UsageLedger) -> None:
        self._settings = settings
        self._ledger = ledger

    def price(self, model: str, input_tokens: int, output_tokens: int) -> float:
        p = self._settings.price_for(model)
        return (input_tokens * p.get("input", 0.0) + output_tokens * p.get("output", 0.0)) / 1000

    async def charge(
        self,
        *,
        tenant_id: str,
        subject: str | None,
        operation: str,
        model: str,
        input_tokens: int,
        output_tokens: int,
        latency_ms: float,
    ) -> TokenUsage:
        cost = self.price(model, input_tokens, output_tokens)
        await self._ledger.record(
            UsageEvent(
                tenant_id=tenant_id,
                subject=subject,
                operation=operation,
                model=model,
                input_tokens=input_tokens,
                output_tokens=output_tokens,
                cost_usd=cost,
                latency_ms=latency_ms,
            )
        )
        return TokenUsage(input_tokens, output_tokens, cost)
