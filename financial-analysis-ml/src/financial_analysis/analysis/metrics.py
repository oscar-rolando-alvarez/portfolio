"""Deterministic portfolio risk/return analytics.

All numbers in a report are computed here, in plain numpy/pandas. The optional LLM layer
only *narrates* these values; it is never asked to calculate anything.
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from dataclasses import asdict, dataclass, field

import numpy as np
import pandas as pd


class InsufficientDataError(ValueError):
    """Raised when there is not enough price history to compute metrics."""


@dataclass(frozen=True, slots=True)
class HoldingMetrics:
    symbol: str
    weight: float
    total_return: float
    annualized_volatility: float
    contribution_to_return: float


@dataclass(frozen=True, slots=True)
class PortfolioMetrics:
    observations: int
    total_return: float
    annualized_return: float
    annualized_volatility: float
    sharpe_ratio: float | None
    max_drawdown: float
    value_at_risk_95: float
    best_day: float
    worst_day: float
    holdings: list[HoldingMetrics] = field(default_factory=list)
    concentration_hhi: float = 0.0

    def to_dict(self) -> dict[str, object]:
        return asdict(self)


def _normalize_weights(weights: Mapping[str, float]) -> dict[str, float]:
    if not weights:
        raise InsufficientDataError("At least one holding is required")
    if any(w < 0 for w in weights.values()):
        raise ValueError("Weights must be non-negative (long-only analysis)")
    total = float(sum(weights.values()))
    if total <= 0:
        raise ValueError("Weights must sum to a positive number")
    return {symbol: float(w) / total for symbol, w in weights.items()}


def compute_portfolio_metrics(
    prices: Mapping[str, Sequence[float]],
    weights: Mapping[str, float],
    *,
    risk_free_rate: float = 0.02,
    periods_per_year: int = 252,
) -> PortfolioMetrics:
    """Compute risk/return metrics for a constant-weight (daily rebalanced) portfolio.

    Args:
        prices: closing prices per symbol, oldest first, aligned on the same dates.
        weights: target weight per symbol (normalized to sum to 1).
        risk_free_rate: annual risk-free rate used for the Sharpe ratio.
        periods_per_year: sampling frequency of the price series (252 = daily).
    """
    norm_weights = _normalize_weights(weights)
    missing = set(norm_weights) - set(prices)
    if missing:
        raise ValueError(f"Missing price history for: {', '.join(sorted(missing))}")

    lengths = {len(prices[s]) for s in norm_weights}
    if len(lengths) != 1:
        raise ValueError("All price series must have the same length (aligned dates)")
    if lengths.pop() < 3:
        raise InsufficientDataError("At least 3 price observations are required")

    frame = pd.DataFrame({s: np.asarray(prices[s], dtype=float) for s in norm_weights})
    if (frame <= 0).any().any():
        raise ValueError("Prices must be strictly positive")

    returns = frame.pct_change().dropna()
    w = np.array([norm_weights[s] for s in frame.columns])
    port_returns = returns.to_numpy() @ w

    equity = np.cumprod(1.0 + port_returns)
    total_return = float(equity[-1] - 1.0)
    n = len(port_returns)
    annualized_return = float((1.0 + total_return) ** (periods_per_year / n) - 1.0)
    vol = float(np.std(port_returns, ddof=1) * np.sqrt(periods_per_year))
    sharpe = None if vol == 0 else float((annualized_return - risk_free_rate) / vol)

    running_peak = np.maximum.accumulate(np.concatenate(([1.0], equity)))
    drawdowns = np.concatenate(([1.0], equity)) / running_peak - 1.0
    max_drawdown = float(drawdowns.min())

    var_95 = float(-np.percentile(port_returns, 5))

    holdings = []
    for symbol in frame.columns:
        series = frame[symbol]
        asset_total = float(series.iloc[-1] / series.iloc[0] - 1.0)
        asset_vol = float(returns[symbol].std(ddof=1) * np.sqrt(periods_per_year))
        holdings.append(
            HoldingMetrics(
                symbol=symbol,
                weight=round(norm_weights[symbol], 6),
                total_return=asset_total,
                annualized_volatility=asset_vol,
                contribution_to_return=norm_weights[symbol] * asset_total,
            )
        )
    holdings.sort(key=lambda h: h.contribution_to_return, reverse=True)

    return PortfolioMetrics(
        observations=n + 1,
        total_return=total_return,
        annualized_return=annualized_return,
        annualized_volatility=vol,
        sharpe_ratio=sharpe,
        max_drawdown=max_drawdown,
        value_at_risk_95=var_95,
        best_day=float(port_returns.max()),
        worst_day=float(port_returns.min()),
        holdings=holdings,
        concentration_hhi=float(np.sum(w**2)),
    )
