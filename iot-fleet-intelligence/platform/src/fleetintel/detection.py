"""Windowed, stateful anomaly detection over the telemetry stream.

Design (see docs/adr/0004-streaming-anomaly-detection.md):

* Events are aggregated into tumbling event-time windows per *scope*:
  cell, visited network (PLMN, roaming devices only), APN and firmware build.
* When the watermark (max event time - allowed lateness) passes a window, each
  scope's window metrics are compared with an EWMA baseline (mean + variance).
  A metric is anomalous when its z-score exceeds ``z_threshold`` **and** the
  absolute change exceeds a per-metric minimum effect size (guards against
  tiny-variance baselines) **and** the window has ``min_samples`` events.
* Anomalous windows do not update the baseline (no self-poisoning), unless a
  level shift persists long enough to become the new normal.
* A rule table maps anomalous metric sets to a *suspected* fault class. The
  LLM diagnosis later confirms or overrides it with enrichment context.
* Consecutive anomalous windows for the same (scope, fault) form one episode,
  i.e. one incident with a deterministic id.

The detector is a pure, serialisable state machine: Lambda persists it per
Kafka partition between invocations (see ``DetectorStateStore``).
"""

from __future__ import annotations

import math
from collections import Counter
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any

from fleetintel.domain import (
    ConnState,
    FaultType,
    Incident,
    MetricSignal,
    ScopeType,
    TelemetryEvent,
)

ID_CAP = 512  # max distinct ids tracked per window/scope (bounds state size)
SAMPLE_IDS = 10
LEVEL_SHIFT_WINDOWS = 30  # accept a persistent anomaly as the new normal


@dataclass(frozen=True, slots=True)
class MetricRule:
    metric: str
    direction: int  # +1 = alert when it goes up, -1 = when it goes down
    min_delta: float  # minimum absolute effect size
    std_floor: float  # variance floor for the z-score denominator
    prior: float  # baseline used before enough history exists


RULES: dict[ScopeType, tuple[MetricRule, ...]] = {
    ScopeType.CELL: (
        MetricRule("no_service_ratio", +1, 0.25, 0.02, 0.003),
        MetricRule("sinr_mean_db", -1, 5.0, 1.0, 9.0),
        MetricRule("reconnects_per_event", +1, 2.0, 0.1, 0.03),
        MetricRule("attach_reject_ratio", +1, 0.10, 0.02, 0.0),
    ),
    ScopeType.PLMN: (MetricRule("attach_reject_ratio", +1, 0.20, 0.02, 0.006),),
    ScopeType.APN: (MetricRule("pdn_reject_ratio", +1, 0.20, 0.01, 0.002),),
    ScopeType.FIRMWARE: (MetricRule("reset_ratio", +1, 0.10, 0.01, 0.001),),
}

SUPPORTING = ("latency_ms_mean", "reconnects_per_event", "attach_reject_ratio", "no_service_ratio")


def classify(
    scope_type: ScopeType, anomalous: set[str], metrics: dict[str, float]
) -> FaultType | None:
    """Map a set of anomalous metrics on a scope to a suspected fault class."""
    if scope_type is ScopeType.CELL:
        if "no_service_ratio" in anomalous:
            return FaultType.CELL_OUTAGE
        if "sinr_mean_db" in anomalous:
            return FaultType.CONGESTION
        if (
            "reconnects_per_event" in anomalous
            and metrics.get("attach_reject_ratio", 0) < 0.3
            and metrics.get("no_service_ratio", 0) < 0.3
        ):
            return FaultType.RECONNECT_STORM
        return None
    if scope_type is ScopeType.PLMN and "attach_reject_ratio" in anomalous:
        return FaultType.ROAMING_MISCONFIG
    if scope_type is ScopeType.APN and "pdn_reject_ratio" in anomalous:
        return FaultType.APN_ERROR
    if scope_type is ScopeType.FIRMWARE and "reset_ratio" in anomalous:
        return FaultType.FIRMWARE_REGRESSION
    return None


@dataclass(slots=True)
class Ewma:
    """Exponentially weighted mean/variance (West 1979 incremental form)."""

    mean: float
    var: float = 0.0
    n: int = 0
    streak: int = 0  # consecutive anomalous windows

    def update(self, x: float, alpha: float) -> None:
        if self.n == 0:
            self.mean, self.var = x, 0.0
        else:
            diff = x - self.mean
            incr = alpha * diff
            self.mean += incr
            self.var = (1 - alpha) * (self.var + diff * incr)
        self.n += 1

    def zscore(self, x: float, std_floor: float) -> float:
        return (x - self.mean) / max(math.sqrt(self.var), std_floor)


