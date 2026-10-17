"""OpenTelemetry setup + helpers following the GenAI semantic conventions.

Span names / attributes:
* ``chat {model}`` / ``embeddings {model}`` with ``gen_ai.operation.name``,
  ``gen_ai.provider.name``, ``gen_ai.request.model``, ``gen_ai.response.model``,
  ``gen_ai.usage.input_tokens``, ``gen_ai.usage.output_tokens``;
* ``rag.query`` (root), ``rag.rewrite``, ``rag.retrieve``, ``rag.rerank``, ``rag.generate``
  with ``rag.*`` attributes (tenant, k, candidate counts, cache hit, refusal, cost).
Metrics: ``gen_ai.client.token.usage`` and ``gen_ai.client.operation.duration``
histograms plus ``rag.cost.usd`` and ``rag.refusals`` counters.

Prompt and completion *content* is never recorded (privacy by default).
"""

from __future__ import annotations

import logging
import sys
from collections.abc import MutableMapping
from typing import Any

import structlog
from opentelemetry import metrics, trace
from opentelemetry.sdk.metrics import MeterProvider
from opentelemetry.sdk.metrics.export import PeriodicExportingMetricReader
from opentelemetry.sdk.resources import Resource
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor, ConsoleSpanExporter

from ragplatform.config import Settings

TRACER_NAME = "ragplatform"
tracer = trace.get_tracer(TRACER_NAME)
meter = metrics.get_meter(TRACER_NAME)

token_usage = meter.create_histogram(
    "gen_ai.client.token.usage", unit="{token}", description="Tokens used per model call"
)
operation_duration = meter.create_histogram(
    "gen_ai.client.operation.duration", unit="s", description="Model call duration"
)
cost_counter = meter.create_counter("rag.cost.usd", unit="USD", description="Estimated spend")
refusal_counter = meter.create_counter("rag.refusals", description="Answers refused")
cache_counter = meter.create_counter("rag.cache.lookups", description="Semantic cache lookups")

_state = {"configured": False}


def configure_telemetry(settings: Settings) -> None:
    """Idempotent. Exports via OTLP/gRPC when an endpoint is configured."""
    if _state["configured"]:
        return
    _state["configured"] = True
    resource = Resource.create(
        {"service.name": settings.service_name, "deployment.environment.name": settings.environment}
    )
    provider = TracerProvider(resource=resource)
    readers = []
    if settings.otel_exporter_otlp_endpoint:
        from opentelemetry.exporter.otlp.proto.grpc.metric_exporter import OTLPMetricExporter
        from opentelemetry.exporter.otlp.proto.grpc.trace_exporter import OTLPSpanExporter

        endpoint = settings.otel_exporter_otlp_endpoint
        provider.add_span_processor(BatchSpanProcessor(OTLPSpanExporter(endpoint=endpoint)))
        readers.append(PeriodicExportingMetricReader(OTLPMetricExporter(endpoint=endpoint)))
    if settings.otel_console:
        provider.add_span_processor(BatchSpanProcessor(ConsoleSpanExporter()))
    trace.set_tracer_provider(provider)
    metrics.set_meter_provider(MeterProvider(resource=resource, metric_readers=readers))


def configure_logging(level: str = "INFO") -> None:
    logging.basicConfig(format="%(message)s", stream=sys.stdout, level=level.upper())
    structlog.configure(
        processors=[
            structlog.contextvars.merge_contextvars,
            structlog.processors.add_log_level,
            structlog.processors.TimeStamper(fmt="iso", utc=True),
            _add_trace_ids,
            structlog.processors.dict_tracebacks,
            structlog.processors.JSONRenderer(),
        ],
        wrapper_class=structlog.make_filtering_bound_logger(logging.getLevelName(level.upper())),
        logger_factory=structlog.PrintLoggerFactory(),
        cache_logger_on_first_use=True,
    )


def _add_trace_ids(
    _: Any, __: str, event: MutableMapping[str, Any]
) -> MutableMapping[str, Any]:
    ctx = trace.get_current_span().get_span_context()
    if ctx.is_valid:
        event["trace_id"] = format(ctx.trace_id, "032x")
        event["span_id"] = format(ctx.span_id, "016x")
    return event


def record_model_call(
    *,
    span: trace.Span,
    operation: str,
    provider: str,
    model: str,
    input_tokens: int,
    output_tokens: int,
    duration_s: float,
    cost_usd: float,
    tenant_id: str,
) -> None:
    span.set_attribute("gen_ai.response.model", model)
    span.set_attribute("gen_ai.usage.input_tokens", input_tokens)
    span.set_attribute("gen_ai.usage.output_tokens", output_tokens)
    span.set_attribute("rag.cost_usd", round(cost_usd, 8))
    base = {
        "gen_ai.operation.name": operation,
        "gen_ai.provider.name": provider,
        "gen_ai.request.model": model,
    }
    token_usage.record(input_tokens, {**base, "gen_ai.token.type": "input"})
    if output_tokens:
        token_usage.record(output_tokens, {**base, "gen_ai.token.type": "output"})
    operation_duration.record(duration_s, base)
    cost_counter.add(cost_usd, {"rag.tenant_id": tenant_id, "gen_ai.request.model": model})


def genai_span_attributes(operation: str, provider: str, model: str) -> dict[str, Any]:
    return {
        "gen_ai.operation.name": operation,
        "gen_ai.provider.name": provider,
        "gen_ai.request.model": model,
    }
