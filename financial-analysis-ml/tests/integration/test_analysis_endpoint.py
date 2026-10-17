"""API tests for the analysis/report endpoint."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from financial_analysis.analysis.metrics import PortfolioMetrics
from financial_analysis.api.endpoints.analysis import get_narrator
from financial_analysis.genai.narrator import Narrative, NarrativeUnavailableError

pytestmark = pytest.mark.integration

BODY = {
    "portfolio_name": "Core Tech",
    "holdings": [
        {"symbol": "aapl", "weight": 0.6, "prices": [180, 182, 181, 185, 187]},
        {"symbol": "MSFT", "weight": 0.4, "prices": [400, 398, 405, 410, 409]},
    ],
}


def test_report_with_fake_narrative(client: TestClient):
    response = client.post("/api/v1/analysis/report", json=BODY)

    assert response.status_code == 200
    data = response.json()
    assert data["metrics"]["observations"] == 5
    assert {h["symbol"] for h in data["metrics"]["holdings"]} == {"AAPL", "MSFT"}
    assert data["narrative"]["provider"] == "fake"
    assert data["narrative"]["text"].startswith("Core Tech returned")
    assert "not constitute financial advice" in data["narrative"]["disclaimer"]
    assert data["narrative_error"] is None


def test_report_metrics_only(client: TestClient):
    response = client.post("/api/v1/analysis/report", json={**BODY, "include_narrative": False})

    assert response.status_code == 200
    assert response.json()["narrative"] is None


def test_report_when_narrator_disabled(client: TestClient):
    client.app.dependency_overrides[get_narrator] = lambda: None  # type: ignore[attr-defined]

    data = client.post("/api/v1/analysis/report", json=BODY).json()

    assert data["narrative"] is None
    assert "disabled" in data["narrative_error"]


def test_report_degrades_gracefully_when_provider_fails(client: TestClient):
    class FailingNarrator:
        async def narrate(self, metrics: PortfolioMetrics, *, portfolio_name: str) -> Narrative:
            raise NarrativeUnavailableError("LLM provider request failed")

    client.app.dependency_overrides[get_narrator] = FailingNarrator  # type: ignore[attr-defined]

    response = client.post("/api/v1/analysis/report", json=BODY)

    assert response.status_code == 200
    assert response.json()["metrics"]["total_return"] != 0
    assert response.json()["narrative_error"] == "LLM provider request failed"


@pytest.mark.parametrize(
    "holdings",
    [
        [
            {"symbol": "A", "weight": 1, "prices": [1, 2, 3]},
            {"symbol": "B", "weight": 1, "prices": [1, 2]},
        ],
        [
            {"symbol": "A", "weight": 1, "prices": [1, 2, 3]},
            {"symbol": "a", "weight": 1, "prices": [1, 2, 3]},
        ],
        [{"symbol": "A", "weight": 1, "prices": [1, -2, 3]}],
    ],
)
def test_report_rejects_invalid_input(client: TestClient, holdings):
    response = client.post("/api/v1/analysis/report", json={"holdings": holdings})

    assert response.status_code == 422
