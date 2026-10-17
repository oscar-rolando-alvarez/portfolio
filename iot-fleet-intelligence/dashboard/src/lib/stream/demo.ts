/**
 * Demo mode: a deterministic, in-browser stand-in for the live gateway.
 *
 * It emits exactly the gateway's frame shapes (hello / snapshot / cells /
 * incident) from a pure function of (tenant, scenario second), so the
 * dashboard runs anywhere without a backend, every reload looks the same and
 * tests/screenshots are reproducible. The fleet mirrors the Go simulator's
 * catalogue (profiles, reporting intervals, RATs, PLMNs, firmware builds,
 * cell id format) and the scenario replays its fault types on a 15-minute loop:
 * a cell outage that spreads across one tracking area, congestion, a firmware
 * regression, a roaming misconfiguration and an APN error.
 */
import { hash32, siteLocation } from "../geo";
import { CUSTOMER, REMEDIATION, ROOT_ES, RUNBOOKS, SCOPE_ES } from "./demo-content";
import type {
  Anomaly,
  CellFrame,
  DiagnosisRecord,
  DimStat,
  FaultType,
  Hello,
  IncidentStatus,
  IncidentView,
  Point,
  ScopeType,
  Severity,
  Snapshot,
} from "./types";

export const CYCLE_SECONDS = 900;
export const DEFAULT_START_T = 105; // the spreading outage starts 15 s after the page opens

export interface DemoTenant {
  id: string;
  name: string;
  devices: number;
  homeCells: number;
  roamingCellsPerPlmn: number;
  seed: number;
}

export const DEMO_TENANTS: DemoTenant[] = [
  { id: "acme-utilities", name: "Acme Utilities", devices: 1_000_000, homeCells: 2048, roamingCellsPerPlmn: 96, seed: 42 },
  { id: "globex-logistics", name: "Globex Logistics", devices: 250_000, homeCells: 768, roamingCellsPerPlmn: 64, seed: 7 },
  { id: "andes-energia", name: "Andes Energía", devices: 400_000, homeCells: 1024, roamingCellsPerPlmn: 48, seed: 11 },
];

export function demoTenant(id: string): DemoTenant {
  return DEMO_TENANTS.find((t) => t.id === id) ?? DEMO_TENANTS[0]!;
}

// ---- fleet catalogue (simulator/internal/fleet/catalog.go) -------------------
const PROFILES = [
  {
    name: "smart_meter",
    share: 0.4,
    interval: 300,
    rat: "NB-IoT",
    apn: "meter.fleet.iot",
    firmware: ["MTR-3.2.0", "MTR-3.3.1"],
    fw: [0.7, 0.3],
  },
  {
    name: "asset_tracker",
    share: 0.25,
    interval: 60,
    rat: "LTE-M",
    apn: "track.fleet.iot",
    firmware: ["TRK-1.8.4", "TRK-1.9.0"],
    fw: [0.6, 0.4],
  },
  {
    name: "vehicle_telematics",
    share: 0.15,
    interval: 30,
    rat: "LTE",
    apn: "telematics.fleet.iot",
    firmware: ["VTU-5.0.2", "VTU-5.1.0"],
    fw: [0.8, 0.2],
  },
  { name: "industrial_sensor", share: 0.2, interval: 60, rat: "LTE-M", apn: "industrial.fleet.iot", firmware: ["IND-2.1.7"], fw: [1] },
] as const;
const EVENTS_PER_DEVICE_SECOND = PROFILES.reduce((s, p) => s + p.share / p.interval, 0);
const ROAMING_PLMNS = [
  ["262", "01"],
  ["234", "15"],
  ["208", "01"],
  ["222", "10"],
] as const;

export interface DemoCell {
  id: string;
  devices: number;
  lat: number;
  lon: number;
  tac: number;
  plmn: string;
}

const cellCache = new Map<string, DemoCell[]>();

