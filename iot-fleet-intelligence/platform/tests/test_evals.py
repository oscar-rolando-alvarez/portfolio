"""Unit tests for the eval harness scoring (the full gate runs in CI with the Go simulator)."""

from __future__ import annotations

import json
from datetime import timedelta
from pathlib import Path
from typing import Any

from conftest import CELL, T0, stream
from fleetintel.evals.harness import (
    Label,
    eval_container,
    load_labels,
    replay,
    run_workers,
    score,
    summarize,
    to_markdown,
)

THRESHOLDS = {
    "detection_precision": 0.9,
    "detection_recall": 0.9,
    "diagnosis_accuracy": 0.9,
    "guardrail_pass_rate_min": 0.9,
    "baseline_false_positives_max": 0,
    "per_fault_recall_min": 1.0,
}


def outage(_: int, kw: dict[str, Any]) -> None:
    kw.update(conn_state="no_service", rsrp=-140.0, sinr=-20.0, latency_ms=0)


def write_jsonl(path: Path, events: list[Any]) -> None:
    path.write_text("\n".join(e.model_dump_json() for e in events) + "\n")


def test_replay_score_and_gate(tmp_path: Path) -> None:
    data = tmp_path / "s.jsonl"
    write_jsonl(data, stream(windows=20, fault=outage, fault_from=10))
    labels = tmp_path / "s.labels.json"
    labels.write_text(
        json.dumps(
            {
                "faults": [
                    {
                        "fault_type": "cell_outage",
                        "scope_type": "cell",
                        "scope": CELL,
                        "start": (T0 + timedelta(minutes=10)).isoformat(),
                        "end": (T0 + timedelta(minutes=20)).isoformat(),
                    }
                ]
            }
        )
    )
    c = eval_container()
    assert replay(data, c, partitions=2, batch_size=150) == 800
    run_workers(c)
    res = score("s", load_labels(labels), c, timedelta(minutes=2), timedelta(seconds=30))
    assert res.matched_labels == [f"cell_outage@{CELL}"] and res.false_positives == []
    assert res.diagnoses[0]["root_cause"] == "cell_outage"
    assert res.diagnoses[0]["detection_delay_s"] == 90.0

    summary = summarize([res], THRESHOLDS)
    assert summary["passed"] and summary["metrics"]["detection_recall"] == 1.0
    assert "PASSED" in to_markdown(summary, [res])


def test_gate_fails_on_missed_and_false_positive(tmp_path: Path) -> None:
    data = tmp_path / "b.jsonl"
    write_jsonl(data, stream(windows=20, fault=outage, fault_from=10))
    c = eval_container()
    replay(data, c, partitions=1, batch_size=500)
    run_workers(c)
    wrong = [Label("apn_error", "apn", "x", T0, T0 + timedelta(minutes=5))]
    res = score("b", wrong, c, timedelta(minutes=2), timedelta(seconds=30))
    assert res.missed_labels == ["apn_error@x"] and len(res.false_positives) == 1
    baseline = score("baseline", [], c, timedelta(minutes=2), timedelta(seconds=30))
    summary = summarize([res, baseline], THRESHOLDS)
    assert not summary["passed"]
    assert any("baseline_false_positives" in f for f in summary["failures"])
    assert any("recall[apn_error]" in f for f in summary["failures"])
    assert "FAILED" in to_markdown(summary, [res, baseline])
