from __future__ import annotations

import json
import random
from datetime import timedelta
from pathlib import Path
from typing import Any

import httpx
import pytest
import respx

from conftest import CELL, T0
from fleetintel.adapters.memory import InMemoryCache
from fleetintel.domain import EnrichmentStatus, FaultType, Incident, MetricSignal, ScopeType
from fleetintel.enrichment.providers import (
    FixtureStatusFeed,
    FixtureWeather,
    HashedCellTowers,
    OpenCelliDTowers,
    OpenMeteoWeather,
    ProviderNotConfiguredError,
    StaticCarrierRegistry,
    StatuspageFeed,
)
from fleetintel.enrichment.service import EnrichmentService, relevance_tokens
from fleetintel.resilience import (
    BreakerState,
    CircuitBreaker,
    CircuitOpenError,
    ResilientCaller,
    RetryPolicy,
    is_retryable,
)

FIXTURES = Path(__file__).parent / "fixtures"


class Clock:
    def __init__(self) -> None:
        self.t = 0.0

    def __call__(self) -> float:
        return self.t


def test_retry_retries_transient_then_succeeds() -> None:
    sleeps: list[float] = []
    calls = {"n": 0}

    def flaky() -> str:
        calls["n"] += 1
        if calls["n"] < 3:
            raise httpx.ConnectTimeout("slow")
        return "ok"

    policy = RetryPolicy(
        attempts=3, base_delay=0.1, max_delay=1, sleep=sleeps.append, rng=random.Random(1)
    )
    assert policy.run(flaky) == "ok"
    assert len(sleeps) == 2 and all(0 <= s <= 0.2 for s in sleeps)


def test_retry_does_not_retry_client_errors() -> None:
    req = httpx.Request("GET", "http://x")
    err = httpx.HTTPStatusError("bad", request=req, response=httpx.Response(404, request=req))
    assert not is_retryable(err)
    assert is_retryable(
        httpx.HTTPStatusError("busy", request=req, response=httpx.Response(429, request=req))
    )
    assert not is_retryable(ValueError())
    policy = RetryPolicy(attempts=5, sleep=lambda _: None)
    with pytest.raises(httpx.HTTPStatusError):
        policy.run(lambda: (_ for _ in ()).throw(err))


def test_circuit_breaker_opens_half_opens_and_closes() -> None:
    clock = Clock()
    b = CircuitBreaker("dep", failure_threshold=2, reset_timeout=10, clock=clock)

    def boom() -> None:
        raise RuntimeError("down")

    for _ in range(2):
        with pytest.raises(RuntimeError):
            b.call(boom)
    assert b.state is BreakerState.OPEN
    with pytest.raises(CircuitOpenError):
        b.call(lambda: "never called")
    clock.t = 11
    with pytest.raises(RuntimeError):  # half-open trial fails -> open again
        b.call(boom)
    assert b.state is BreakerState.OPEN
    clock.t = 22
    assert b.call(lambda: "ok") == "ok"
    assert b.state is BreakerState.CLOSED and b.failures == 0


def test_resilient_caller_caches() -> None:
    cache = InMemoryCache(clock=lambda: 0)
    rc = ResilientCaller(
        CircuitBreaker("x"), RetryPolicy(sleep=lambda _: None), cache, ttl_seconds=60
    )
    calls = {"n": 0}

    def fn() -> dict[str, Any]:
        calls["n"] += 1
        return {"v": 1}

    assert rc.call("k", fn) == ({"v": 1}, False)
    assert rc.call("k", fn) == ({"v": 1}, True)
    assert calls["n"] == 1


@respx.mock
def test_open_meteo_adapter_parses_recorded_fixture() -> None:
    body = json.loads((FIXTURES / "open_meteo_current.json").read_text())
    route = respx.get("https://api.open-meteo.com/v1/forecast").mock(
        return_value=httpx.Response(200, json=body)
    )
    w = OpenMeteoWeather(httpx.Client(), "https://api.open-meteo.com/v1/forecast").current(
        40.71, -74.01
    )
    assert w["severe"] is True and w["wind_gusts_kmh"] == 92.2 and w["source"] == "open-meteo"
    assert route.calls.last.request.url.params["latitude"] == "40.71"