export function demoCells(t: DemoTenant): DemoCell[] {
  const cached = cellCache.get(t.id);
  if (cached) return cached;
  const cells: DemoCell[] = [];
  const homeDevices = t.devices * 0.88;
  const make = (mcc: string, mnc: string, k: number, perCell: number) => {
    const tac = 1000 + Math.floor(k / 64);
    const id = `${mcc}-${mnc}-${tac}-${100000 + k}`;
    const [lat, lon] = siteLocation(id);
    const jitter = 0.6 + 0.8 * (hash32(`${t.seed}:${id}`) / 2 ** 32);
    cells.push({ id, devices: Math.round(perCell * jitter), lat, lon, tac, plmn: mcc + mnc });
  };
  for (let k = 0; k < t.homeCells; k++) make("310", "260", k, homeDevices / t.homeCells);
  const roamingPer = (t.devices * 0.12) / (ROAMING_PLMNS.length * t.roamingCellsPerPlmn);
  for (const [mcc, mnc] of ROAMING_PLMNS) {
    for (let k = 0; k < t.roamingCellsPerPlmn; k++) make(mcc, mnc, k, roamingPer);
  }
  cellCache.set(t.id, cells);
  return cells;
}

// ---- scenario ------------------------------------------------------------------
export interface DemoFault {
  key: string;
  kind: FaultType;
  scopeType: ScopeType;
  scope: string;
  start: number;
  end: number;
  severity: Severity;
  /** cells affected (cell faults spread over time; others list nothing) */
  cells: { id: string; from: number; to: number }[];
}

const faultCache = new Map<string, DemoFault[]>();

export function scenario(t: DemoTenant): DemoFault[] {
  const cached = faultCache.get(t.id);
  if (cached) return cached;
  const cells = demoCells(t);
  const home = cells.filter((c) => c.plmn === "310260");
  // Outage: a busy site in tracking area 1003 goes dark, then neighbours follow (regional power/backhaul).
  const origin = home[Math.min(home.length - 1, 3 * 64 + 10)]!;
  const neighbours = home
    .filter((c) => c.tac === origin.tac && c.id !== origin.id)
    .map((c) => ({ c, d: (c.lat - origin.lat) ** 2 + (c.lon - origin.lon) ** 2 }))
    .sort((a, b) => a.d - b.d)
    .slice(0, 11)
    .map((x) => x.c);
  const outageCells = [origin, ...neighbours].map((c, i) => ({ id: c.id, from: 120 + i * 14, to: 400 - i * 9 }));
  const congested = home[Math.min(home.length - 1, 12 * 64 + 9)]!;
  const faults: DemoFault[] = [
    { key: "apn", kind: "apn_error", scopeType: "apn", scope: "track.fleet.iot", start: 15, end: 70, severity: "high", cells: [] },
    {
      key: "outage",
      kind: "cell_outage",
      scopeType: "cell",
      scope: origin.id,
      start: 120,
      end: 400,
      severity: "critical",
      cells: outageCells,
    },
    {
      key: "congestion",
      kind: "congestion",
      scopeType: "cell",
      scope: congested.id,
      start: 470,
      end: 560,
      severity: "medium",
      cells: [{ id: congested.id, from: 470, to: 560 }],
    },
    {
      key: "firmware",
      kind: "firmware_regression",
      scopeType: "firmware",
      scope: "MTR-3.3.1",
      start: 610,
      end: 700,
      severity: "high",
      cells: [],
    },
    { key: "roaming", kind: "roaming_misconfig", scopeType: "plmn", scope: "26201", start: 760, end: 850, severity: "medium", cells: [] },
  ];
  faultCache.set(t.id, faults);
  return faults;
}

const DETECTION_LAG = { cell: 32, plmn: 41, apn: 38, firmware: 44 } as const; // gateway onset -> confirmed incident
const ONSET_LAG = 6; // fault start -> gateway anomaly onset

// ---- deterministic randomness ---------------------------------------------------
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let x = a;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

const mod = (t: number) => ((t % CYCLE_SECONDS) + CYCLE_SECONDS) % CYCLE_SECONDS;

function faultLevel(f: { start: number; end: number }, tc: number): number {
  if (tc < f.start || tc >= f.end + 20) return 0;
  if (tc < f.start + 8) return (tc - f.start + 1) / 8;
  if (tc >= f.end) return 1 - (tc - f.end) / 20;
  return 1;
}

function cellLevel(c: { from: number; to: number }, tc: number): number {
  if (tc < c.from || tc >= c.to + 10) return 0;
  if (tc < c.from + 4) return (tc - c.from + 1) / 4;
  if (tc >= c.to) return 1 - (tc - c.to) / 10;
  return 1;
}

// ---- engine ----------------------------------------------------------------------
const RSRP_EDGES = Array.from({ length: 25 }, (_, i) => -140 + i * 4);
const SINR_EDGES = Array.from({ length: 26 }, (_, i) => -20 + i * 2);