@dataclass(slots=True)
class WindowAgg:
    n: int = 0
    connected: int = 0
    no_service: int = 0
    attach_reject: int = 0
    pdn_reject: int = 0
    resets: int = 0
    reconnects: int = 0
    sinr_sum: float = 0.0
    latency_sum: float = 0.0
    devices: set[str] = field(default_factory=set)
    abnormal: set[str] = field(default_factory=set)
    abnormal_events: int = 0
    causes: Counter[str] = field(default_factory=Counter)
    profiles: Counter[str] = field(default_factory=Counter)
    rats: Counter[str] = field(default_factory=Counter)

    def add(self, e: TelemetryEvent) -> None:
        self.n += 1
        state = e.conn_state
        if state is ConnState.CONNECTED:
            self.connected += 1
            self.sinr_sum += e.sinr
            self.latency_sum += e.latency_ms
        elif state is ConnState.NO_SERVICE:
            self.no_service += 1
        elif state is ConnState.ATTACH_REJECT:
            self.attach_reject += 1
        else:
            self.pdn_reject += 1
        if e.cause:
            self.causes[e.cause] += 1
        if e.reset_reason:
            self.resets += 1
        self.reconnects += e.reconnects
        self.profiles[e.profile] += 1
        self.rats[e.rat] += 1
        if len(self.devices) < ID_CAP:
            self.devices.add(e.device_id)
        if state is not ConnState.CONNECTED or e.reconnects >= 3 or e.reset_reason:
            self.abnormal_events += 1
            if len(self.abnormal) < ID_CAP:
                self.abnormal.add(e.device_id)

    def metrics(self) -> dict[str, float]:
        n = max(self.n, 1)
        c = max(self.connected, 1)
        return {
            "no_service_ratio": self.no_service / n,
            "attach_reject_ratio": self.attach_reject / n,
            "pdn_reject_ratio": self.pdn_reject / n,
            "reset_ratio": self.resets / n,
            "reconnects_per_event": self.reconnects / n,
            "sinr_mean_db": self.sinr_sum / c if self.connected else 0.0,
            "latency_ms_mean": self.latency_sum / c if self.connected else 0.0,
        }

    def distinct_devices(self) -> int:
        return len(self.devices) if len(self.devices) < ID_CAP else max(self.n, ID_CAP)

    def affected_devices(self) -> int:
        return (
            len(self.abnormal) if len(self.abnormal) < ID_CAP else max(self.abnormal_events, ID_CAP)
        )

    def to_dict(self) -> dict[str, Any]:
        return {
            "n": self.n,
            "c": self.connected,
            "ns": self.no_service,
            "ar": self.attach_reject,
            "pr": self.pdn_reject,
            "rs": self.resets,
            "rc": self.reconnects,
            "si": round(self.sinr_sum, 3),
            "la": round(self.latency_sum, 3),
            "d": sorted(self.devices),
            "ab": sorted(self.abnormal),
            "ae": self.abnormal_events,
            "ca": dict(self.causes),
            "pf": dict(self.profiles),
            "rt": dict(self.rats),
        }

    @classmethod
    def from_dict(cls, d: dict[str, Any]) -> WindowAgg:
        return cls(
            n=d["n"],
            connected=d["c"],
            no_service=d["ns"],
            attach_reject=d["ar"],
            pdn_reject=d["pr"],
            resets=d["rs"],
            reconnects=d["rc"],
            sinr_sum=d["si"],
            latency_sum=d["la"],
            devices=set(d["d"]),
            abnormal=set(d["ab"]),
            abnormal_events=d["ae"],
            causes=Counter(d["ca"]),
            profiles=Counter(d["pf"]),
            rats=Counter(d["rt"]),
        )


@dataclass(slots=True)
class Episode:
    incident_id: str
    opened_at: datetime
    last_window: int
    windows: int


@dataclass(frozen=True, slots=True)
class DetectorConfig:
    window_seconds: int = 60
    allowed_lateness_seconds: int = 30
    z_threshold: float = 4.0
    ewma_alpha: float = 0.2
    min_samples: int = 8
    warmup_windows: int = 3
    episode_gap_windows: int = 3


