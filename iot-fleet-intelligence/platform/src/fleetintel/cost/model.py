"""Monthly AWS + LLM cost model for the reference architecture.

Pure, deterministic and exact: all arithmetic uses ``Decimal``; line items are
rounded to cents only when rendered. Every unit price comes from a versioned,
dated pricing table (``pricing/*.yaml``) labelled as assumptions.
"""

from __future__ import annotations

import math
from decimal import ROUND_HALF_UP, Decimal
from functools import lru_cache
from importlib import resources
from typing import Any, Literal

import yaml
from pydantic import BaseModel, ConfigDict, Field

D = Decimal
MILLION = D(1_000_000)
CENT = D("0.01")
DEFAULT_PRICING = "aws-us-east-1-2026-10.yaml"


class FleetProfile(BaseModel):
    """What the buyer tells us about their fleet. Defaults are documented assumptions."""

    model_config = ConfigDict(extra="forbid")

    devices: int = Field(ge=1, le=200_000_000)
    report_interval_seconds: int = Field(default=300, ge=1, le=86_400)
    payload_bytes: int = Field(default=512, ge=1, le=131_072)
    ingest_path: Literal["iot_core", "direct_kafka"] = "iot_core"
    connected_fraction: D = Field(default=D("1"), ge=0, le=1)
    readings_per_message: int = Field(default=1, ge=1, le=1000, description="edge batching")
    compression_ratio: D = Field(default=D("1"), gt=0, le=1)
    edge_filter_ratio: D = Field(default=D("0"), ge=0, le=D("0.99"))
    kafka_retention_hours: int = Field(default=24, ge=1, le=8760)
    kafka_consumers: int = Field(default=1, ge=1, le=10)
    # stream processor Lambda (MSK event source mapping)
    stream_batch_size: int = Field(default=500, ge=1, le=10_000)
    stream_batch_window_seconds: int = Field(default=5, ge=1, le=300)
    stream_memory_mb: int = Field(default=1024, ge=128, le=10_240)
    stream_base_ms: D = Field(default=D("40"), ge=0)
    stream_ms_per_reading: D = Field(default=D("0.05"), ge=0)
    detector_state_kb: int = Field(default=32, ge=1, le=400)
    # incidents and GenAI
    incidents_per_1k_devices_per_day: D = Field(default=D("0.5"), ge=0)
    llm_share: D = Field(
        default=D("1"), ge=0, le=1, description="share of incidents sent to the LLM"
    )
    llm_cache_hit_rate: D = Field(default=D("0"), ge=0, le=1)
    llm_large_share: D = Field(
        default=D("1"), ge=0, le=1, description="share routed to the large tier"
    )
    input_tokens_per_diagnosis: int = Field(default=3500, ge=0)
    output_tokens_per_diagnosis: int = Field(default=600, ge=0)
    embedding_tokens_per_diagnosis: int = Field(default=300, ge=0)
    enrich_ms: D = Field(default=D("1500"), ge=0)
    diagnose_ms: D = Field(default=D("6000"), ge=0)
    diagnose_skipped_ms: D = Field(default=D("300"), ge=0)
    worker_memory_mb: int = Field(default=256, ge=128, le=10_240)
    wru_per_incident: int = Field(default=24, ge=0)
    rru_per_incident: int = Field(default=8, ge=0)
    incident_kb: int = Field(default=12, ge=1)
    incident_retention_days: int = Field(default=90, ge=1)
    # API and observability
    api_requests_per_month: int = Field(default=100_000, ge=0)
    api_ms: D = Field(default=D("60"), ge=0)
    api_response_kb: int = Field(default=4, ge=0)
    rru_per_api_request: int = Field(default=4, ge=0)
    log_bytes_per_stream_invocation: int = Field(default=1500, ge=0)
    log_bytes_per_worker_invocation: int = Field(default=4000, ge=0)
    log_retention_days: int = Field(default=30, ge=1)
    xray_sampling: D = Field(default=D("0.05"), ge=0, le=1)
    sqs_pollers_per_queue: int = Field(default=5, ge=0)
    kms_keys: int = Field(default=1, ge=0)


