from __future__ import annotations

from datetime import timedelta
from typing import Any

from conftest import CELL, T0, event, stream
from fleetintel.detection import DetectorConfig, Ewma, StreamDetector, classify, severity
from fleetintel.domain import FaultType, ScopeType


def outage(_: int, kw: dict[str, Any]) -> None:
    kw.update(conn_state="no_service", rsrp=-140.0, sinr=-20.0, latency_ms=0)


def run(
    events: list[Any], cfg: DetectorConfig | None = None
) -> tuple[StreamDetector, list[Any], list[Any]]:
    d = StreamDetector(cfg)
    out = d.process(events)
    fl = d.flush()
    return d, out.opened + fl.opened, out.updated + fl.updated


def test_ewma_tracks_mean_and_variance() -> None:
    e = Ewma(mean=0.0)
    for x in [10.0] * 50:
        e.update(x, 0.2)
    assert abs(e.mean - 10.0) < 1e-9
    assert e.var < 1e-9
    e.update(20.0, 0.2)
    assert 10 < e.mean < 20
    assert e.zscore(30.0, std_floor=1.0) > 0


def test_healthy_stream_raises_nothing() -> None:
    _, opened, updated = run(stream(windows=20))
    assert opened == [] and updated == []


def test_cell_outage_detected_as_one_episode() -> None:
    _, opened, updated = run(stream(windows=20, fault=outage, fault_from=10))
    assert len(opened) == 1
    inc = opened[0]
    assert inc.suspected_fault is FaultType.CELL_OUTAGE
    assert inc.scope_type is ScopeType.CELL and inc.scope == CELL
    assert inc.opened_at == T0 + timedelta(minutes=10)
    assert inc.affected_devices == 40 and inc.severity == "critical"
    assert any(s.metric == "no_service_ratio" and s.zscore >= 4 for s in inc.signals)
    assert len(inc.sample_device_ids) == 10
    # subsequent anomalous windows extend the same incident
    assert updated and {u.incident_id for u in updated} == {inc.incident_id}
    assert max(u.windows for u in updated) == 10


def test_congestion_storm_and_category_scopes() -> None:
    def congestion(_: int, kw: dict[str, Any]) -> None:
        kw.update(sinr=-6.0, latency_ms=2000)

    def storm(d: int, kw: dict[str, Any]) -> None:
        kw.update(reconnects=8 + d % 5)

    def apn(_: int, kw: dict[str, Any]) -> None:
        kw.update(conn_state="pdn_reject", cause="ESM_27")

    def firmware(d: int, kw: dict[str, Any]) -> None:
        if d % 2 == 0:
            kw.update(reset_reason="watchdog", reconnects=1)

    def roaming(_: int, kw: dict[str, Any]) -> None:
        kw.update(roaming=True, plmn="26201", conn_state="attach_reject", cause="EMM_15")

    cases = [
        (congestion, FaultType.CONGESTION, ScopeType.CELL),
        (storm, FaultType.RECONNECT_STORM, ScopeType.CELL),
        (apn, FaultType.APN_ERROR, ScopeType.APN),
        (firmware, FaultType.FIRMWARE_REGRESSION, ScopeType.FIRMWARE),
    ]
    for fn, fault, scope in cases:
        _, opened, _ = run(stream(windows=16, fault=fn, fault_from=8))
        assert [(i.suspected_fault, i.scope_type) for i in opened] == [(fault, scope)], fault

    # roaming devices are healthy roamers first, then get rejected on one visited network
    def roamer(_: int, kw: dict[str, Any]) -> None:
        kw.update(roaming=True, plmn="26201")

    healthy = stream(windows=8, fault=roamer, fault_from=0)
    broken = stream(windows=8, fault=roaming, fault_from=0, start=T0 + timedelta(minutes=8))
    _, opened, _ = run(healthy + broken)
    faults = {(i.suspected_fault, i.scope) for i in opened}
    assert (FaultType.ROAMING_MISCONFIG, "26201") in faults


def test_min_samples_and_effect_size_guards() -> None:
    # 3 devices only: below min_samples -> never alerts
    _, opened, _ = run(stream(windows=20, devices=3, fault=outage, fault_from=10))
    assert opened == []

    # tiny shift: z may be large on a quiet baseline but effect size is too small
    def slight(d: int, kw: dict[str, Any]) -> None:
        if d == 0:
            kw.update(conn_state="no_service")

    _, opened, _ = run(stream(windows=20, fault=slight, fault_from=10))
    assert opened == []


def test_late_events_are_dropped_and_counted() -> None:
    d = StreamDetector()
    d.process(stream(windows=5))
    out = d.process([event(ts=T0)])  # window long closed
    assert out.late_events == 1


def test_state_roundtrip_is_lossless_and_continues_detection() -> None:
    events = stream(windows=20, fault=outage, fault_from=10)
    a = StreamDetector()
    a.process(events[:400])
    b = StreamDetector.from_state(a.to_state())
    assert b.to_state() == a.to_state()
    out = b.process(events[400:])
    fl = b.flush()
    assert [i.suspected_fault for i in out.opened + fl.opened] == [FaultType.CELL_OUTAGE]
    assert StreamDetector.from_state(None).watermark == 0


def test_episode_gap_opens_new_incident() -> None:
    first = stream(windows=14, fault=outage, fault_from=10)
    healthy = stream(windows=6, start=T0 + timedelta(minutes=14))
    second = stream(windows=4, fault=outage, fault_from=0, start=T0 + timedelta(minutes=20))
    _, opened, _ = run(first + healthy + second)
    assert len(opened) == 2
    assert opened[0].incident_id != opened[1].incident_id


def test_classify_and_severity_rules() -> None:
    assert classify(ScopeType.CELL, {"reconnects_per_event"}, {"attach_reject_ratio": 0.9}) is None
    assert classify(ScopeType.CELL, {"attach_reject_ratio"}, {}) is None
    assert classify(ScopeType.PLMN, set(), {}) is None
    assert severity(FaultType.CELL_OUTAGE, 10, 10) == "high"
    assert severity(FaultType.FIRMWARE_REGRESSION, 120, 1000) == "high"
    assert severity(FaultType.FIRMWARE_REGRESSION, 30, 100) == "medium"
    assert severity(FaultType.FIRMWARE_REGRESSION, 1, 100) == "low"
    assert severity(FaultType.FIRMWARE_REGRESSION, 0, 0) == "low"
