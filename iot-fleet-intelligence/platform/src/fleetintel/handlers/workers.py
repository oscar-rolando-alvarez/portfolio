"""SQS-triggered workers: enrichment and diagnosis.

Both use Powertools BatchProcessor (partial batch failure reporting: only the
failed messages return to the queue and eventually the DLQ) and Powertools
idempotency keyed on the incident id, so duplicate deliveries - which SQS
standard queues and our at-least-once producers do generate - are no-ops.
"""

from __future__ import annotations

from collections.abc import Callable
from typing import Any

from aws_lambda_powertools import Logger, Metrics, Tracer
from aws_lambda_powertools.metrics import MetricUnit
from aws_lambda_powertools.utilities.batch import (
    BatchProcessor,
    EventType,
    process_partial_response,
)
from aws_lambda_powertools.utilities.data_classes.sqs_event import SQSRecord
from aws_lambda_powertools.utilities.idempotency import IdempotencyConfig, idempotent_function
from aws_lambda_powertools.utilities.typing import LambdaContext
from pydantic import BaseModel, ConfigDict

from fleetintel.bootstrap import Container, get_container
from fleetintel.domain import IncidentStatus

logger = Logger(service="fleetintel-workers")
tracer = Tracer(service="fleetintel-workers")
metrics = Metrics(namespace="FleetIntel", service="workers")


class IncidentJob(BaseModel):
    model_config = ConfigDict(extra="forbid")
    incident_id: str
    tenant: str


class IncidentNotFoundError(Exception):
    """Raised so the message is retried (e.g. replication lag) and lands in the DLQ if persistent."""


def enrich_incident(c: Container, job: IncidentJob) -> dict[str, Any]:
    inc, _, _ = c.repo.get_bundle(job.incident_id)
    if inc is None:
        raise IncidentNotFoundError(job.incident_id)
    if inc.tenant != job.tenant:
        logger.warning("tenant mismatch on job, dropping", extra={"incident_id": job.incident_id})
        return {"incident_id": job.incident_id, "dropped": True}
    ctx = c.enrichment.enrich(inc)
    c.repo.save_enrichment(ctx)
    c.repo.set_status(inc.incident_id, IncidentStatus.ENRICHED, expected={IncidentStatus.OPEN})
    c.diagnosis_queue.publish([job.model_dump()])
    degraded = sum(1 for i in ctx.items if i.status != "ok")
    metrics.add_metric(name="EnrichmentDegradedSources", unit=MetricUnit.Count, value=degraded)
    return {"incident_id": inc.incident_id, "sources": len(ctx.items), "degraded": degraded}


def diagnose_incident(c: Container, job: IncidentJob) -> dict[str, Any]:
    inc, enrichment, _ = c.repo.get_bundle(job.incident_id)
    if inc is None:
        raise IncidentNotFoundError(job.incident_id)
    if inc.tenant != job.tenant:
        return {"incident_id": job.incident_id, "dropped": True}
    record = c.diagnosis.diagnose(inc, enrichment)
    c.repo.save_diagnosis(record)
    status = (
        IncidentStatus.NEEDS_REVIEW
        if record.guardrail_status == "refused"
        else IncidentStatus.DIAGNOSED
    )
    c.repo.set_status(
        inc.incident_id, status, expected={IncidentStatus.OPEN, IncidentStatus.ENRICHED}
    )
    metrics.add_metric(name="LLMInputTokens", unit=MetricUnit.Count, value=record.input_tokens)
    metrics.add_metric(name="LLMOutputTokens", unit=MetricUnit.Count, value=record.output_tokens)
    metrics.add_metric(name=f"Diagnosis_{record.guardrail_status}", unit=MetricUnit.Count, value=1)
    return {
        "incident_id": inc.incident_id,
        "root_cause": record.diagnosis.root_cause.value,
        "guardrail_status": record.guardrail_status,
    }


_IDEMPOTENCY_CONFIG = IdempotencyConfig(
    event_key_jmespath="incident_id", expires_after_seconds=6 * 3600
)
_wrapped: dict[tuple[int, str], Callable[..., dict[str, Any]]] = {}


def _idempotent(
    c: Container, name: str, fn: Callable[[Container, IncidentJob], dict[str, Any]]
) -> Callable[..., dict[str, Any]]:
    key = (id(c), name)
    if key not in _wrapped:

        def run(job: dict[str, Any]) -> dict[str, Any]:
            return fn(c, IncidentJob.model_validate(job))

        run.__name__ = run.__qualname__ = name  # part of the idempotency key namespace
        _wrapped[key] = idempotent_function(
            data_keyword_argument="job",
            persistence_store=c.idempotency_store,
            config=_IDEMPOTENCY_CONFIG,
        )(run)
    return _wrapped[key]


def _process(
    event: dict[str, Any],
    context: LambdaContext | None,
    name: str,
    fn: Callable[[Container, IncidentJob], dict[str, Any]],
    c: Container | None = None,
) -> dict[str, Any]:
    c = c or get_container()
    _IDEMPOTENCY_CONFIG.register_lambda_context(context)  # type: ignore[arg-type]
    run = _idempotent(c, name, fn)
    processor = BatchProcessor(event_type=EventType.SQS)

    def record_handler(record: SQSRecord) -> dict[str, Any]:
        job = IncidentJob.model_validate_json(record.body)
        return run(job=job.model_dump())

    return process_partial_response(  # type: ignore[return-value]
        event=event, record_handler=record_handler, processor=processor, context=context
    )


def process_enrichment(
    event: dict[str, Any], c: Container | None = None, context: LambdaContext | None = None
) -> dict[str, Any]:
    return _process(event, context, "enrich_incident", enrich_incident, c)


def process_diagnosis(
    event: dict[str, Any], c: Container | None = None, context: LambdaContext | None = None
) -> dict[str, Any]:
    return _process(event, context, "diagnose_incident", diagnose_incident, c)


@metrics.log_metrics
@tracer.capture_lambda_handler(capture_response=False)
@logger.inject_lambda_context(clear_state=True)
def enrichment_handler(event: dict[str, Any], context: LambdaContext) -> dict[str, Any]:
    return process_enrichment(event, context=context)


@metrics.log_metrics
@tracer.capture_lambda_handler(capture_response=False)
@logger.inject_lambda_context(clear_state=True)
def diagnosis_handler(event: dict[str, Any], context: LambdaContext) -> dict[str, Any]:
    return process_diagnosis(event, context=context)
