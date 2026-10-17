import type { CellFrame, ConnectionStatus, FaultType, Hello, IncidentView, Point, ScopeType, Snapshot, StreamMode } from "./types";

export const HISTORY_SECONDS = 900; // 15 minutes at 1 Hz
export const MAX_MARKERS = 200;

export interface TimelineMarker {
  id: string;
  ts: number;
  type: "anomaly" | "incident";
  kind: FaultType;
  scopeType: ScopeType;
  scope: string;
  score?: number;
}

export interface StreamState {
  mode: StreamMode;
  tenant: string;
  status: ConnectionStatus;
  error: string | null;
  history: Point[];
  latest: Snapshot | null;
  cells: CellFrame | null;
  incidents: Record<string, IncidentView>;
  markers: TimelineMarker[];
  lastMessageAt: number | null;
}

export type StreamAction =
  | { type: "reset"; mode: StreamMode; tenant: string }
  | { type: "status"; status: ConnectionStatus; error?: string | null }
  | { type: "hello"; hello: Hello; at: number }
  | { type: "snapshot"; snapshot: Snapshot; at: number }
  | { type: "cells"; frame: CellFrame; at: number }
  | { type: "incident"; view: IncidentView; at: number };

export const initialState = (mode: StreamMode = "demo", tenant = "acme-utilities"): StreamState => ({
  mode,
  tenant,
  status: "idle",
  error: null,
  history: [],
  latest: null,
  cells: null,
  incidents: {},
  markers: [],
  lastMessageAt: null,
});

export function toPoint(s: Snapshot): Point {
  return {
    ts: s.ts,
    eventsPerSec: s.eventsPerSec,
    devicesOnline: s.devicesOnline,
    availability: s.availability,
    anomalyScore: s.anomalyScore,
  };
}

/** Append keeping chronological order, de-duplicating by timestamp and capping the window. */
export function appendPoint(history: Point[], p: Point, cap = HISTORY_SECONDS): Point[] {
  const last = history.at(-1);
  if (last && p.ts <= last.ts) {
    if (p.ts === last.ts) return [...history.slice(0, -1), p];
    return history; // out-of-order frame (reconnect overlap): ignore
  }
  const next = history.length >= cap ? history.slice(history.length - cap + 1) : history.slice();
  next.push(p);
  return next;
}

function addMarkers(markers: TimelineMarker[], add: TimelineMarker[]): TimelineMarker[] {
  if (add.length === 0) return markers;
  const seen = new Set(markers.map((m) => m.id));
  const fresh = add.filter((m) => !seen.has(m.id));
  if (fresh.length === 0) return markers;
  return [...markers, ...fresh].sort((a, b) => a.ts - b.ts).slice(-MAX_MARKERS);
}

function anomalyMarkers(s: Snapshot): TimelineMarker[] {
  return s.anomalies
    .filter((a) => a.onsetMs > 0 && a.score >= 0.3)
    .map((a) => ({
      id: `a:${a.scopeType}:${a.scope}:${a.onsetMs}`,
      ts: a.onsetMs,
      type: "anomaly" as const,
      kind: a.kind,
      scopeType: a.scopeType,
      scope: a.scope,
      score: a.score,
    }));
}

function incidentMarker(v: IncidentView): TimelineMarker {
  return {
    id: `i:${v.incident.incident_id}`,
    ts: v.detection.confirmedMs || Date.parse(v.incident.opened_at),
    type: "incident",
    kind: v.incident.suspected_fault,
    scopeType: v.incident.scope_type,
    scope: v.incident.scope,
  };
}

export function reducer(state: StreamState, action: StreamAction): StreamState {
  switch (action.type) {
    case "reset":
      return { ...initialState(action.mode, action.tenant), status: "connecting" };
    case "status":
      return { ...state, status: action.status, error: action.error ?? (action.status === "error" ? state.error : null) };
    case "hello": {
      const incidents: Record<string, IncidentView> = {};
      for (const v of action.hello.incidents) incidents[v.incident.incident_id] = v;
      const history = action.hello.history.slice(-HISTORY_SECONDS);
      return {
        ...state,
        tenant: action.hello.tenant,
        status: "open",
        error: null,
        history,
        incidents,
        markers: addMarkers([], action.hello.incidents.map(incidentMarker)),
        lastMessageAt: action.at,
      };
    }
    case "snapshot":
      return {
        ...state,
        status: "open",
        latest: action.snapshot,
        history: appendPoint(state.history, toPoint(action.snapshot)),
        markers: addMarkers(state.markers, anomalyMarkers(action.snapshot)),
        lastMessageAt: action.at,
      };
    case "cells":
      return { ...state, cells: action.frame, lastMessageAt: action.at };
    case "incident": {
      const id = action.view.incident.incident_id;
      return {
        ...state,
        incidents: { ...state.incidents, [id]: action.view },
        markers: addMarkers(state.markers, [incidentMarker(action.view)]),
        lastMessageAt: action.at,
      };
    }
  }
}

// ---- selectors ---------------------------------------------------------------

export function sortedIncidents(state: Pick<StreamState, "incidents">): IncidentView[] {
  return Object.values(state.incidents).sort((a, b) => {
    const open = Number(a.incident.status === "RESOLVED") - Number(b.incident.status === "RESOLVED");
    if (open !== 0) return open;
    return b.incident.opened_at.localeCompare(a.incident.opened_at);
  });
}

export function activeBySeverity(state: Pick<StreamState, "incidents">): Record<"critical" | "high" | "medium" | "low", number> {
  const out = { critical: 0, high: 0, medium: 0, low: 0 };
  for (const v of Object.values(state.incidents)) {
    if (v.incident.status !== "RESOLVED") out[v.incident.severity] += 1;
  }
  return out;
}

export function windowed(history: Point[], seconds: number): Point[] {
  const last = history.at(-1);
  if (!last) return history;
  const from = last.ts - seconds * 1000;
  return history.filter((p) => p.ts > from);
}
