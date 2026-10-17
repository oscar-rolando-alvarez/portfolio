"""Unit tests for deterministic portfolio metrics."""

from __future__ import annotations

import math

import pytest

from financial_analysis.analysis.metrics import InsufficientDataError, compute_portfolio_metrics


def test_single_asset_monotonic_growth():
    metrics = compute_portfolio_metrics({"AAA": [100, 110, 121]}, {"AAA": 1.0})

    assert metrics.observations == 3
    assert metrics.total_return == pytest.approx(0.21)
    assert metrics.max_drawdown == 0.0
    assert metrics.annualized_volatility == pytest.approx(0.0, abs=1e-12)
    assert metrics.sharpe_ratio is None  # zero volatility -> undefined Sharpe
    assert metrics.concentration_hhi == pytest.approx(1.0)


def test_weights_are_normalized_and_contributions_sorted():
    metrics = compute_portfolio_metrics(
        {"UP": [100, 105, 110, 120], "DOWN": [50, 49, 48, 45]},
        {"UP": 3, "DOWN": 1},
    )

    weights = {h.symbol: h.weight for h in metrics.holdings}
    assert weights == {"UP": 0.75, "DOWN": 0.25}
    assert [h.symbol for h in metrics.holdings] == ["UP", "DOWN"]
    assert metrics.holdings[1].total_return == pytest.approx(-0.1)
    assert metrics.concentration_hhi == pytest.approx(0.625)


def test_drawdown_and_var_capture_losses():
    metrics = compute_portfolio_metrics({"X": [100, 120, 60, 90, 100]}, {"X": 1})

    assert metrics.max_drawdown == pytest.approx(-0.5)
    assert metrics.worst_day == pytest.approx(-0.5)
    assert metrics.value_at_risk_95 > 0
    assert math.isfinite(metrics.sharpe_ratio or 0.0)


@pytest.mark.parametrize(
    ("prices", "weights", "error"),
    [
        ({"A": [1, 2]}, {"A": 1}, InsufficientDataError),
        ({"A": [1, 2, 3]}, {}, InsufficientDataError),
        ({"A": [1, 2, 3]}, {"B": 1}, ValueError),
        ({"A": [1, 2, 3], "B": [1, 2]}, {"A": 1, "B": 1}, ValueError),
        ({"A": [1, 0, 3]}, {"A": 1}, ValueError),
        ({"A": [1, 2, 3]}, {"A": -1}, ValueError),
        ({"A": [1, 2, 3]}, {"A": 0}, ValueError),
    ],
)
def test_invalid_inputs_raise(prices, weights, error):
    with pytest.raises(error):
        compute_portfolio_metrics(prices, weights)
