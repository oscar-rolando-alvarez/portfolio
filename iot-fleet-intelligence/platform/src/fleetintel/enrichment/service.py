"""Enrichment service: gathers external context for an incident.

Every provider call goes through ``ResilientCaller`` (cache -> breaker ->
retry -> timeout). Failures never fail the incident: they degrade to an
``unavailable`` item so diagnosis can proceed with partial context and say so.
"""

from __future__ import annotations

import contextvars
import time
from collections.abc import Callable
from concurrent.futures import ThreadPoolExecutor
from typing import Any

from aws_lambda_powertools import Logger
from opentelemetry import trace

from fleetintel.domain import (
    EnrichmentContext,
    EnrichmentItem,
    EnrichmentStatus,
    Incident,
    ScopeType,
)
from fleetintel.enrichment.providers import PLMN_REGISTRY, parse_cell_id
from fleetintel.ports import (
    CarrierProvider,
    CellTowerProvider,
    StatusFeedProvider,
    WeatherProvider,
)
from fleetintel.resilience import CircuitOpenError, ResilientCaller

logger = Logger(service="fleetintel", child=True)
otel = trace.get_tracer("fleetintel.enrichment")

HOME_PLMN = "310260"


class EnrichmentService:
    def __init__(
        self,
        towers: CellTowerProvider,
        weather: WeatherProvider,
        carrier: CarrierProvider,
        status_feed: StatusFeedProvider,
        callers: dict[str, ResilientCaller],
        home_plmn: str = HOME_PLMN,
    ) -> None:
        self.towers = towers
        self.weather = weather
        self.carrier = carrier
        self.status_feed = status_feed
        self.callers = callers
        self.home_plmn = home_plmn

    @otel.start_as_current_span("enrichment.provider_call")
    def _call(self, source: str, key: str, fn: Callable[[], dict[str, Any]]) -> EnrichmentItem:
        trace.get_current_span().set_attribute("fleetintel.enrichment.source", source)
        t0 = time.perf_counter()
        try:
            data, cached = self.callers[source].call(f"{source}#{key}", fn)
        except CircuitOpenError as exc:
            return EnrichmentItem(
                source=source, status=EnrichmentStatus.UNAVAILABLE, error=str(exc)
            )
        except Exception as exc:
            logger.warning(
                "enrichment provider failed", extra={"source": source, "error": repr(exc)}
            )
            return EnrichmentItem(
                source=source,
                status=EnrichmentStatus.UNAVAILABLE,
                error=type(exc).__name__,
                latency_ms=round((time.perf_counter() - t0) * 1000, 1),
            )
        return EnrichmentItem(
            source=source,
            status=EnrichmentStatus.OK,
            data=data,
            cached=cached,
            latency_ms=round((time.perf_counter() - t0) * 1000, 1),
        )

    def _geo_and_weather(self, cell_id: str) -> list[EnrichmentItem]:
        tower = self._call("celltower", cell_id, lambda: self.towers.locate(cell_id))
        if tower.status is not EnrichmentStatus.OK:
            return [
                tower,
                EnrichmentItem(
                    source="weather", status=EnrichmentStatus.UNAVAILABLE, error="no location"
                ),
            ]
        lat, lon = float(str(tower.data["lat"])), float(str(tower.data["lon"]))
        weather = self._call(
            "weather", f"{lat:.2f},{lon:.2f}", lambda: self.weather.current(lat, lon)
        )
        return [tower, weather]

    def _status(self, incident: Incident) -> EnrichmentItem:
        item = self._call(
            "status_feed", "active", lambda: {"incidents": self.status_feed.active_incidents()}
        )
        if item.status is EnrichmentStatus.OK:
            incidents: list[dict[str, Any]] = item.data.get("incidents", [])  # type: ignore[assignment]
            tokens = relevance_tokens(incident)
            relevant = [
                i
                for i in incidents
                if any(
                    t in f"{i['name']} {' '.join(i['components'])} {i['latest_update']}".lower()
                    for t in tokens
                )
            ]
            item.data = {"relevant": relevant, "total_active": len(incidents)}
        return item

    def enrich(self, incident: Incident) -> EnrichmentContext:
        tasks: list[Callable[[], list[EnrichmentItem]]] = [lambda: [self._status(incident)]]
        if incident.scope_type is ScopeType.CELL:
            mcc, mnc, _, _ = parse_cell_id(incident.scope)
            plmn = mcc + mnc
            tasks.append(lambda: self._geo_and_weather(incident.scope))
            tasks.append(
                lambda: [
                    self._call("carrier", plmn, lambda: self.carrier.lookup(plmn, self.home_plmn))
                ]
            )
        elif incident.scope_type is ScopeType.PLMN:
            plmn = incident.scope
            tasks.append(
                lambda: [
                    self._call("carrier", plmn, lambda: self.carrier.lookup(plmn, self.home_plmn))
                ]
            )
        else:
            tasks.append(
                lambda: [
                    self._call(
                        "carrier", self.home_plmn, lambda: self.carrier.lookup(self.home_plmn, None)
                    )
                ]
            )
        with ThreadPoolExecutor(max_workers=len(tasks), thread_name_prefix="enrich") as pool:
            # copy the context so provider spans stay children of the current trace
            futures = [pool.submit(contextvars.copy_context().run, t) for t in tasks]
            items = [item for f in futures for item in f.result()]
        items.sort(key=lambda i: i.source)
        return EnrichmentContext(incident_id=incident.incident_id, items=items)


def relevance_tokens(incident: Incident) -> list[str]:
    tokens = {"roaming"} if incident.scope_type is ScopeType.PLMN else set()
    if incident.scope_type is ScopeType.CELL:
        _, _, tac, eci = parse_cell_id(incident.scope)
        tokens |= {f"tac {tac}", f"cell {eci}", incident.scope}
    if incident.scope_type is ScopeType.PLMN:
        operator = PLMN_REGISTRY.get(incident.scope, {}).get("operator")
        tokens |= {incident.scope} | ({operator} if operator else set())
    if incident.scope_type in (ScopeType.APN, ScopeType.FIRMWARE):
        tokens |= {
            incident.scope.lower(),
            "apn" if incident.scope_type is ScopeType.APN else "firmware",
        }
    return sorted(t.lower() for t in tokens)
