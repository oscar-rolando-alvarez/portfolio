"""Offline evaluation harness: simulated faults -> detection + diagnosis metrics.

For each golden scenario the Go simulator generates deterministic telemetry
plus a ground-truth manifest. The harness replays the telemetry through the
*real* Lambda code paths (stream processor with Kafka-like partitioning and
batching, enrichment and diagnosis workers via SQS-shaped events) wired to
in-memory adapters, then scores:

* detection precision / recall per fault type (incident episodes vs labels),
* diagnosis root-cause accuracy on detected faults,
* guardrail pass rate, LLM calls and tokens,
* false positives on the fault-free baseline.

The CI gate uses the deterministic fake LLM. Point ``FLEETINTEL_LLM_PROVIDER``
at an OpenAI-compatible endpoint to evaluate a real model with the same data.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import subprocess
import sys
import tempfile
import time
import warnings
import zlib
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any

import yaml

from fleetintel.bootstrap import Container, build_container
from fleetintel.config import Backend, Settings
from fleetintel.domain import Incident
from fleetintel.handlers.stream import flush_shard, process_shard
from fleetintel.handlers.workers import process_diagnosis, process_enrichment


@dataclass
class Label:
    fault_type: str
    scope_type: str
    scope: str
    start: datetime
    end: datetime


@dataclass
class ScenarioResult:
    name: str
    labels: int
    incidents: int
    matched_labels: list[str] = field(default_factory=list)
    missed_labels: list[str] = field(default_factory=list)
    false_positives: list[str] = field(default_factory=list)
    diagnoses: list[dict[str, Any]] = field(default_factory=list)
    events: int = 0
    seconds: float = 0.0


def generate(
    simulator: str, scenario: Path, sim: dict[str, Any], out_dir: Path
) -> tuple[Path, Path]:
    data, labels = out_dir / f"{scenario.stem}.jsonl", out_dir / f"{scenario.stem}.labels.json"
    cmd = [
        simulator,
        "-devices",
        str(sim["devices"]),
        "-duration",
        str(sim["duration"]),
        "-seed",
        str(sim["seed"]),
        "-tenant",
        sim["tenant"],
        "-shards",
        str(sim.get("shards", 1)),
        "-scenario",
        str(scenario),
        "-sink",
        "file",
        "-out",
        str(data),
        "-labels",
        str(labels),
        "-progress",
        "0",
        "-quiet",
    ]
    subprocess.run(cmd, check=True, capture_output=True)  # noqa: S603 - operator-supplied binary
    return data, labels


def eval_container() -> Container:
    return build_container(Settings(backend=Backend.MEMORY))


def _sqs_event(messages: list[dict[str, Any]]) -> dict[str, Any]:
    return {
        "Records": [
            {
                "messageId": f"m-{n}",
                "receiptHandle": f"r-{n}",
                "body": json.dumps(m),
                "attributes": {"ApproximateReceiveCount": "1"},
                "messageAttributes": {},
                "md5OfBody": "",
                "eventSource": "aws:sqs",
                "eventSourceARN": "arn:aws:sqs:local:000000000000:jobs",
                "awsRegion": "us-east-1",
            }
            for n, m in enumerate(messages)
        ]
    }


def replay(data: Path, c: Container, partitions: int, batch_size: int) -> int:
    """Replay a JSONL file as Kafka partitions keyed by cell id, in Lambda-sized batches."""
    shards: dict[int, list[tuple[int | None, bytes]]] = defaultdict(list)
    offsets = [0] * partitions
    events = 0
    with data.open("rb") as f:
        for line in f:
            if not line.strip():
                continue
            events += 1
            cell = line.split(b'"cell_id":"', 1)[1].split(b'"', 1)[0]
            p = zlib.crc32(cell) % partitions
            shards[p].append((offsets[p], line.rstrip(b"\n")))
            offsets[p] += 1
            if len(shards[p]) >= batch_size:
                process_shard(f"telemetry#{p}", shards.pop(p), c)
    for p, payloads in sorted(shards.items()):
        process_shard(f"telemetry#{p}", payloads, c)
    for p in range(partitions):
        flush_shard(f"telemetry#{p}", c)
    return events


def run_workers(c: Container) -> None:
    q_enrich, q_diag = c.enrichment_queue, c.diagnosis_queue
    for _ in range(10):
        jobs = q_enrich.drain()  # type: ignore[attr-defined]
        for i in range(0, len(jobs), 10):
            resp = process_enrichment(_sqs_event(jobs[i : i + 10]), c)
            if resp["batchItemFailures"]:
                raise RuntimeError(f"enrichment failures: {resp}")
        diag = q_diag.drain()  # type: ignore[attr-defined]
        for i in range(0, len(diag), 10):
            resp = process_diagnosis(_sqs_event(diag[i : i + 10]), c)
            if resp["batchItemFailures"]:
                raise RuntimeError(f"diagnosis failures: {resp}")
        if not jobs and not diag:
            return


def load_labels(path: Path) -> list[Label]:
    m = json.loads(path.read_text())
    return [
        Label(
            f["fault_type"],
            f["scope_type"],
            f["scope"],
            datetime.fromisoformat(f["start"]),
            datetime.fromisoformat(f["end"]),
        )
        for f in m["faults"]
    ]


def score(
    name: str, labels: list[Label], c: Container, window: timedelta, lateness: timedelta
) -> ScenarioResult:
    repo = c.repo
    incidents: list[Incident] = list(repo.incidents.values())  # type: ignore[attr-defined]
    res = ScenarioResult(name=name, labels=len(labels), incidents=len(incidents))
    matched_incidents: set[str] = set()
    for lab in labels:
        hits = [
            i
            for i in incidents
            if i.suspected_fault.value == lab.fault_type
            and i.scope_type.value == lab.scope_type
            and i.scope == lab.scope
            and lab.start - window <= i.opened_at <= lab.end + window
        ]
        key = f"{lab.fault_type}@{lab.scope}"
        if not hits:
            res.missed_labels.append(key)
            continue
        res.matched_labels.append(key)
        first = min(hits, key=lambda i: i.opened_at)
        matched_incidents |= {i.incident_id for i in hits}
        _, _, diags = repo.get_bundle(first.incident_id)
        d = diags[-1] if diags else None
        res.diagnoses.append(
            {
                "label": key,
                "expected_root_cause": lab.fault_type,
                "root_cause": d.diagnosis.root_cause.value if d else None,
                "guardrail_status": d.guardrail_status if d else None,
                "confidence": d.diagnosis.confidence if d else None,
                # earliest moment the alert can exist: end of the first anomalous window + lateness
                "detection_delay_s": (
                    first.opened_at + window / 2 + lateness - lab.start
                ).total_seconds(),
                "tokens": (d.input_tokens + d.output_tokens) if d else 0,
                "locales": ["en", *sorted(d.diagnosis.translations)] if d else [],
            }
        )
    res.false_positives = sorted(
        f"{i.suspected_fault.value}@{i.scope}"
        for i in incidents
        if i.incident_id not in matched_incidents
    )
    return res


def summarize(results: list[ScenarioResult], thresholds: dict[str, Any]) -> dict[str, Any]:
    per_fault: dict[str, dict[str, int]] = defaultdict(lambda: {"tp": 0, "fn": 0, "fp": 0})
    for r in results:
        for k in r.matched_labels:
            per_fault[k.split("@")[0]]["tp"] += 1
        for k in r.missed_labels:
            per_fault[k.split("@")[0]]["fn"] += 1
        for k in r.false_positives:
            per_fault[k.split("@")[0]]["fp"] += 1
    tp = sum(v["tp"] for v in per_fault.values())
    fn = sum(v["fn"] for v in per_fault.values())
    fp = sum(v["fp"] for v in per_fault.values())
    diags = [d for r in results for d in r.diagnoses]
    correct = sum(1 for d in diags if d["root_cause"] == d["expected_root_cause"])
    passed = sum(1 for d in diags if d["guardrail_status"] in ("passed", "repaired"))
    expected_locales = set(str(thresholds.get("locales", "en")).split(","))
    localized = sum(1 for d in diags if expected_locales <= set(d.get("locales", [])))
    metrics = {
        "localization_coverage": localized / len(diags) if diags else 1.0,
        "detection_precision": tp / (tp + fp) if tp + fp else 1.0,
        "detection_recall": tp / (tp + fn) if tp + fn else 1.0,
        "diagnosis_accuracy": correct / len(diags) if diags else 1.0,
        "guardrail_pass_rate": passed / len(diags) if diags else 1.0,
        "baseline_false_positives": sum(len(r.false_positives) for r in results if r.labels == 0),
        "mean_detection_delay_s": sum(d["detection_delay_s"] for d in diags) / len(diags)
        if diags
        else 0.0,
        "llm_tokens_total": sum(d["tokens"] for d in diags),
        "events_replayed": sum(r.events for r in results),
    }
    per_fault_out = {
        f: {
            "precision": v["tp"] / (v["tp"] + v["fp"]) if v["tp"] + v["fp"] else 1.0,
            "recall": v["tp"] / (v["tp"] + v["fn"]) if v["tp"] + v["fn"] else 1.0,
            **v,
        }
        for f, v in sorted(per_fault.items())
    }
    failures = []
    for key in ("detection_precision", "detection_recall", "diagnosis_accuracy"):
        if metrics[key] < thresholds[key]:
            failures.append(f"{key} {metrics[key]:.3f} < {thresholds[key]}")
    if metrics["guardrail_pass_rate"] < thresholds["guardrail_pass_rate_min"]:
        failures.append(
            f"guardrail_pass_rate {metrics['guardrail_pass_rate']:.3f} < {thresholds['guardrail_pass_rate_min']}"
        )
    min_loc = float(thresholds.get("localization_coverage_min", 0.0))
    if metrics["localization_coverage"] < min_loc:
        failures.append(f"localization_coverage {metrics['localization_coverage']:.3f} < {min_loc}")
    if metrics["baseline_false_positives"] > thresholds["baseline_false_positives_max"]:
        failures.append(
            f"baseline_false_positives {metrics['baseline_false_positives']} > {thresholds['baseline_false_positives_max']}"
        )
    for f, v in per_fault_out.items():
        if v["tp"] + v["fn"] and v["recall"] < thresholds["per_fault_recall_min"]:
            failures.append(f"recall[{f}] {v['recall']:.3f} < {thresholds['per_fault_recall_min']}")
    return {
        "metrics": metrics,
        "per_fault": per_fault_out,
        "failures": failures,
        "passed": not failures,
    }


def to_markdown(summary: dict[str, Any], results: list[ScenarioResult]) -> str:
    m = summary["metrics"]
    lines = [
        f"**Gate: {'PASSED' if summary['passed'] else 'FAILED'}** - precision {m['detection_precision']:.3f}, "
        f"recall {m['detection_recall']:.3f}, diagnosis accuracy {m['diagnosis_accuracy']:.3f}, "
        f"guardrail pass rate {m['guardrail_pass_rate']:.3f}, localization coverage {m['localization_coverage']:.3f}, mean detection delay {m['mean_detection_delay_s']:.0f}s, "
        f"{m['events_replayed']:,} events replayed.",
        "",
        "| Fault type | Precision | Recall | TP | FN | FP |",
        "|---|---:|---:|---:|---:|---:|",
    ]
    for f, v in summary["per_fault"].items():
        lines.append(
            f"| {f} | {v['precision']:.2f} | {v['recall']:.2f} | {v['tp']} | {v['fn']} | {v['fp']} |"
        )
    lines += [
        "",
        "| Scenario | Labels | Incidents | Missed | False positives | Diagnoses (root cause / guardrail) |",
        "|---|---:|---:|---|---|---|",
    ]
    for r in results:
        diag = ", ".join(f"{d['root_cause']} / {d['guardrail_status']}" for d in r.diagnoses) or "-"
        lines.append(
            f"| {r.name} | {r.labels} | {r.incidents} | {', '.join(r.missed_labels) or '-'} | "
            f"{', '.join(r.false_positives) or '-'} | {diag} |"
        )
    if summary["failures"]:
        lines += ["", "Failures:", *[f"- {f}" for f in summary["failures"]]]
    return "\n".join(lines)


def main(argv: list[str] | None = None) -> int:
    # Workers run without a Lambda context here; silence Powertools' remaining-time warning.
    warnings.filterwarnings("ignore", message="Couldn't determine the remaining time left")
    ap = argparse.ArgumentParser(
        prog="fleetintel-eval", description="Run the golden-set evaluation gate."
    )
    ap.add_argument("--golden", type=Path, default=Path("../evals/golden.yaml"))
    ap.add_argument("--simulator-bin", required=True, help="path to the fleetsim binary")
    ap.add_argument("--data-dir", type=Path, default=None, help="keep generated telemetry here")
    ap.add_argument("--out", type=Path, default=Path("evals-report.json"))
    ap.add_argument("--markdown", type=Path, default=None)
    ap.add_argument("--only", default=None, help="comma-separated scenario names")
    args = ap.parse_args(argv)

    golden = yaml.safe_load(args.golden.read_text())
    base = args.golden.parent
    tmp = tempfile.TemporaryDirectory()
    data_dir = args.data_dir or Path(tmp.name)
    data_dir.mkdir(parents=True, exist_ok=True)
    only = set(args.only.split(",")) if args.only else None
    results: list[ScenarioResult] = []
    for sc in golden["scenarios"]:
        if only and sc["name"] not in only:
            continue
        t0 = time.perf_counter()
        data, labels_path = generate(
            args.simulator_bin, (base / sc["file"]).resolve(), golden["simulator"], data_dir
        )
        c = eval_container()
        events = replay(
            data, c, golden["pipeline"]["kafka_partitions"], golden["pipeline"]["batch_size"]
        )
        run_workers(c)
        r = score(
            sc["name"],
            load_labels(labels_path),
            c,
            timedelta(seconds=c.settings.window_seconds * 2),
            timedelta(seconds=c.settings.allowed_lateness_seconds),
        )
        r.events = events
        r.seconds = round(time.perf_counter() - t0, 2)
        results.append(r)
        print(
            f"{sc['name']:<22} events={events:>7} incidents={r.incidents} matched={len(r.matched_labels)}/{r.labels} "
            f"fp={len(r.false_positives)} ({r.seconds}s)",
            file=sys.stderr,
        )
    summary = summarize(results, golden["thresholds"])
    digest = hashlib.sha256(args.golden.read_bytes()).hexdigest()[:12]
    report = {"golden_sha": digest, **summary, "scenarios": [r.__dict__ for r in results]}
    args.out.write_text(json.dumps(report, indent=2, default=str))
    md = to_markdown(summary, results)
    if args.markdown:
        args.markdown.write_text(md + "\n")
    print(md)
    tmp.cleanup()
    return 0 if summary["passed"] else 1


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