function gaussianCounts(edges: number[], mean: number, sd: number, total: number, r: () => number): number[] {
  const pdf = (x: number) => Math.exp(-0.5 * ((x - mean) / sd) ** 2);
  const w = edges.slice(0, -1).map((e, i) => pdf((e + edges[i + 1]!) / 2));
  const sum = w.reduce((s, x) => s + x, 0);
  return w.map((x) => Math.max(0, Math.round((x / sum) * total * (0.96 + 0.08 * r()))));
}

export class DemoEngine {
  readonly tenant: DemoTenant;
  readonly cells: DemoCell[];
  readonly faults: DemoFault[];
  private readonly cellIndex: Map<string, DemoCell>;

  /** t0 is the scenario second shown at wall time wall0. */
  constructor(
    tenantId: string,
    readonly t0: number = DEFAULT_START_T,
    readonly wall0: number = Date.now(),
  ) {
    this.tenant = demoTenant(tenantId);
    this.cells = demoCells(this.tenant);
    this.faults = scenario(this.tenant);
    this.cellIndex = new Map(this.cells.map((c) => [c.id, c]));
  }

  wallAt(t: number): number {
    return this.wall0 + (t - this.t0) * 1000;
  }

  private cycleStart(t: number): number {
    return t - mod(t);
  }

  activeFaults(t: number): { f: DemoFault; level: number }[] {
    const tc = mod(t);
    return this.faults.map((f) => ({ f, level: faultLevel(f, tc) })).filter((x) => x.level > 0);
  }

  /** Per-cell failure ratio contributed by faults at t. */
  private cellFailures(t: number): Map<string, { fail: number; kind: FaultType }> {
    const tc = mod(t);
    const out = new Map<string, { fail: number; kind: FaultType }>();
    for (const f of this.faults) {
      for (const c of f.cells) {
        const lvl = cellLevel(c, tc);
        if (lvl <= 0) continue;
        const fail = f.kind === "cell_outage" ? 0.95 * lvl : 0.25 * lvl;
        out.set(c.id, { fail, kind: f.kind });
      }
      if (f.kind === "roaming_misconfig") {
        const lvl = faultLevel(f, tc);
        if (lvl > 0) for (const c of this.cells) if (c.plmn === f.scope) out.set(c.id, { fail: 0.8 * lvl, kind: f.kind });
      }
    }
    return out;
  }

