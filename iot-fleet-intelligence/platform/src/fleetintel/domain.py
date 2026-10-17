"""Domain model: telemetry, incidents, enrichment context and diagnoses.

Everything that crosses a process boundary (Kafka, SQS, DynamoDB, HTTP, LLM)
is a Pydantic v2 model so validation happens exactly once at the edge.
"""

from __future__ import annotations

import hashlib
from datetime import datetime
from enum import StrEnum
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, StringConstraints

DeviceId = Annotated[str, StringConstraints(pattern=r"^dev-[0-9]{8,9}$")]
TenantId = Annotated[str, StringConstraints(pattern=r"^[a-z0-9][a-z0-9-]{0,39}$")]
CellId = Annotated[str, StringConstraints(pattern=r"^[0-9]{3}-[0-9]{2,3}-[0-9]{1,5}-[0-9]{1,9}$")]


class ConnState(StrEnum):
    CONNECTED = "connected"
    NO_SERVICE = "no_service"
    ATTACH_REJECT = "attach_reject"
    PDN_REJECT = "pdn_reject"


class TelemetryEvent(BaseModel):
    """One device report as produced by the fleet simulator (wire schema v1)."""

    model_config = ConfigDict(frozen=True, extra="ignore")

    v: Literal[1]
    event_id: Annotated[str, StringConstraints(max_length=64)]
    tenant: TenantId
    device_id: DeviceId
    profile: Literal["smart_meter", "asset_tracker", "vehicle_telematics", "industrial_sensor"]
    ts: datetime
    seq: int = Field(ge=0)
    cell_id: CellId
    plmn: Annotated[str, StringConstraints(pattern=r"^[0-9]{5,6}$")]
    home_plmn: Annotated[str, StringConstraints(pattern=r"^[0-9]{5,6}$")]
    roaming: bool
    rat: Literal["NB-IoT", "LTE-M", "LTE", "5G-NR"]
    apn: Annotated[str, StringConstraints(max_length=100)]
    rsrp: float = Field(ge=-156, le=-30)
    rsrq: float = Field(ge=-43, le=20)
    sinr: float = Field(ge=-30, le=50)
    rssi: float = Field(ge=-140, le=0)
    conn_state: ConnState
    cause: str | None = Field(default=None, max_length=16)
    reconnects: int = Field(ge=0, le=1000)
    latency_ms: int = Field(ge=0, le=600_000)
    battery_pct: float = Field(ge=0, le=100)
    firmware: Annotated[str, StringConstraints(max_length=32)]
    reset_reason: str | None = Field(default=None, max_length=32)
    uptime_s: int = Field(ge=0)
    payload_bytes: int = Field(ge=0, le=1_048_576)


class FaultType(StrEnum):
    CELL_OUTAGE = "cell_outage"
    CONGESTION = "congestion"
    RECONNECT_STORM = "reconnect_storm"
    ROAMING_MISCONFIG = "roaming_misconfig"
    APN_ERROR = "apn_error"
    FIRMWARE_REGRESSION = "firmware_regression"


class ScopeType(StrEnum):
    CELL = "cell"
    PLMN = "plmn"
    APN = "apn"
    FIRMWARE = "firmware"


SCOPE_OF_FAULT: dict[FaultType, ScopeType] = {
    FaultType.CELL_OUTAGE: ScopeType.CELL,
    FaultType.CONGESTION: ScopeType.CELL,
    FaultType.RECONNECT_STORM: ScopeType.CELL,
    FaultType.ROAMING_MISCONFIG: ScopeType.PLMN,
    FaultType.APN_ERROR: ScopeType.APN,
    FaultType.FIRMWARE_REGRESSION: ScopeType.FIRMWARE,
}


class IncidentStatus(StrEnum):
    OPEN = "OPEN"  # detected, waiting for enrichment
    ENRICHED = "ENRICHED"  # context attached, waiting for diagnosis
    DIAGNOSED = "DIAGNOSED"  # LLM diagnosis passed guardrails
    NEEDS_REVIEW = "NEEDS_REVIEW"  # guardrails refused / insufficient evidence
    RESOLVED = "RESOLVED"