class LineItem(BaseModel):
    category: str
    item: str
    quantity: D
    unit: str
    unit_price: D
    monthly_usd: D

    def rounded(self) -> D:
        return self.monthly_usd.quantize(CENT, rounding=ROUND_HALF_UP)


class Recommendation(BaseModel):
    title: str
    rationale: str
    monthly_savings_usd: D
    new_total_usd: D


class CostReport(BaseModel):
    pricing_version: str
    region: str
    profile: FleetProfile
    line_items: list[LineItem]
    by_category: dict[str, D]
    total_usd: D
    per_device_usd: D
    per_million_readings_usd: D
    volumes: dict[str, D]
    recommendations: list[Recommendation] = Field(default_factory=list)
    disclaimer: str = (
        "Estimate based on dated list-price assumptions (no free tier or discounts). "
        "Verify with the AWS Pricing Calculator before making commercial decisions."
    )


@lru_cache(maxsize=4)
def load_pricing(name: str = DEFAULT_PRICING) -> dict[str, Any]:
    raw = resources.files("fleetintel.cost").joinpath(f"pricing/{name}").read_text()
    data: dict[str, Any] = yaml.safe_load(raw)
    return data


def _p(pricing: dict[str, Any], *path: str) -> D:
    node: Any = pricing
    for key in path:
        node = node[key]
    return D(str(node))


def _ceil(x: D) -> D:
    return D(math.ceil(x))


def tiered(units_millions: D, tiers: list[dict[str, Any]]) -> D:
    cost, prev = D(0), D(0)
    for t in tiers:
        cap = D(str(t["up_to_million"])) if t["up_to_million"] is not None else None
        top = units_millions if cap is None else min(units_millions, cap)
        if top > prev:
            cost += (top - prev) * D(str(t["price_per_million"]))
        if cap is None or units_millions <= cap:
            break
        prev = cap
    return cost