  snapshot(t: number): Snapshot {
    const tn = this.tenant;
    const r = rng(hash32(`${tn.seed}:snap:${t}`));
    const tc = mod(t);
    const wave = 1 + 0.035 * Math.sin((2 * Math.PI * t) / 600) + 0.015 * Math.sin((2 * Math.PI * t) / 97);
    const eps = Math.round(tn.devices * EVENTS_PER_DEVICE_SECOND * wave * (0.995 + 0.01 * r()));
    const fails = this.cellFailures(t);
    let failedDevices = 0;
    for (const [id, x] of fails) failedDevices += (this.cellIndex.get(id)?.devices ?? 0) * x.fail;
    const active = this.activeFaults(t);
    const fw = active.find((a) => a.f.kind === "firmware_regression");
    const apn = active.find((a) => a.f.kind === "apn_error");
    const firmwareDown = fw ? tn.devices * 0.4 * 0.3 * 0.6 * 0.08 * fw.level : 0; // rebooting meters on the new build
    const apnDown = apn ? tn.devices * 0.25 * 0.08 * apn.level : 0; // one SIM batch of trackers
    const baseFail = 0.0015 + 0.001 * r();
    const failShare = Math.min(0.99, baseFail + (failedDevices + apnDown + firmwareDown) / tn.devices);
    const noService = Math.round(eps * (0.0012 + (failedDevices / tn.devices) * 0.8));
    const attachReject = Math.round(eps * (0.0012 + (fails.size && active.some((a) => a.f.kind === "roaming_misconfig") ? 0.012 : 0)));
    const pdnReject = Math.round(eps * (0.002 + (apnDown / tn.devices) * 1.4));
    const connected = Math.max(0, eps - noService - attachReject - pdnReject);
    const sampled = Math.min(eps, 20_000);
    const congestion = active.find((a) => a.f.kind === "congestion");
    const sinr = gaussianCounts(SINR_EDGES, 9.2 - (congestion ? 0.15 * congestion.level : 0), 4.6, sampled * (connected / eps), r);
    const rsrp = gaussianCounts(RSRP_EDGES, -96.5, 9, sampled * (connected / eps), r);

    const anomalies: Anomaly[] = active
      .map(({ f, level }) => ({
        scopeType: f.scopeType,
        scope: f.scope,
        kind: f.kind,
        score: Math.round(Math.min(1, level * (0.93 + 0.04 * Math.sin(t / 9))) * 1000) / 1000,
        z: Math.round((3 + 30 * level) * 100) / 100,
        onsetMs: this.wallAt(this.cycleStart(t) + f.start + ONSET_LAG),
      }))
      .filter((a) => a.score >= 0.3 && tc >= this.faults.find((f) => f.scope === a.scope)!.start + ONSET_LAG)
      .sort((a, b) => b.score - a.score);

    const window = 30;
    const cellStat = (c: DemoCell, failRatio: number, anomaly: number): DimStat => ({
      key: c.id,
      events: Math.round(c.devices * EVENTS_PER_DEVICE_SECOND * window),
      failRatio: Math.round(failRatio * 1e4) / 1e4,
      resetRatio: 0.001,
      reconnectsPerEvent: Math.round((0.03 + (anomaly > 0 && failRatio < 0.5 ? 0.4 : 0)) * 1e3) / 1e3,
      sinr: Math.round((failRatio > 0.5 ? -18 : 9 - 12 * anomaly) * 10) / 10,
      health: Math.round(Math.max(0, 1 - failRatio - 0.5 * anomaly) * 1e3) / 1e3,
      anomaly: Math.round(anomaly * 1e3) / 1e3,
    });
    const degraded = [...fails.entries()]
      .filter(([id]) => id.startsWith("310-"))
      .map(([id, x]) => cellStat(this.cellIndex.get(id)!, x.fail, Math.min(1, x.fail * 1.05)));
    const noisy = Array.from({ length: 8 }, (_, i) => {
      const c = this.cells[Math.floor(rng(hash32(`${tn.seed}:noisy:${Math.floor(t / 20)}:${i}`))() * tn.homeCells)]!;
      return cellStat(c, 0.006 + 0.02 * r(), 0);
    });
    const topCells = [...degraded, ...noisy].sort((a, b) => b.anomaly - a.anomaly || b.failRatio - a.failRatio).slice(0, 8);

    const dim = (key: string, events: number, fail: number, reset: number, anomaly: number): DimStat => ({
      key,
      events: Math.round(events),
      failRatio: Math.round(fail * 1e4) / 1e4,
      resetRatio: Math.round(reset * 1e4) / 1e4,
      reconnectsPerEvent: 0.03,
      sinr: 9,
      health: Math.round(Math.max(0, 1 - Math.max(fail, reset) - 0.5 * anomaly) * 1e3) / 1e3,
      anomaly,
    });
    const topFirmware = PROFILES.flatMap((p) =>
      p.firmware.map((name, i) => {
        const bad = fw && name === "MTR-3.3.1" ? fw.level : 0;
        return dim(name, eps * window * (p.share / p.interval / EVENTS_PER_DEVICE_SECOND) * p.fw[i]!, 0.004, 0.001 + 0.36 * bad, bad);
      }),
    ).sort((a, b) => b.anomaly - a.anomaly || b.resetRatio - a.resetRatio);
    const roam = active.find((a) => a.f.kind === "roaming_misconfig");
    const topCarriers = ROAMING_PLMNS.map(([mcc, mnc]) => {
      const bad = roam && mcc + mnc === "26201" ? roam.level : 0;
      return dim(mcc + mnc, eps * window * 0.03, 0.005 + 0.75 * bad, 0, bad);
    }).sort((a, b) => b.anomaly - a.anomaly || b.failRatio - a.failRatio);
    const topApns = PROFILES.map((p) => {
      const bad = apn && p.apn === "track.fleet.iot" ? apn.level : 0;
      return dim(p.apn, eps * window * (p.share / p.interval / EVENTS_PER_DEVICE_SECOND), 0.002 + 0.9 * bad, 0, bad);
    }).sort((a, b) => b.anomaly - a.anomaly || b.failRatio - a.failRatio);

    const ratMix: Record<string, number> = {};
    for (const p of PROFILES)
      ratMix[p.rat] = (ratMix[p.rat] ?? 0) + Math.round(sampled * (p.share / p.interval / EVENTS_PER_DEVICE_SECOND));

    const online = Math.round(tn.devices * (0.9965 + 0.001 * r()) - failedDevices - apnDown - firmwareDown);
    return {
      seq: t,
      ts: this.wallAt(t),
      eventsPerSec: eps,
      bytesPerSec: Math.round(eps * 395),
      devicesOnline: online,
      devicesSeen: Math.round(tn.devices * 0.9995),
      availability: Math.round((1 - failShare) * 1e4) / 1e4,
      connected,
      noService,
      attachReject,
      pdnReject,
      resets: Math.round(eps * 0.001 + (fw ? eps * 0.4 * 0.3 * 0.3 * fw.level : 0)),
      latencyMs: Math.round((410 + 30 * Math.sin(t / 45) + (congestion ? 220 * congestion.level : 0)) * 10) / 10,
      rsrp: { edges: RSRP_EDGES, counts: rsrp },
      sinr: { edges: SINR_EDGES, counts: sinr },
      ratMix,
      anomalyScore: anomalies.reduce((m, a) => Math.max(m, a.score), 0),
      anomalies,
      topCells,
      topFirmware: topFirmware.slice(0, 6),
      topCarriers,
      topApns,
      sampledEvents: sampled,
    };
  }