@dataclass(slots=True)
class DetectionOutput:
    opened: list[Incident] = field(default_factory=list)
    updated: list[Incident] = field(default_factory=list)
    late_events: int = 0
    windows_closed: int = 0


def scope_keys(e: TelemetryEvent) -> list[tuple[ScopeType, str]]:
    keys = [(ScopeType.CELL, e.cell_id), (ScopeType.APN, e.apn), (ScopeType.FIRMWARE, e.firmware)]
    if e.roaming:
        keys.append((ScopeType.PLMN, e.plmn))
    return keys


class StreamDetector:
    """Stateful detector for one stream shard (e.g. one Kafka partition)."""

    def __init__(self, config: DetectorConfig | None = None) -> None:
        self.cfg = config or DetectorConfig()
        # window_start(epoch s) -> "tenant|scope_type|scope" -> aggregate
        self.windows: dict[int, dict[str, WindowAgg]] = {}
        self.baselines: dict[str, Ewma] = {}  # "scope_key#metric"
        self.history: dict[str, int] = {}  # scope_key -> closed windows seen
        self.episodes: dict[str, Episode] = {}  # "scope_key#fault"
        self.watermark: int = 0
        self.closed_until: int = 0  # windows starting before this are closed

    # ------------------------------------------------------------------ ingest
    def process(self, events: list[TelemetryEvent]) -> DetectionOutput:
        out = DetectionOutput()
        w = self.cfg.window_seconds
        for e in events:
            ts = int(e.ts.timestamp())
            start = ts - ts % w
            if start < self.closed_until:
                out.late_events += 1
                continue
            bucket = self.windows.get(start)
            if bucket is None:
                bucket = self.windows[start] = {}
            for scope_type, scope in scope_keys(e):
                key = f"{e.tenant}|{scope_type.value}|{scope}"
                agg = bucket.get(key)
                if agg is None:
                    agg = bucket[key] = WindowAgg()
                agg.add(e)
            self.watermark = max(self.watermark, ts)
        self._close_ready(out)
        return out

    def flush(self) -> DetectionOutput:
        """Close every open window (end of a bounded replay, e.g. evals)."""
        out = DetectionOutput()
        self.watermark = max([*self.windows.keys(), self.watermark]) + 10 * self.cfg.window_seconds
        self._close_ready(out)
        return out

    # ------------------------------------------------------------------ windows
    def _close_ready(self, out: DetectionOutput) -> None:
        w = self.cfg.window_seconds
        limit = self.watermark - self.cfg.allowed_lateness_seconds
        for start in sorted(s for s in self.windows if s + w <= limit):
            bucket = self.windows.pop(start)
            for key in sorted(bucket):
                self._evaluate(key, start, bucket[key], out)
            self.closed_until = max(self.closed_until, start + w)
            out.windows_closed += 1

    def _evaluate(self, key: str, start: int, agg: WindowAgg, out: DetectionOutput) -> None:
        tenant, scope_type_s, scope = key.split("|", 2)
        scope_type = ScopeType(scope_type_s)
        metrics = agg.metrics()
        seen = self.history.get(key, 0)
        enough = agg.n >= self.cfg.min_samples
        anomalous: set[str] = set()
        signals: list[MetricSignal] = []
        for rule in RULES[scope_type]:
            if rule.metric == "sinr_mean_db" and agg.connected < self.cfg.min_samples:
                continue
            x = metrics[rule.metric]
            bkey = f"{key}#{rule.metric}"
            base = self.baselines.get(bkey)
            if base is None:
                base = self.baselines[bkey] = Ewma(mean=rule.prior)
            ref = base.mean if base.n >= self.cfg.warmup_windows else rule.prior
            z = (
                base.zscore(x, rule.std_floor)
                if base.n >= self.cfg.warmup_windows
                else (x - ref) / rule.std_floor
            )
            is_anom = (
                enough
                and z * rule.direction >= self.cfg.z_threshold
                and (x - ref) * rule.direction >= rule.min_delta
            )
            if is_anom:
                anomalous.add(rule.metric)
                signals.append(
                    MetricSignal(
                        metric=rule.metric,
                        value=round(x, 4),
                        baseline=round(ref, 4),
                        zscore=round(z, 2),
                    )
                )
                base.streak += 1
                if base.streak >= LEVEL_SHIFT_WINDOWS:
                    base.update(x, self.cfg.ewma_alpha)
            elif enough:
                base.streak = 0
                base.update(x, self.cfg.ewma_alpha)
        if enough:
            self.history[key] = seen + 1

        fault = classify(scope_type, anomalous, metrics) if anomalous else None
        if fault is None:
            return
        for m in SUPPORTING:
            if m not in anomalous and m in metrics:
                signals.append(
                    MetricSignal(metric=m, value=round(metrics[m], 4), baseline=0.0, zscore=0.0)
                )
        self._record_episode(tenant, scope_type, scope, fault, start, agg, signals, out)

    def _record_episode(
        self,
        tenant: str,
        scope_type: ScopeType,
        scope: str,
        fault: FaultType,
        start: int,
        agg: WindowAgg,
        signals: list[MetricSignal],
        out: DetectionOutput,
    ) -> None:
        w = self.cfg.window_seconds
        ekey = f"{tenant}|{scope_type.value}|{scope}#{fault.value}"
        ep = self.episodes.get(ekey)
        window_ts = datetime.fromtimestamp(start, tz=UTC)
        last_seen = datetime.fromtimestamp(start + w, tz=UTC)
        is_new = ep is None or start - ep.last_window > self.cfg.episode_gap_windows * w
        if ep is None or is_new:
            ep = Episode(
                incident_id=Incident.make_id(tenant, fault, scope, window_ts),
                opened_at=window_ts,
                last_window=start,
                windows=1,
            )
            self.episodes[ekey] = ep
        else:
            ep.last_window = start
            ep.windows += 1
        affected = agg.affected_devices()
        total = agg.distinct_devices()
        incident = Incident(
            incident_id=ep.incident_id,
            tenant=tenant,
            suspected_fault=fault,
            scope_type=scope_type,
            scope=scope,
            opened_at=ep.opened_at,
            last_seen_at=last_seen,
            windows=ep.windows,
            severity=severity(fault, affected, total),
            affected_devices=affected,
            total_devices=total,
            signals=signals,
            sample_device_ids=sorted(agg.abnormal)[:SAMPLE_IDS],
            top_causes=dict(agg.causes.most_common(5)),
            context={
                "profiles": ",".join(f"{k}:{v}" for k, v in agg.profiles.most_common(4)),
                "rats": ",".join(f"{k}:{v}" for k, v in agg.rats.most_common(3)),
                "events_in_window": str(agg.n),
            },
        )
        (out.opened if is_new else out.updated).append(incident)

    # ------------------------------------------------------------ persistence
    def to_state(self) -> dict[str, Any]:
        return {
            "v": 1,
            "watermark": self.watermark,
            "closed_until": self.closed_until,
            "windows": {
                str(s): {k: a.to_dict() for k, a in b.items()} for s, b in self.windows.items()
            },
            "baselines": {k: [b.mean, b.var, b.n, b.streak] for k, b in self.baselines.items()},
            "history": self.history,
            "episodes": {
                k: [e.incident_id, e.opened_at.isoformat(), e.last_window, e.windows]
                for k, e in self.episodes.items()
                # drop stale episodes so state does not grow without bound
                if self.watermark - e.last_window
                < 10 * self.cfg.episode_gap_windows * self.cfg.window_seconds
            },
        }

    @classmethod
    def from_state(
        cls, state: dict[str, Any] | None, config: DetectorConfig | None = None
    ) -> StreamDetector:
        d = cls(config)
        if not state:
            return d
        d.watermark = int(state["watermark"])
        d.closed_until = int(state["closed_until"])
        d.windows = {
            int(s): {k: WindowAgg.from_dict(a) for k, a in b.items()}
            for s, b in state["windows"].items()
        }
        d.baselines = {
            k: Ewma(mean=v[0], var=v[1], n=v[2], streak=v[3]) for k, v in state["baselines"].items()
        }
        d.history = {k: int(v) for k, v in state["history"].items()}
        d.episodes = {
            k: Episode(
                incident_id=v[0],
                opened_at=datetime.fromisoformat(v[1]),
                last_window=v[2],
                windows=v[3],
            )
            for k, v in state["episodes"].items()
        }
        return d


def severity(fault: FaultType, affected: int, total: int) -> str:
    ratio = affected / total if total else 0.0
    if (
        fault in (FaultType.CELL_OUTAGE, FaultType.APN_ERROR, FaultType.ROAMING_MISCONFIG)
        and ratio >= 0.8
    ):
        return "critical" if affected >= 25 else "high"
    if ratio >= 0.5 or affected >= 100:
        return "high"
    if ratio >= 0.2:
        return "medium"
    return "low"
