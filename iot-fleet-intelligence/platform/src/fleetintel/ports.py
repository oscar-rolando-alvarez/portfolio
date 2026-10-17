"""Ports (hexagonal architecture). Core services depend only on these protocols."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Protocol

from fleetintel.domain import (
    DiagnosisRecord,
    EnrichmentContext,
    Incident,
    IncidentStatus,
)


class StaleStateError(Exception):
    """Optimistic-concurrency conflict when saving detector state."""


class IncidentRepository(Protocol):
    def upsert_incident(self, incident: Incident) -> bool:
        """Create or extend an incident. Returns True when it was created."""
        ...

    def get_bundle(
        self, incident_id: str
    ) -> tuple[Incident | None, EnrichmentContext | None, list[DiagnosisRecord]]: ...

    def list_incidents(
        self, tenant: str, status: IncidentStatus | None, limit: int, cursor: str | None
    ) -> tuple[list[Incident], str | None]: ...

    def set_status(
        self, incident_id: str, status: IncidentStatus, expected: set[IncidentStatus] | None = None
    ) -> bool: ...

    def save_enrichment(self, ctx: EnrichmentContext) -> None: ...

    def save_diagnosis(self, record: DiagnosisRecord) -> None: ...

    def ping(self) -> bool: ...


@dataclass(frozen=True, slots=True)
class StoredState:
    state: dict[str, Any] | None
    version: int
    last_offset: int


class DetectorStateStore(Protocol):
    def load(self, shard: str) -> StoredState: ...

    def save(
        self, shard: str, state: dict[str, Any], last_offset: int, expected_version: int
    ) -> None:
        """Persist state; raise StaleStateError if someone else saved in between."""
        ...


class JobQueue(Protocol):
    def publish(self, messages: list[dict[str, Any]]) -> None: ...


class Cache(Protocol):
    def get(self, key: str) -> dict[str, Any] | None: ...

    def put(self, key: str, value: dict[str, Any], ttl_seconds: int) -> None: ...


# --- enrichment providers -----------------------------------------------------


class CellTowerProvider(Protocol):
    name: str

    def locate(self, cell_id: str) -> dict[str, Any]: ...


class WeatherProvider(Protocol):
    name: str

    def current(self, lat: float, lon: float) -> dict[str, Any]: ...


class CarrierProvider(Protocol):
    name: str

    def lookup(self, plmn: str, home_plmn: str | None = None) -> dict[str, Any]: ...


class StatusFeedProvider(Protocol):
    name: str

    def active_incidents(self) -> list[dict[str, Any]]: ...


# --- GenAI ---------------------------------------------------------------------


@dataclass(frozen=True, slots=True)
class ChatResult:
    content: str
    model: str
    input_tokens: int
    output_tokens: int
    finish_reason: str = "stop"


class LLMClient(Protocol):
    provider: str
    model: str

    def complete_json(
        self, system: str, user: str, schema: dict[str, Any], schema_name: str
    ) -> ChatResult: ...


class EmbeddingProvider(Protocol):
    name: str

    def embed(self, texts: list[str]) -> list[list[float]]: ...