class MetricSignal(BaseModel):
    """One metric that deviated from its learned baseline."""

    model_config = ConfigDict(frozen=True)

    metric: str
    value: float
    baseline: float
    zscore: float


class Incident(BaseModel):
    model_config = ConfigDict(extra="ignore")

    incident_id: str
    tenant: TenantId
    suspected_fault: FaultType
    scope_type: ScopeType
    scope: str
    status: IncidentStatus = IncidentStatus.OPEN
    opened_at: datetime
    last_seen_at: datetime
    windows: int = 1
    severity: Literal["low", "medium", "high", "critical"]
    affected_devices: int = Field(ge=0)
    total_devices: int = Field(ge=0)
    signals: list[MetricSignal]
    sample_device_ids: list[DeviceId] = Field(default_factory=list, max_length=20)
    top_causes: dict[str, int] = Field(default_factory=dict)
    context: dict[str, str] = Field(default_factory=dict)  # e.g. rat, profile mix, plmn

    @staticmethod
    def make_id(tenant: str, fault: FaultType, scope: str, opened_at: datetime) -> str:
        """Deterministic id => replays and duplicate deliveries are idempotent."""
        raw = f"{tenant}|{fault}|{scope}|{opened_at.isoformat()}".encode()
        return "inc-" + hashlib.sha256(raw).hexdigest()[:20]


class EnrichmentStatus(StrEnum):
    OK = "ok"
    DEGRADED = "degraded"  # served from stale cache / partial
    UNAVAILABLE = "unavailable"  # timeout, breaker open, provider error


class EnrichmentItem(BaseModel):
    source: str
    status: EnrichmentStatus
    data: dict[str, object] = Field(default_factory=dict)
    error: str | None = None
    latency_ms: float = 0.0
    cached: bool = False


class EnrichmentContext(BaseModel):
    incident_id: str
    items: list[EnrichmentItem]

    def by_source(self, source: str) -> EnrichmentItem | None:
        return next((i for i in self.items if i.source == source), None)


class RootCause(StrEnum):
    """Diagnosis classes. Mirrors FaultType plus an explicit refusal class."""

    CELL_OUTAGE = "cell_outage"
    CONGESTION = "congestion"
    RECONNECT_STORM = "reconnect_storm"
    ROAMING_MISCONFIG = "roaming_misconfig"
    APN_ERROR = "apn_error"
    FIRMWARE_REGRESSION = "firmware_regression"
    INSUFFICIENT_EVIDENCE = "insufficient_evidence"


class RemediationStep(BaseModel):
    order: int = Field(ge=1, le=20)
    action: str = Field(min_length=3, max_length=400)
    owner: Literal[
        "noc",
        "core_network",
        "device_ops",
        "carrier_relations",
        "field_service",
        "customer_success",
    ]
    automated: bool = False


class Diagnosis(BaseModel):
    """Structured LLM output. This JSON schema is sent as ``response_format``."""

    model_config = ConfigDict(extra="forbid")

    root_cause: RootCause
    confidence: float = Field(ge=0, le=1)
    summary: str = Field(min_length=10, max_length=600)
    evidence: list[str] = Field(min_length=1, max_length=8)
    remediation_steps: list[RemediationStep] = Field(max_length=8)
    truck_roll_required: bool
    customer_message: str = Field(min_length=10, max_length=600)
    referenced_device_ids: list[str] = Field(default_factory=list, max_length=20)
    runbook_ids: list[str] = Field(default_factory=list, max_length=5)


class DiagnosisRecord(BaseModel):
    """Diagnosis plus provenance, as persisted and served by the API."""

    incident_id: str
    diagnosis: Diagnosis
    model: str
    provider: str
    guardrail_status: Literal["passed", "refused", "repaired"]
    guardrail_notes: list[str] = Field(default_factory=list)
    input_tokens: int = 0
    output_tokens: int = 0
    latency_ms: float = 0.0
    created_at: datetime
    prompt_version: str