def estimate(
    profile: FleetProfile, pricing: dict[str, Any] | None = None, with_recommendations: bool = True
) -> CostReport:
    pr = pricing or load_pricing()
    gib = D(pr["gib_bytes"])
    hours = D(pr["hours_per_month"])
    days = hours / 24
    seconds = hours * 3600
    items: list[LineItem] = []

    def add(category: str, item: str, qty: D, unit: str, price: D, divisor: D = D(1)) -> None:
        items.append(
            LineItem(
                category=category,
                item=item,
                quantity=qty,
                unit=unit,
                unit_price=price,
                monthly_usd=qty / divisor * price,
            )
        )

    p = profile
    readings = D(p.devices) * D(86_400) / D(p.report_interval_seconds) * days
    kept_readings = readings * (1 - p.edge_filter_ratio)
    messages = kept_readings / D(p.readings_per_message)
    msg_bytes = D(p.payload_bytes) * D(p.readings_per_message) * p.compression_ratio
    ingest_gib = messages * msg_bytes / gib

    # --- Ingest: AWS IoT Core (MQTT) ---------------------------------------------
    if p.ingest_path == "iot_core":
        iot = pr["iot_core"]
        minutes = D(p.devices) * p.connected_fraction * hours * 60
        add(
            "Ingest (IoT Core)",
            "Connectivity",
            minutes,
            "million connection-minutes",
            _p(pr, "iot_core", "connectivity_per_million_minutes"),
            MILLION,
        )
        units = messages * _ceil(msg_bytes / D(iot["message_increment_bytes"]))
        items.append(
            LineItem(
                category="Ingest (IoT Core)",
                item="Messaging (5 KB units, tiered)",
                quantity=units,
                unit="million messages",
                unit_price=D(str(iot["messaging_tiers"][0]["price_per_million"])),
                monthly_usd=tiered(units / MILLION, iot["messaging_tiers"]),
            )
        )
        add(
            "Ingest (IoT Core)",
            "Rules triggered",
            messages,
            "million rules",
            _p(pr, "iot_core", "rules_per_million"),
            MILLION,
        )
        add(
            "Ingest (IoT Core)",
            "Rule actions (to MSK)",
            messages,
            "million actions",
            _p(pr, "iot_core", "actions_per_million"),
            MILLION,
        )

    # --- Streaming: MSK Serverless ------------------------------------------------
    msk = pr["msk_serverless"]
    mb_per_s = messages * msg_bytes / seconds / D(1_000_000)
    partitions = max(
        D(msk["min_partitions"]), _ceil(mb_per_s / D(str(msk["ingress_mb_per_s_per_partition"])))
    )
    add(
        "Streaming (MSK Serverless)",
        "Cluster hours",
        hours,
        "cluster-hours",
        _p(pr, "msk_serverless", "cluster_hour"),
    )
    add(
        "Streaming (MSK Serverless)",
        "Partition hours",
        partitions * hours,
        "partition-hours",
        _p(pr, "msk_serverless", "partition_hour"),
    )
    add(
        "Streaming (MSK Serverless)",
        "Data in",
        ingest_gib,
        "GB",
        _p(pr, "msk_serverless", "data_in_per_gb"),
    )
    add(
        "Streaming (MSK Serverless)",
        "Data out",
        ingest_gib * p.kafka_consumers,
        "GB",
        _p(pr, "msk_serverless", "data_out_per_gb"),
    )
    stored_gib = ingest_gib / hours * D(p.kafka_retention_hours)
    add(
        "Streaming (MSK Serverless)",
        "Storage (retention)",
        stored_gib,
        "GB-month",
        _p(pr, "msk_serverless", "storage_per_gb_month"),
    )

    # --- Compute: Lambda (arm64) -------------------------------------------------
    gbs_price = _p(pr, "lambda_arm", "per_gb_second")
    req_price = _p(pr, "lambda_arm", "per_million_requests")
    idle_floor = partitions * seconds / D(p.stream_batch_window_seconds)
    stream_inv = (
        min(messages, max(messages / D(p.stream_batch_size), idle_floor)) if messages > 0 else D(0)
    )
    readings_per_inv = kept_readings / stream_inv if stream_inv else D(0)
    stream_s = (p.stream_base_ms + p.stream_ms_per_reading * readings_per_inv) / 1000
    stream_gbs = stream_inv * stream_s * D(p.stream_memory_mb) / 1024
    incidents = D(p.devices) / 1000 * p.incidents_per_1k_devices_per_day * days
    llm_calls = incidents * p.llm_share * (1 - p.llm_cache_hit_rate)
    worker_gb = D(p.worker_memory_mb) / 1024
    enrich_gbs = incidents * p.enrich_ms / 1000 * worker_gb
    diag_gbs = (
        (llm_calls * p.diagnose_ms + (incidents - llm_calls) * p.diagnose_skipped_ms)
        / 1000
        * worker_gb
    )
    api_gbs = D(p.api_requests_per_month) * p.api_ms / 1000 * worker_gb
    add(
        "Compute (Lambda arm64)",
        "Stream processor requests",
        stream_inv,
        "million requests",
        req_price,
        MILLION,
    )
    add("Compute (Lambda arm64)", "Stream processor duration", stream_gbs, "GB-seconds", gbs_price)
    add(
        "Compute (Lambda arm64)",
        "Enrichment + diagnosis requests",
        incidents * 2,
        "million requests",
        req_price,
        MILLION,
    )
    add(
        "Compute (Lambda arm64)",
        "Enrichment + diagnosis duration",
        enrich_gbs + diag_gbs,
        "GB-seconds",
        gbs_price,
    )
    add(
        "Compute (Lambda arm64)",
        "API requests",
        D(p.api_requests_per_month),
        "million requests",
        req_price,
        MILLION,
    )
    add("Compute (Lambda arm64)", "API duration", api_gbs, "GB-seconds", gbs_price)

    # --- Messaging: SQS standard -------------------------------------------------
    sqs_requests = incidents * 2 * 3 + D(2 * p.sqs_pollers_per_queue) * seconds / 20
    add(
        "Messaging (SQS)",
        "Requests (jobs + long-poll baseline)",
        sqs_requests,
        "million requests",
        _p(pr, "sqs_standard", "per_million_requests"),
        MILLION,
    )

    # --- Storage: DynamoDB on-demand ---------------------------------------------
    state_wru = stream_inv * D(p.detector_state_kb)
    state_rru = stream_inv * _ceil(D(p.detector_state_kb) / 4)
    wru = incidents * p.wru_per_incident + state_wru
    rru = (
        incidents * p.rru_per_incident
        + state_rru
        + D(p.api_requests_per_month * p.rru_per_api_request)
    )
    add(
        "Storage (DynamoDB)",
        "Write request units",
        wru,
        "million WRU",
        _p(pr, "dynamodb_on_demand", "per_million_wru"),
        MILLION,
    )
    add(
        "Storage (DynamoDB)",
        "Read request units",
        rru,
        "million RRU",
        _p(pr, "dynamodb_on_demand", "per_million_rru"),
        MILLION,
    )
    ddb_gib = incidents * D(p.incident_retention_days) / days * D(p.incident_kb) * 1024 / gib
    add(
        "Storage (DynamoDB)",
        "Storage",
        ddb_gib,
        "GB-month",
        _p(pr, "dynamodb_on_demand", "storage_per_gb_month"),
    )

    # --- API Gateway (HTTP API) ----------------------------------------------------
    add(
        "API Gateway",
        "HTTP API requests",
        D(p.api_requests_per_month),
        "million requests",
        _p(pr, "api_gateway_http", "per_million_requests"),
        MILLION,
    )

    # --- Observability ---------------------------------------------------------------
    worker_inv = incidents * 2 + D(p.api_requests_per_month)
    log_gib = (
        stream_inv * p.log_bytes_per_stream_invocation
        + worker_inv * p.log_bytes_per_worker_invocation
    ) / gib
    add(
        "Observability",
        "CloudWatch Logs ingestion",
        log_gib,
        "GB",
        _p(pr, "cloudwatch_logs", "ingest_per_gb"),
    )
    add(
        "Observability",
        "CloudWatch Logs storage",
        log_gib * D(p.log_retention_days) / days,
        "GB-month",
        _p(pr, "cloudwatch_logs", "storage_per_gb_month"),
    )
    add(
        "Observability",
        "X-Ray traces (sampled)",
        (stream_inv + worker_inv) * p.xray_sampling,
        "million traces",
        _p(pr, "xray", "per_million_traces"),
        MILLION,
    )

    # --- Data transfer + security -----------------------------------------------------
    egress_gib = D(p.api_requests_per_month * p.api_response_kb) * 1024 / gib
    add(
        "Data transfer",
        "Internet egress (API)",
        egress_gib,
        "GB",
        _p(pr, "data_transfer", "internet_out_per_gb"),
    )
    add(
        "Security (KMS)",
        "Customer-managed keys",
        D(p.kms_keys),
        "key-months",
        _p(pr, "kms", "per_key_month"),
    )

    # --- GenAI ----------------------------------------------------------------------
    small, large = pr["llm_tiers"]["small"], pr["llm_tiers"]["large"]
    blend_in = (1 - p.llm_large_share) * D(small["input_per_million"]) + p.llm_large_share * D(
        large["input_per_million"]
    )
    blend_out = (1 - p.llm_large_share) * D(small["output_per_million"]) + p.llm_large_share * D(
        large["output_per_million"]
    )
    add(
        "GenAI (LLM)",
        "Input tokens",
        llm_calls * p.input_tokens_per_diagnosis,
        "million tokens",
        blend_in,
        MILLION,
    )
    add(
        "GenAI (LLM)",
        "Output tokens",
        llm_calls * p.output_tokens_per_diagnosis,
        "million tokens",
        blend_out,
        MILLION,
    )
    add(
        "GenAI (LLM)",
        "Embedding tokens (RAG query)",
        llm_calls * p.embedding_tokens_per_diagnosis,
        "million tokens",
        _p(pr, "embeddings_per_million_tokens"),
        MILLION,
    )

    by_cat: dict[str, D] = {}
    for it in items:
        by_cat[it.category] = by_cat.get(it.category, D(0)) + it.monthly_usd
    total = sum((it.monthly_usd for it in items), D(0))
    report = CostReport(
        pricing_version=pr["version"],
        region=pr["region"],
        profile=p,
        line_items=items,
        by_category=by_cat,
        total_usd=total,
        per_device_usd=total / D(p.devices),
        per_million_readings_usd=total / readings * MILLION if readings else D(0),
        volumes={
            "readings": readings,
            "messages": messages,
            "ingest_gib": ingest_gib,
            "msk_partitions": partitions,
            "stream_invocations": stream_inv,
            "incidents": incidents,
            "llm_calls": llm_calls,
        },
    )
    if with_recommendations:
        report.recommendations = recommend(p, total, pr)
    return report


