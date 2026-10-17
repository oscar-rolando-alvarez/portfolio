"""Schemas for the portfolio analysis/report endpoint."""

from __future__ import annotations

from typing import Self

from pydantic import BaseModel, ConfigDict, Field, model_validator


class HoldingInput(BaseModel):
    symbol: str = Field(min_length=1, max_length=20, examples=["AAPL"])
    weight: float = Field(gt=0, description="Relative weight; weights are normalized to 1")
    prices: list[float] = Field(
        min_length=3,
        max_length=5000,
        description="Closing prices, oldest first, aligned on the same dates for all holdings",
    )


class AnalysisRequest(BaseModel):
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "portfolio_name": "Core Tech",
                "include_narrative": True,
                "holdings": [
                    {"symbol": "AAPL", "weight": 0.6, "prices": [180, 182, 181, 185, 187]},
                    {"symbol": "MSFT", "weight": 0.4, "prices": [400, 398, 405, 410, 409]},
                ],
            }
        }
    )

    portfolio_name: str = Field(default="Portfolio", max_length=100)
    holdings: list[HoldingInput] = Field(min_length=1, max_length=50)
    include_narrative: bool = True

    @model_validator(mode="after")
    def _check_alignment(self) -> Self:
        symbols = [h.symbol.upper() for h in self.holdings]
        if len(set(symbols)) != len(symbols):
            raise ValueError("Duplicate symbols in holdings")
        if len({len(h.prices) for h in self.holdings}) != 1:
            raise ValueError("All holdings must have the same number of prices")
        return self


class HoldingMetricsOut(BaseModel):
    symbol: str
    weight: float
    total_return: float
    annualized_volatility: float
    contribution_to_return: float


class MetricsOut(BaseModel):
    observations: int
    total_return: float
    annualized_return: float
    annualized_volatility: float
    sharpe_ratio: float | None
    max_drawdown: float
    value_at_risk_95: float
    best_day: float
    worst_day: float
    concentration_hhi: float
    holdings: list[HoldingMetricsOut]


class NarrativeOut(BaseModel):
    text: str
    provider: str
    model: str
    disclaimer: str


class AnalysisReport(BaseModel):
    portfolio_name: str
    metrics: MetricsOut
    narrative: NarrativeOut | None = None
    narrative_error: str | None = None
