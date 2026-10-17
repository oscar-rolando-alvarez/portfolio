"""Bilingual diagnoses: one LLM call returns English + native Spanish text."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

import pytest
from pydantic import ValidationError

from fleetintel.config import Settings
from fleetintel.diagnosis import guardrails
from fleetintel.diagnosis.i18n import ES_CUSTOMER, ES_REMEDIATION
from fleetintel.diagnosis.llm import _CUSTOMER, _REMEDIATION, FakeDiagnosisModel
from fleetintel.diagnosis.rag import HashingEmbeddings, RunbookIndex
from fleetintel.diagnosis.service import DiagnosisService, build_prompt
from fleetintel.domain import Diagnosis, LocalizedDiagnosis, RemediationStep, RootCause
from fleetintel.enrichment.providers import hash32, site_location
from test_resilience_enrichment import make_incident, service


def svc(locales: tuple[str, ...] = ("en", "es"), model: Any = None) -> DiagnosisService:
    return DiagnosisService(
        llm=model or FakeDiagnosisModel(),
        index=RunbookIndex(HashingEmbeddings()),
        clock=lambda: datetime(2026, 10, 1, tzinfo=UTC),
        output_locales=locales,
    )


def test_spanish_tables_mirror_english_tables() -> None:
    assert set(ES_REMEDIATION) == {*_REMEDIATION, "insufficient_evidence"}
    for root, steps in _REMEDIATION.items():
        assert len(ES_REMEDIATION[root]) == len(steps), root
    assert set(ES_CUSTOMER) == set(_CUSTOMER)


def test_one_call_returns_both_languages() -> None:
    inc = make_incident()
    model = FakeDiagnosisModel()
    rec = svc(model=model).diagnose(inc, service().enrich(inc))
    assert model.calls == 1
    d = rec.diagnosis
    assert d.root_cause is RootCause.CELL_OUTAGE and rec.guardrail_status == "passed"
    es = d.translations["es"]
    assert len(es.remediation_actions) == len(d.remediation_steps)
    assert "caída de celda" in es.summary and es.customer_message == ES_CUSTOMER["cell_outage"]
    loc = d.localized("es")
    assert loc.summary == es.summary and loc.root_cause is d.root_cause
    assert [s.owner for s in loc.remediation_steps] == [s.owner for s in d.remediation_steps]
    assert loc.remediation_steps[0].action == es.remediation_actions[0]
    assert d.localized("en") is d and d.localized("fr") is d


def test_prompt_lists_output_locales_only_when_requested() -> None:
    inc = make_incident()
    assert "<output_locales>es</output_locales>" in build_prompt(inc, None, [], ("es",))
    assert build_prompt(inc, None, []).startswith("<evidence>")
    rec = svc(("en",)).diagnose(inc, None)
    assert rec.diagnosis.translations == {}
    assert not any("translation missing" in n for n in rec.guardrail_notes)


def test_precheck_refusal_is_bilingual() -> None:
    inc = make_incident().model_copy(update={"affected_devices": 2})
    rec = svc().diagnose(inc, None)
    assert rec.guardrail_status == "refused"
    assert rec.diagnosis.translations["es"].customer_message.startswith("Estamos investigando")


def test_unsupported_locale_rejected() -> None:
    with pytest.raises(ValueError, match="unsupported"):
        svc(("en", "fr"))
    with pytest.raises(ValidationError):
        Settings(diagnosis_locales="en,de")
    assert Settings(diagnosis_locales=" es , en ").locale_list() == ("es", "en")


def _diag(**tr: object) -> Diagnosis:
    base: dict[str, object] = {
        "summary": "Posible caída en la celda",
        "evidence": ["dev-00000099 sin servicio"],
        "remediation_actions": ["Abrir ticket"],
        "customer_message": "Equipo dev-00000001 e IMSI 310260123456789 afectados.",
    }
    base.update(tr)
    return Diagnosis(
        root_cause=RootCause.CELL_OUTAGE,
        confidence=0.9,
        summary="Cell outage on the cell",
        evidence=["no_service_ratio high"],
        remediation_steps=[RemediationStep(order=1, action="Open ticket", owner="noc")],
        truck_roll_required=False,
        customer_message="We are on it, no action needed.",
        translations={"es": LocalizedDiagnosis.model_validate(base)},
    )


def test_guardrails_scrub_and_validate_translations() -> None:
    r = guardrails.enforce(_diag(), {"dev-00000001"}, set(), 0.5)
    assert r.diagnosis is not None and r.status == "repaired"
    es = r.diagnosis.translations["es"]
    assert "[unknown-device]" in es.evidence[0]
    assert "dev-00000001" not in es.customer_message and "[redacted]" in es.customer_message
    bad = guardrails.enforce(_diag(remediation_actions=["a1x", "a2x"]), set(), set(), 0.5)
    assert bad.diagnosis is not None and "es" not in bad.diagnosis.translations
    assert any("dropped es translation" in n for n in bad.notes)


class _Monolingual(FakeDiagnosisModel):
    """A model that ignores <output_locales> (e.g. a weak local model)."""

    @staticmethod
    def _reason(
        ev: dict[str, Any], runbooks: list[str], locales: list[str] | None = None
    ) -> dict[str, Any]:
        return FakeDiagnosisModel._reason(ev, runbooks, [])


def test_missing_translation_is_noted_and_served_in_english() -> None:
    rec = svc(("es",), model=_Monolingual()).diagnose(make_incident(), None)
    assert any("translation missing for es" in n for n in rec.guardrail_notes)
    assert rec.diagnosis.localized("es") is rec.diagnosis


# Golden vectors shared with the dashboard's TypeScript port (dashboard/src/lib/geo.test.ts).
GEO_GOLDEN = {
    "310-260-1000-100000": (38.6447, -104.2014),
    "310-260-1003-100200": (35.9238, -101.3292),
    "262-01-1000-100005": (48.707, 8.5388),
}


def test_site_location_golden_vectors_and_clustering() -> None:
    assert hash32("abc") == 482950588 and hash32("") == 2872998923
    for cell, expected in GEO_GOLDEN.items():
        assert site_location(cell) == expected
    a, b = site_location("310-260-1004-100260"), site_location("310-260-1004-100261")
    assert abs(a[0] - b[0]) <= 0.8 and abs(a[1] - b[1]) <= 1.1  # same tracking area
