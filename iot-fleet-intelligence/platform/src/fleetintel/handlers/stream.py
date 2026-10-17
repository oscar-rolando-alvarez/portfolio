"""Stream processor Lambda (Amazon MSK event source mapping).

Per Kafka partition in the batch:
  load detector state -> skip already-applied offsets (replay fencing) ->
  validate records (poison records go to the quarantine queue, never fail the
  batch) -> windowed detection -> upsert incidents (deterministic ids) ->
  enqueue enrichment jobs -> save state with optimistic locking.

Any infrastructure error raises, so the event source mapping retries the
batch; every step is idempotent, so retries are safe (at-least-once in,
effectively-once state).
"""

from __future__ import annotations

import base64
from collections import defaultdict
from dataclasses import dataclass, field
from typing import Any

from aws_lambda_powertools import Logger, Metrics, Tracer
from aws_lambda_powertools.metrics import MetricUnit
from aws_lambda_powertools.utilities.data_classes import KafkaEvent
from aws_lambda_powertools.utilities.typing import LambdaContext
from opentelemetry import trace
from pydantic import ValidationError

from fleetintel.bootstrap import Container, get_container
from fleetintel.detection import DetectionOutput, StreamDetector
from fleetintel.domain import TelemetryEvent

logger = Logger(service="fleetintel-stream")
tracer = Tracer(service="fleetintel-stream")
metrics = Metrics(namespace="FleetIntel", service="stream")
otel = trace.get_tracer("fleetintel.stream")

MAX_QUARANTINE_PER_BATCH = 100


@dataclass
class ShardResult:
    records: int = 0
    events: int = 0
    invalid: int = 0
    skipped_replayed: int = 0
    late: int = 0
    opened: list[str] = field(default_factory=list)
    updated: int = 0


@otel.start_as_current_span("stream.process_shard")
def process_shard(
    shard: str, payloads: list[tuple[int | None, bytes]], c: Container
) -> ShardResult:
    trace.get_current_span().set_attribute("messaging.destination.partition.id", shard)
    res = ShardResult(records=len(payloads))
    stored = c.state_store.load(shard)
    detector = StreamDetector.from_state(stored.state, c.detector_config)
    events: list[TelemetryEvent] = []
    poison: list[dict[str, Any]] = []
    last_offset = stored.last_offset
    for offset, raw in payloads:
        if offset is not None and offset <= stored.last_offset:
            res.skipped_replayed += 1
            continue
        for line in raw.splitlines():
            if not line.strip():
                continue
            try:
                events.append(TelemetryEvent.model_validate_json(line))
            except ValidationError as exc:
                res.invalid += 1
                if len(poison) < MAX_QUARANTINE_PER_BATCH:
                    poison.append(
                        {
                            "shard": shard,
                            "offset": offset,
                            "error": exc.errors(include_input=False, include_url=False)[:3],
                            "payload": line[:2048].decode("utf-8", "replace"),
                        }
                    )
        if offset is not None:
            last_offset = max(last_offset, offset)
    events.sort(key=lambda e: e.ts)
    res.events = len(events)

    out = detector.process(events)
    _apply(out, c, res)
    if poison:
        c.quarantine_queue.publish(poison)
    c.state_store.save(shard, detector.to_state(), last_offset, stored.version)
    return res


def _apply(out: DetectionOutput, c: Container, res: ShardResult) -> None:
    res.late += out.late_events
    for inc in out.opened + out.updated:
        c.repo.upsert_incident(inc)
    if out.opened:
        # Always (re)publish for detector-new episodes: consumers are idempotent,
        # so a crash between upsert and publish can never lose a job.
        c.enrichment_queue.publish(
            [{"incident_id": i.incident_id, "tenant": i.tenant} for i in out.opened]
        )
        res.opened += [i.incident_id for i in out.opened]
    res.updated += len(out.updated)