@respx.mock
def test_opencellid_and_statuspage_adapters() -> None:
    respx.get("https://opencellid.org/cell/get").mock(
        return_value=httpx.Response(200, json={"lat": 40.1, "lon": -75.2, "range": 1200})
    )
    t = OpenCelliDTowers(httpx.Client(), "https://opencellid.org/cell/get", "k").locate(CELL)
    assert t == {"lat": 40.1, "lon": -75.2, "range_m": 1200, "tac": 1000, "source": "opencellid"}
    with pytest.raises(ProviderNotConfiguredError):
        OpenCelliDTowers(httpx.Client(), "u", "").locate(CELL)
    respx.get("https://opencellid.org/cell/miss").mock(
        return_value=httpx.Response(200, json={"error": "nf"})
    )
    with pytest.raises(LookupError):
        OpenCelliDTowers(httpx.Client(), "https://opencellid.org/cell/miss", "k").locate(CELL)

    feed = json.loads(
        (
            Path(__file__).parents[1] / "src/fleetintel/enrichment/fixtures/status_feed.json"
        ).read_text()
    )
    respx.get("https://status.example/api/v2/incidents/unresolved.json").mock(
        return_value=httpx.Response(200, json=feed)
    )
    items = StatuspageFeed(
        httpx.Client(), "https://status.example/api/v2/incidents/unresolved.json"
    ).active_incidents()
    assert len(items) == 2 and items[0]["components"] == ["SMS"]
    with pytest.raises(ProviderNotConfiguredError):
        StatuspageFeed(httpx.Client(), "").active_incidents()


def test_fakes_are_deterministic() -> None:
    a, b = HashedCellTowers().locate(CELL), HashedCellTowers().locate(CELL)
    assert a == b and 33 <= a["lat"] <= 45
    assert FixtureWeather().current(1.0, 2.0) == FixtureWeather().current(1.0, 2.0)
    assert len(FixtureStatusFeed().active_incidents()) == 2
    reg = StaticCarrierRegistry(allowed_visited={"23415"})
    assert reg.lookup("26201", "310260")["roaming_agreement"] is False
    assert reg.lookup("23415", "310260")["roaming_agreement"] is True
    assert "roaming_agreement" not in reg.lookup("310260")
    assert reg.lookup("99999")["operator"] == "unknown"


def make_incident(scope_type: ScopeType = ScopeType.CELL, scope: str = CELL) -> Incident:
    return Incident(
        incident_id="inc-test",
        tenant="acme",
        suspected_fault=FaultType.CELL_OUTAGE,
        scope_type=scope_type,
        scope=scope,
        opened_at=T0,
        last_seen_at=T0 + timedelta(minutes=1),
        severity="high",
        affected_devices=30,
        total_devices=40,
        signals=[MetricSignal(metric="no_service_ratio", value=0.9, baseline=0.003, zscore=40)],
        sample_device_ids=["dev-00000001", "dev-00000002"],
    )


def service(towers: Any = None, weather: Any = None, feed: Any = None) -> EnrichmentService:
    def caller(name: str) -> ResilientCaller:
        return ResilientCaller(
            CircuitBreaker(name, 1), RetryPolicy(attempts=1), InMemoryCache(), 60
        )

    return EnrichmentService(
        towers=towers or HashedCellTowers(),
        weather=weather or FixtureWeather(),
        carrier=StaticCarrierRegistry(),
        status_feed=feed or FixtureStatusFeed(),
        callers={n: caller(n) for n in ("celltower", "weather", "carrier", "status_feed")},
    )


def test_enrichment_for_each_scope() -> None:
    ctx = service().enrich(make_incident())
    assert [i.source for i in ctx.items] == ["carrier", "celltower", "status_feed", "weather"]
    assert all(i.status is EnrichmentStatus.OK for i in ctx.items)
    feed = ctx.by_source("status_feed")
    assert feed is not None and feed.data["relevant"] == [] and feed.data["total_active"] == 2

    plmn = service().enrich(make_incident(ScopeType.PLMN, "26201"))
    carrier = plmn.by_source("carrier")
    assert carrier is not None and carrier.data["roaming_agreement"] is True
    fw = service().enrich(make_incident(ScopeType.FIRMWARE, "MTR-3.3.1"))
    assert {i.source for i in fw.items} == {"carrier", "status_feed"}


def test_enrichment_degrades_gracefully() -> None:
    class Broken:
        name = "celltower"

        def locate(self, cell_id: str) -> dict[str, Any]:
            raise httpx.ConnectError("down")

    svc = service(towers=Broken())
    ctx = svc.enrich(make_incident())
    tower, weather = ctx.by_source("celltower"), ctx.by_source("weather")
    assert (
        tower is not None
        and tower.status is EnrichmentStatus.UNAVAILABLE
        and tower.error == "ConnectError"
    )
    assert weather is not None and weather.error == "no location"
    # breaker (threshold 1) is now open: the provider is not called again
    again = svc.enrich(make_incident()).by_source("celltower")
    assert again is not None and again.error is not None and "open" in again.error


def test_relevance_tokens() -> None:
    assert "tac 1000" in relevance_tokens(make_incident())
    assert "roaming" in relevance_tokens(make_incident(ScopeType.PLMN, "26201"))
    assert "apn" in relevance_tokens(make_incident(ScopeType.APN, "track.fleet.iot"))
