from __future__ import annotations

import os
from collections.abc import Iterator
from datetime import UTC, datetime, timedelta
from typing import Any

import pytest

os.environ.setdefault("AWS_DEFAULT_REGION", "us-east-1")
os.environ.setdefault("AWS_ACCESS_KEY_ID", "testing")
os.environ.setdefault("AWS_SECRET_ACCESS_KEY", "testing")
os.environ.setdefault("POWERTOOLS_TRACE_DISABLED", "true")
os.environ.setdefault("POWERTOOLS_METRICS_NAMESPACE", "FleetIntelTest")
os.environ.setdefault("POWERTOOLS_METRICS_DISABLED", "true")
os.environ.setdefault("POWERTOOLS_LOG_LEVEL", "WARNING")

from fleetintel.bootstrap import Container, build_container, set_container
from fleetintel.config import Settings
from fleetintel.domain import TelemetryEvent

T0 = datetime(2026, 10, 1, tzinfo=UTC)
CELL = "310-260-1000-100001"


def event(
    device: int = 1,
    ts: datetime = T0,
    cell: str = CELL,
    seq: int = 0,
    **kw: Any,
) -> TelemetryEvent:
    base: dict[str, Any] = {
        "v": 1,
        "event_id": f"dev-{device:08d}:{seq}",
        "tenant": "acme",
        "device_id": f"dev-{device:08d}",
        "profile": "asset_tracker",
        "ts": ts,
        "seq": seq,
        "cell_id": cell,
        "plmn": "310260",
        "home_plmn": "310260",
        "roaming": False,
        "rat": "LTE-M",
        "apn": "track.fleet.iot",
        "rsrp": -95.0,
        "rsrq": -10.0,
        "sinr": 9.0 + (device % 5) * 0.4,
        "rssi": -70.0,
        "conn_state": "connected",
        "reconnects": 0,
        "latency_ms": 200,
        "battery_pct": 80.0,
        "firmware": "TRK-1.8.4",
        "uptime_s": 1000,
        "payload_bytes": 100,
    }
    base.update(kw)
    return TelemetryEvent.model_validate(base)


def stream(
    windows: int,
    devices: int = 40,
    fault: Any = None,
    fault_from: int = 10**9,
    start: datetime = T0,
    cell: str = CELL,
) -> list[TelemetryEvent]:
    """One event per device per 60 s window; ``fault(i, ev_kwargs)`` mutates from ``fault_from``."""
    out = []
    for w in range(windows):
        for d in range(devices):
            kw: dict[str, Any] = {}
            if w >= fault_from and fault is not None:
                fault(d, kw)
            out.append(
                event(
                    device=d, ts=start + timedelta(seconds=60 * w + d % 50), cell=cell, seq=w, **kw
                )
            )
    return out


@pytest.fixture
def container() -> Iterator[Container]:
    c = build_container(Settings())
    set_container(c)
    yield c
    set_container(None)


@pytest.fixture
def settings_env(monkeypatch: pytest.MonkeyPatch) -> pytest.MonkeyPatch:
    for k in list(os.environ):
        if k.startswith("FLEETINTEL_"):
            monkeypatch.delenv(k, raising=False)
    return monkeypatch
