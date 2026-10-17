"""In-process adapters used by unit tests, evals and the dependency-free demo."""

from __future__ import annotations

import copy
import threading
import time
from typing import Any

from fleetintel.domain import (
    DiagnosisRecord,
    EnrichmentContext,
    Incident,
    IncidentStatus,
)
from fleetintel.ports import StaleStateError, StoredState


class InMemoryIncidentRepository:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self.incidents: dict[str, Incident] = {}
        self.enrichments: dict[str, EnrichmentContext] = {}
        self.diagnoses: dict[str, list[DiagnosisRecord]] = {}

    def upsert_incident(self, incident: Incident) -> bool:
        with self._lock:
            cur = self.incidents.get(incident.incident_id)
            if cur is None:
                self.incidents[incident.incident_id] = incident.model_copy(deep=True)
                return True
            if incident.last_seen_at > cur.last_seen_at:
                self.incidents[incident.incident_id] = incident.model_copy(
                    update={"status": cur.status, "windows": max(cur.windows, incident.windows)},
                    deep=True,
                )
            return False

    def get_bundle(
        self, incident_id: str
    ) -> tuple[Incident | None, EnrichmentContext | None, list[DiagnosisRecord]]:
        with self._lock:
            return (
                self.incidents.get(incident_id),
                self.enrichments.get(incident_id),
                list(self.diagnoses.get(incident_id, [])),
            )

    def list_incidents(
        self, tenant: str, status: IncidentStatus | None, limit: int, cursor: str | None
    ) -> tuple[list[Incident], str | None]:
        with self._lock:
            items = sorted(
                (
                    i
                    for i in self.incidents.values()
                    if i.tenant == tenant and (status is None or i.status == status)
                ),
                key=lambda i: (i.opened_at, i.incident_id),
                reverse=True,
            )
        start = int(cursor) if cursor and cursor.isdigit() else 0
        page = items[start : start + limit]
        nxt = str(start + limit) if start + limit < len(items) else None
        return page, nxt

    def set_status(
        self, incident_id: str, status: IncidentStatus, expected: set[IncidentStatus] | None = None
    ) -> bool:
        with self._lock:
            cur = self.incidents.get(incident_id)
            if cur is None or (expected is not None and cur.status not in expected):
                return False
            self.incidents[incident_id] = cur.model_copy(update={"status": status})
            return True

    def save_enrichment(self, ctx: EnrichmentContext) -> None:
        with self._lock:
            self.enrichments[ctx.incident_id] = ctx

    def save_diagnosis(self, record: DiagnosisRecord) -> None:
        with self._lock:
            self.diagnoses.setdefault(record.incident_id, []).append(record)

    def ping(self) -> bool:
        return True


class InMemoryStateStore:
    def __init__(self) -> None:
        self._items: dict[str, StoredState] = {}
        self._lock = threading.Lock()

    def load(self, shard: str) -> StoredState:
        with self._lock:
            s = self._items.get(shard)
            return copy.deepcopy(s) if s else StoredState(state=None, version=0, last_offset=-1)

    def save(
        self, shard: str, state: dict[str, Any], last_offset: int, expected_version: int
    ) -> None:
        with self._lock:
            cur = self._items.get(shard)
            if (cur.version if cur else 0) != expected_version:
                raise StaleStateError(shard)
            self._items[shard] = StoredState(
                copy.deepcopy(state), expected_version + 1, last_offset
            )


class InMemoryQueue:
    def __init__(self) -> None:
        self.messages: list[dict[str, Any]] = []
        self._lock = threading.Lock()

    def publish(self, messages: list[dict[str, Any]]) -> None:
        with self._lock:
            self.messages.extend(messages)

    def drain(self) -> list[dict[str, Any]]:
        with self._lock:
            out, self.messages = self.messages, []
            return out


class InMemoryCache:
    def __init__(self, clock: Any = time.time) -> None:
        self._items: dict[str, tuple[float, dict[str, Any]]] = {}
        self._clock = clock

    def get(self, key: str) -> dict[str, Any] | None:
        hit = self._items.get(key)
        if hit is None or hit[0] < self._clock():
            return None
        return hit[1]

    def put(self, key: str, value: dict[str, Any], ttl_seconds: int) -> None:
        self._items[key] = (self._clock() + ttl_seconds, value)
