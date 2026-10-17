"""Output guardrails for LLM diagnoses.

1. Schema: the response must parse and validate against ``Diagnosis``.
2. Grounding: device ids and runbook ids must come from the provided context;
   hallucinated ids are removed (and redacted from free text).
3. Abstention: low confidence or ``insufficient_evidence`` => refused, the
   incident goes to human review instead of auto-remediation.
4. Business policy: remote-fixable root causes never request a truck roll.
5. Privacy: customer-facing text must not leak device ids or IMSI-like numbers.
6. Localization: translations must cover the same remediation steps and get the
   same redactions as the primary (English) text; incomplete ones are dropped.
7. Prompt-injection: untrusted evidence strings that look like instructions
   are flagged before prompting and reported in the guardrail notes.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Literal

from pydantic import ValidationError

from fleetintel.domain import Diagnosis, LocalizedDiagnosis, RootCause

DEVICE_ID_RE = re.compile(r"\bdev-\d{8,9}\b")
IMSI_RE = re.compile(r"\b\d{14,15}\b")
INJECTION_RE = re.compile(
    r"(ignore (all|any|previous|prior)|disregard (the|all)|system prompt|you are now|</?evidence>|act as)",
    re.IGNORECASE,
)
REMOTE_FIXABLE = {
    RootCause.APN_ERROR,
    RootCause.ROAMING_MISCONFIG,
    RootCause.CONGESTION,
    RootCause.CELL_OUTAGE,
}


@dataclass
class GuardrailResult:
    status: Literal["passed", "refused", "repaired"]
    diagnosis: Diagnosis | None
    notes: list[str] = field(default_factory=list)


def parse(content: str) -> tuple[Diagnosis | None, str | None]:
    try:
        return Diagnosis.model_validate_json(content), None
    except ValidationError as exc:
        return None, "; ".join(
            f"{'.'.join(map(str, e['loc']))}: {e['msg']}" for e in exc.errors()[:5]
        )


def find_injection(strings: list[str]) -> list[str]:
    return [s[:80] for s in strings if INJECTION_RE.search(s)]


def enforce(
    d: Diagnosis,
    allowed_device_ids: set[str],
    allowed_runbooks: set[str],
    min_confidence: float,
) -> GuardrailResult:
    notes: list[str] = []
    repaired = False

    bad_ids = [i for i in d.referenced_device_ids if i not in allowed_device_ids]
    if bad_ids:
        notes.append(f"removed {len(bad_ids)} device id(s) not present in the evidence")
        repaired = True

    def scrub(text: str) -> str:
        return DEVICE_ID_RE.sub(
            lambda m: m.group(0) if m.group(0) in allowed_device_ids else "[unknown-device]", text
        )

    evidence = [scrub(e) for e in d.evidence]
    summary = scrub(d.summary)
    if evidence != d.evidence or summary != d.summary:
        notes.append("redacted ungrounded device ids from free text")
        repaired = True

    runbooks = [r for r in d.runbook_ids if r in allowed_runbooks]
    if len(runbooks) != len(d.runbook_ids):
        notes.append("removed runbook ids that were not retrieved")
        repaired = True

    customer = IMSI_RE.sub("[redacted]", DEVICE_ID_RE.sub("[device]", d.customer_message))
    if customer != d.customer_message:
        notes.append("redacted identifiers from the customer message")
        repaired = True

    translations: dict[str, LocalizedDiagnosis] = {}
    for loc, tr in d.translations.items():
        if len(tr.remediation_actions) != len(d.remediation_steps):
            notes.append(f"dropped {loc} translation: remediation steps do not match")
            repaired = True
            continue
        fixed_tr = tr.model_copy(
            update={
                "summary": scrub(tr.summary),
                "evidence": [scrub(e) for e in tr.evidence],
                "remediation_actions": [scrub(a) for a in tr.remediation_actions],
                "customer_message": IMSI_RE.sub(
                    "[redacted]", DEVICE_ID_RE.sub("[device]", tr.customer_message)
                ),
            }
        )
        if fixed_tr != tr:
            notes.append(f"redacted identifiers from the {loc} translation")
            repaired = True
        translations[loc] = fixed_tr

    truck_roll = d.truck_roll_required
    if truck_roll and d.root_cause in REMOTE_FIXABLE:
        truck_roll = False
        notes.append(
            f"truck roll overridden: {d.root_cause.value} is remotely fixable per runbook policy"
        )
        repaired = True

    fixed = d.model_copy(
        update={
            "referenced_device_ids": [
                i for i in d.referenced_device_ids if i in allowed_device_ids
            ],
            "evidence": evidence,
            "summary": summary,
            "runbook_ids": runbooks,
            "customer_message": customer,
            "truck_roll_required": truck_roll,
            "translations": translations,
        }
    )
    if fixed.root_cause is RootCause.INSUFFICIENT_EVIDENCE:
        notes.append("model abstained: insufficient evidence")
        return GuardrailResult("refused", fixed, notes)
    if fixed.confidence < min_confidence:
        notes.append(f"confidence {fixed.confidence:.2f} below threshold {min_confidence:.2f}")
        return GuardrailResult("refused", fixed, notes)
    return GuardrailResult("repaired" if repaired else "passed", fixed, notes)