  cellFrame(t: number): CellFrame {
    const fails = this.cellFailures(t);
    const bucket = Math.floor(t / 10);
    const ids: string[] = [];
    const health: number[] = [];
    const anomaly: number[] = [];
    const events: number[] = [];
    const online: number[] = [];
    for (const c of this.cells) {
      const f = fails.get(c.id);
      const noise = (hash32(`${c.id}:${bucket}`) % 40) / 10; // 0..4 health points of background noise
      const fail = f?.fail ?? 0;
      const an = f ? Math.min(1, fail * 1.05) : 0;
      ids.push(c.id);
      health.push(Math.round(Math.max(0, (1 - fail - 0.5 * an) * 100 - noise)));
      anomaly.push(Math.round(an * 100));
      events.push(Math.round(c.devices * EVENTS_PER_DEVICE_SECOND * 30));
      online.push(Math.round(c.devices * (1 - fail) * 0.995));
    }
    return { ts: this.wallAt(t), ids, health, anomaly, events, online };
  }

  history(t: number, seconds = 900): Point[] {
    const out: Point[] = [];
    for (let s = t - seconds + 1; s <= t; s++) {
      const snap = this.snapshot(s);
      out.push({
        ts: snap.ts,
        eventsPerSec: snap.eventsPerSec,
        devicesOnline: snap.devicesOnline,
        availability: snap.availability,
        anomalyScore: snap.anomalyScore,
      });
    }
    return out;
  }

  /** Incidents visible at t: everything opened in the last 15 minutes of scenario time. */
  incidents(t: number): IncidentView[] {
    const out: IncidentView[] = [];
    for (const cycle of [this.cycleStart(t) - CYCLE_SECONDS, this.cycleStart(t)]) {
      for (const f of this.faults) {
        const openAt = cycle + f.start + ONSET_LAG + DETECTION_LAG[f.scopeType];
        if (openAt > t || openAt <= t - CYCLE_SECONDS) continue;
        out.push(this.incident(f, cycle, t));
      }
    }
    return out;
  }