def flush_shard(shard: str, c: Container) -> ShardResult:
    """Close all open windows of a shard (end of a bounded replay: evals, backfills)."""
    res = ShardResult()
    stored = c.state_store.load(shard)
    detector = StreamDetector.from_state(stored.state, c.detector_config)
    _apply(detector.flush(), c, res)
    c.state_store.save(shard, detector.to_state(), stored.last_offset, stored.version)
    return res


def process_kafka_event(event: dict[str, Any], c: Container) -> dict[str, Any]:
    kafka = KafkaEvent(event)
    groups: dict[str, list[tuple[int | None, bytes]]] = defaultdict(list)
    for r in kafka.records:
        groups[f"{r.topic}#{r.partition}"].append((int(r.offset), r.decoded_value))
    totals: dict[str, Any] = defaultdict(int)
    opened: list[str] = []
    for shard in sorted(groups):
        records = sorted(groups[shard], key=lambda p: p[0] or 0)
        res = process_shard(shard, records, c)
        for k in ("records", "events", "invalid", "skipped_replayed", "late", "updated"):
            totals[k] += getattr(res, k)
        opened += res.opened
    totals["opened"] = opened
    totals["shards"] = len(groups)
    _emit_metrics(totals)
    if opened:
        logger.info("incidents opened", extra={"incident_ids": opened})
    return dict(totals)


def process_sqs_telemetry(event: dict[str, Any], c: Container) -> dict[str, Any]:
    """Alternative ingestion: telemetry bundles on SQS (e.g. from an IoT rule).

    Use a FIFO queue with MessageGroupId = cell id so a shard is never
    processed concurrently; group id becomes the state shard key.
    """
    groups: dict[str, list[tuple[int | None, bytes]]] = defaultdict(list)
    for rec in event.get("Records", []):
        group = rec.get("attributes", {}).get("MessageGroupId", "default")
        groups[f"sqs#{group}"].append((None, rec["body"].encode()))
    totals: dict[str, Any] = defaultdict(int)
    for shard, payloads in sorted(groups.items()):
        res = process_shard(shard, payloads, c)
        totals["events"] += res.events
        totals["invalid"] += res.invalid
        totals["opened"] += len(res.opened)
    _emit_metrics(totals)
    return dict(totals)


def _emit_metrics(totals: dict[str, Any]) -> None:
    metrics.add_metric(
        name="TelemetryEvents", unit=MetricUnit.Count, value=int(totals.get("events", 0))
    )
    metrics.add_metric(
        name="InvalidRecords", unit=MetricUnit.Count, value=int(totals.get("invalid", 0))
    )
    opened = totals.get("opened", 0)
    metrics.add_metric(
        name="IncidentsOpened",
        unit=MetricUnit.Count,
        value=len(opened) if isinstance(opened, list) else int(opened),
    )


@metrics.log_metrics
@tracer.capture_lambda_handler(capture_response=False)
@logger.inject_lambda_context(clear_state=True)
def handler(event: dict[str, Any], context: LambdaContext) -> dict[str, Any]:
    return process_kafka_event(event, get_container())


@metrics.log_metrics
@tracer.capture_lambda_handler(capture_response=False)
@logger.inject_lambda_context(clear_state=True)
def sqs_handler(event: dict[str, Any], context: LambdaContext) -> dict[str, Any]:
    return process_sqs_telemetry(event, get_container())


def kafka_event(records: list[tuple[str, int, int, bytes, bytes | None]]) -> dict[str, Any]:
    """Build an MSK-shaped event (used by the local runner and tests)."""
    grouped: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for topic, partition, offset, value, key in records:
        grouped[f"{topic}-{partition}"].append(
            {
                "topic": topic,
                "partition": partition,
                "offset": offset,
                "timestamp": 0,
                "timestampType": "CREATE_TIME",
                "key": base64.b64encode(key).decode() if key else None,
                "value": base64.b64encode(value).decode(),
                "headers": [],
            }
        )
    return {
        "eventSource": "aws:kafka",
        "eventSourceArn": "arn:aws:kafka:local",
        "records": dict(grouped),
    }