_VARIANTS: list[tuple[str, str, Any, dict[str, Any]]] = [
    (
        "Batch 10 readings per message at the edge",
        "IoT Core bills per message in 5 KB units; 10 x 512 B fits in one unit, and MSK/Lambda see 10x fewer records.",
        lambda p: p.ingest_path == "iot_core" and p.readings_per_message < 10,
        {"readings_per_message": 10},
    ),
    (
        "Compress payloads (CBOR + zstd, ~50%)",
        "Halves MSK ingress/egress/storage bytes and keeps batched messages inside one 5 KB billing unit.",
        lambda p: p.compression_ratio == 1,
        {"compression_ratio": D("0.5")},
    ),
    (
        "Report by exception (filter 30% unchanged readings at the edge)",
        "Meters and sensors often repeat the last value; dropping duplicates cuts every downstream volume.",
        lambda p: p.edge_filter_ratio == 0,
        {"edge_filter_ratio": D("0.3")},
    ),
    (
        "Cache diagnoses for repeated incident signatures (30% hit rate)",
        "Recurring patterns (same fault class, scope type and evidence shape) reuse a validated diagnosis.",
        lambda p: p.llm_cache_hit_rate < D("0.3"),
        {"llm_cache_hit_rate": D("0.3")},
    ),
    (
        "Model tiering: small model first, escalate 20% to the large tier",
        "Guardrail-refused or low-confidence diagnoses are escalated; the rest stay on the small tier.",
        lambda p: p.llm_large_share > D("0.2"),
        {"llm_large_share": D("0.2")},
    ),
    (
        "Larger MSK batches (2,000 records / 10 s window)",
        "Fewer stream invocations means fewer Lambda requests, detector-state reads/writes and log lines.",
        lambda p: p.stream_batch_size < 2000,
        {"stream_batch_size": 2000, "stream_batch_window_seconds": 10},
    ),
    (
        "Trim log volume (structured, sampled debug logs, 300 B/invocation)",
        "CloudWatch Logs ingestion is billed per GB; log summaries, not records.",
        lambda p: p.log_bytes_per_stream_invocation > 500,
        {"log_bytes_per_stream_invocation": 300, "log_bytes_per_worker_invocation": 1500},
    ),
]


def recommend(profile: FleetProfile, total: D, pricing: dict[str, Any]) -> list[Recommendation]:
    recs: list[Recommendation] = []
    floor = max(D(1), total * D("0.005"))
    for title, why, applies, change in _VARIANTS:
        if not applies(profile):
            continue
        variant = profile.model_copy(update=change)
        new_total = estimate(variant, pricing, with_recommendations=False).total_usd
        savings = total - new_total
        if savings >= floor:
            recs.append(
                Recommendation(
                    title=title, rationale=why, monthly_savings_usd=savings, new_total_usd=new_total
                )
            )
    recs.sort(key=lambda r: r.monthly_savings_usd, reverse=True)
    return recs


def money(x: D) -> str:
    q = x.quantize(CENT, rounding=ROUND_HALF_UP)
    return f"${q:,.2f}"