  incident(f: DemoFault, cycle: number, t: number): IncidentView {
    const tn = this.tenant;
    const onset = cycle + f.start + ONSET_LAG;
    const openAt = onset + DETECTION_LAG[f.scopeType];
    const resolvedAt = cycle + f.end + 60;
    const status: IncidentStatus = t >= resolvedAt ? "RESOLVED" : t >= openAt + 8 ? "DIAGNOSED" : t >= openAt + 3 ? "ENRICHED" : "OPEN";
    const id =
      `inc-${hash32(`${tn.id}|${f.kind}|${f.scope}|${cycle}`).toString(16).padStart(8, "0")}${hash32(`${cycle}|${f.key}`).toString(16).padStart(8, "0")}`.slice(
        0,
        24,
      );
    const cell = this.cellIndex.get(f.scope);
    const affected =
      f.scopeType === "cell"
        ? f.cells.filter((c) => c.from <= mod(t) || t >= resolvedAt).reduce((s, c) => s + (this.cellIndex.get(c.id)?.devices ?? 0), 0) ||
          (cell?.devices ?? 0)
        : f.kind === "firmware_regression"
          ? Math.round(tn.devices * 0.4 * 0.3 * 0.6)
          : f.kind === "apn_error"
            ? Math.round(tn.devices * 0.25 * 0.08)
            : Math.round(tn.devices * 0.03 * 0.8);
    const total =
      f.scopeType === "cell" ? f.cells.reduce((s, c) => s + (this.cellIndex.get(c.id)?.devices ?? 0), 0) : Math.round(affected / 0.82);
    const signal = {
      cell_outage: { metric: "no_service_ratio", value: 0.9636, baseline: 0.006, zscore: 47.88 },
      congestion: { metric: "sinr_mean_db", value: -3.1, baseline: 9.4, zscore: -9.6 },
      reconnect_storm: { metric: "reconnects_per_event", value: 12.4, baseline: 0.03, zscore: 61.2 },
      roaming_misconfig: { metric: "attach_reject_ratio", value: 0.81, baseline: 0.011, zscore: 38.4 },
      apn_error: { metric: "pdn_reject_ratio", value: 0.93, baseline: 0.004, zscore: 52.7 },
      firmware_regression: { metric: "reset_ratio", value: 0.37, baseline: 0.001, zscore: 29.5 },
    }[f.kind];
    const cause = { roaming_misconfig: "EMM_15", apn_error: "ESM_27", congestion: "EMM_22" }[f.kind as string];
    const samples = Array.from({ length: 5 }, (_, i) => `dev-${String(hash32(`${id}:${i}`) % tn.devices).padStart(8, "0")}`);
    const iso = (s: number) => new Date(this.wallAt(s)).toISOString();
    const incident = {
      incident_id: id,
      tenant: tn.id,
      suspected_fault: f.kind,
      scope_type: f.scopeType,
      scope: f.scope,
      status,
      opened_at: iso(openAt - 60),
      last_seen_at: iso(Math.min(t, resolvedAt)),
      windows: Math.max(1, Math.floor((Math.min(t, resolvedAt) - openAt) / 60) + 1),
      severity: f.severity,
      affected_devices: affected,
      total_devices: Math.max(total, affected),
      signals: [signal],
      sample_device_ids: samples,
      top_causes: cause ? { [cause]: Math.round(affected * 1.7) } : {},
      context: { profiles: f.kind === "firmware_regression" ? "smart_meter" : "smart_meter,asset_tracker,industrial_sensor" },
    };
    const loc = cell ? { lat: cell.lat, lon: cell.lon } : siteLocationOfScope(f.scope);
    const weather = hash32(`${f.scope}:wx`) % 3 === 0;
    const enrichment = {
      incident_id: id,
      items: [
        {
          source: "celltower",
          status: "ok" as const,
          data: { ...loc, range_m: 800 + (hash32(f.scope) % 4200), tac: cell?.tac ?? 1000, source: "fixture" },
          error: null,
          latency_ms: 3.1,
          cached: false,
        },
        {
          source: "weather",
          status: "ok" as const,
          data: { temperature_c: 21.4, precipitation_mm: weather ? 4.2 : 0, wind_gusts_kmh: weather ? 71.3 : 22.8, severe: weather },
          error: null,
          latency_ms: 41.7,
          cached: false,
        },
        {
          source: "carrier",
          status: "ok" as const,
          data:
            f.kind === "roaming_misconfig"
              ? { plmn: "26201", country: "DE", operator: "Roaming partner DE-1", roaming_agreement: true }
              : { plmn: "310260", country: "US", operator: "Home network (US)" },
          error: null,
          latency_ms: 0.4,
          cached: true,
        },
        {
          source: "status_feed",
          status: f.kind === "congestion" ? ("degraded" as const) : ("ok" as const),
          data: {
            relevant: f.kind === "cell_outage" ? [{ name: "Power maintenance - region 1003", impact: "major" }] : [],
            total_active: 2,
          },
          error: null,
          latency_ms: 88.2,
          cached: f.kind === "congestion",
        },
      ],
    };
    const diagnosis: IncidentView["diagnosis"] = {};
    if (status === "DIAGNOSED" || status === "RESOLVED") {
      diagnosis.en = this.diagnosis(f, incident, "en", iso(openAt + 8), weather);
      diagnosis.es = this.diagnosis(f, incident, "es", iso(openAt + 8), weather);
    }
    return {
      incident: incident as IncidentView["incident"],
      enrichment,
      diagnosis,
      detection: { gatewayOnsetMs: this.wallAt(onset), confirmedMs: this.wallAt(openAt), leadSeconds: openAt - onset },
    };
  }

