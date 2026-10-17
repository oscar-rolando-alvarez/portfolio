"""Portfolio analytics + optional GenAI narrative report."""

from __future__ import annotations

from dataclasses import asdict
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, status

from financial_analysis.analysis.metrics import InsufficientDataError, compute_portfolio_metrics
from financial_analysis.api.schemas.analysis_schemas import (
    AnalysisReport,
    AnalysisRequest,
    MetricsOut,
    NarrativeOut,
)
from financial_analysis.config import Settings, get_settings
from financial_analysis.genai.narrator import NarrativeUnavailableError, PortfolioNarrator

router = APIRouter(prefix="/analysis", tags=["Analysis"])


def get_narrator(request: Request) -> PortfolioNarrator | None:
    """Narrator built once at startup (see lifespan); None when disabled."""
    narrator: PortfolioNarrator | None = getattr(request.app.state, "narrator", None)
    return narrator


@router.post("/report", response_model=AnalysisReport)
async def portfolio_report(
    body: AnalysisRequest,
    settings: Annotated[Settings, Depends(get_settings)],
    narrator: Annotated[PortfolioNarrator | None, Depends(get_narrator)],
) -> AnalysisReport:
    """Compute risk/return metrics and, optionally, an LLM-written narrative.

    Metrics are always computed deterministically. If the narrative provider is disabled or
    fails, the metrics are still returned together with `narrative_error`.
    """
    try:
        metrics = compute_portfolio_metrics(
            {h.symbol.upper(): h.prices for h in body.holdings},
            {h.symbol.upper(): h.weight for h in body.holdings},
            risk_free_rate=settings.risk_free_rate,
            periods_per_year=settings.trading_days_per_year,
        )
    except (InsufficientDataError, ValueError) as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, detail=str(exc)) from exc

    report = AnalysisReport(
        portfolio_name=body.portfolio_name,
        metrics=MetricsOut.model_validate(asdict(metrics)),
    )
    if not body.include_narrative:
        return report
    if narrator is None:
        report.narrative_error = "Narrative generation is disabled (LLM_PROVIDER=disabled)"
        return report
    try:
        narrative = await narrator.narrate(metrics, portfolio_name=body.portfolio_name)
    except NarrativeUnavailableError as exc:
        report.narrative_error = str(exc)
        return report
    report.narrative = NarrativeOut.model_validate(asdict(narrative))
    return report