  private diagnosis(
    f: DemoFault,
    inc: {
      incident_id: string;
      affected_devices: number;
      total_devices: number;
      signals: { metric: string; value: number; baseline: number; zscore: number }[];
      sample_device_ids: string[];
      top_causes: Record<string, number>;
    },
    locale: "en" | "es",
    createdAt: string,
    severeWeather: boolean,
  ): DiagnosisRecord {
    const s = inc.signals[0]!;
    const cause = Object.entries(inc.top_causes)[0];
    const es = locale === "es";
    const scopeLabel = es ? `${SCOPE_ES[f.scopeType]} ${f.scope}` : `${f.scopeType} ${f.scope}`;
    const evidence = [
      es
        ? `${s.metric} = ${s.value} frente a la línea base ${s.baseline} (z = ${s.zscore})`
        : `${s.metric} = ${s.value} vs baseline ${s.baseline} (z = ${s.zscore})`,
      ...(cause
        ? [es ? `causa de rechazo dominante ${cause[0]} (${cause[1]} eventos)` : `dominant reject cause ${cause[0]} (${cause[1]} events)`]
        : []),
      es
        ? `${inc.affected_devices} de ${inc.total_devices} equipos afectados en ${scopeLabel}`
        : `${inc.affected_devices} of ${inc.total_devices} devices in ${scopeLabel} affected`,
      ...(severeWeather && f.scopeType === "cell"
        ? [es ? "se reporta clima severo en la ubicación del sitio" : "severe weather reported at the site location"]
        : []),
      ...(f.kind === "cell_outage"
        ? [
            es
              ? "el feed de estado del operador reporta un incidente activo relacionado"
              : "operator status feed reports a related active incident",
          ]
        : []),
    ];
    const steps = REMEDIATION[f.kind].en.map(([action, owner, automated], i) => ({
      order: i + 1,
      action: es ? REMEDIATION[f.kind].es[i]! : action,
      owner,
      automated,
    }));
    const confidence = Math.round(Math.min(0.97, 0.6 + 0.04 * 8 + 0.002 * 50) * 1000) / 1000;
    return {
      incident_id: inc.incident_id,
      diagnosis: {
        root_cause: f.kind,
        confidence: f.kind === "congestion" ? 0.91 : confidence,
        summary: es
          ? `Posible ${ROOT_ES[f.kind]} en ${scopeLabel} que afecta a ${inc.affected_devices} equipos.`
          : `Suspected ${f.kind.replace("_", " ")} on ${scopeLabel} affecting ${inc.affected_devices} devices.`,
        evidence,
        remediation_steps: steps,
        truck_roll_required: false,
        customer_message: CUSTOMER[f.kind][locale],
        referenced_device_ids: inc.sample_device_ids.slice(0, 3),
        runbook_ids: RUNBOOKS[f.kind],
      },
      model: "fake-diagnosis-v1",
      provider: "fake",
      guardrail_status: f.kind === "roaming_misconfig" ? "repaired" : "passed",
      guardrail_notes: f.kind === "roaming_misconfig" ? ["redacted identifiers from the customer message"] : [],
      input_tokens: 1290 + (hash32(inc.incident_id) % 180),
      output_tokens: 410 + (hash32(`${inc.incident_id}:o`) % 90),
      latency_ms: 1840 + (hash32(`${inc.incident_id}:l`) % 900),
      created_at: createdAt,
      prompt_version: "diag-v2",
      locale,
      available_locales: ["en", "es"],
    };
  }

  hello(t: number): Hello {
    return {
      version: "demo",
      mode: "demo",
      tenant: this.tenant.id,
      serverTime: this.wallAt(t),
      history: this.history(t),
      incidents: this.incidents(t),
    };
  }
}

function siteLocationOfScope(scope: string): { lat: number; lon: number } {
  const [lat, lon] = siteLocation(`310-260-1000-${100000 + (hash32(scope) % 64)}`);
  return { lat, lon };
}
