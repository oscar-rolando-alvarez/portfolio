import { DemoEngine, DEFAULT_START_T } from "./demo";
import type { StreamAction } from "./reducer";
import type { CellFrame, Hello, IncidentView, Snapshot } from "./types";

export type Dispatch = (a: StreamAction) => void;
export interface Source {
  stop(): void;
}

/**
 * Demo source: drives the deterministic engine at 1 Hz with the gateway's
 * frame cadence (snapshot every second, cells every 2 s, incidents on change).
 * `startT` lets tests, screenshots and the command palette jump to any moment.
 */
export function startDemo(tenant: string, dispatch: Dispatch, startT = DEFAULT_START_T, now = Date.now()): Source {
  const engine = new DemoEngine(tenant, startT, now);
  let t = startT;
  const seen = new Map<string, string>();
  const hello = engine.hello(t);
  for (const v of hello.incidents) seen.set(v.incident.incident_id, signature(v));
  dispatch({ type: "hello", hello, at: Date.now() });
  dispatch({ type: "snapshot", snapshot: engine.snapshot(t), at: Date.now() });
  dispatch({ type: "cells", frame: engine.cellFrame(t), at: Date.now() });
  const timer = setInterval(() => {
    t += 1;
    dispatch({ type: "snapshot", snapshot: engine.snapshot(t), at: Date.now() });
    if (t % 2 === 0) dispatch({ type: "cells", frame: engine.cellFrame(t), at: Date.now() });
    for (const v of engine.incidents(t)) {
      const sig = signature(v);
      if (seen.get(v.incident.incident_id) !== sig) {
        seen.set(v.incident.incident_id, sig);
        dispatch({ type: "incident", view: v, at: Date.now() });
      }
    }
  }, 1000);
  return { stop: () => clearInterval(timer) };
}

function signature(v: IncidentView): string {
  return `${v.incident.status}|${v.incident.affected_devices}`;
}

/**
 * Live source: Server-Sent Events from the gateway, through the dashboard's
 * same-origin /api/stream proxy (which adds the tenant API key server-side, so
 * no secret ever reaches the browser). EventSource reconnects on its own; the
 * gateway's hello frame resynchronises state after every reconnect.
 */
export function startLive(tenant: string, dispatch: Dispatch, url = "/api/stream"): Source {
  const qs = new URLSearchParams({ tenant });
  const es = new EventSource(`${url}?${qs.toString()}`);
  const parse = <T>(e: Event): T | null => {
    try {
      return JSON.parse((e as MessageEvent<string>).data) as T;
    } catch {
      return null;
    }
  };
  es.addEventListener("hello", (e) => {
    const h = parse<Hello>(e);
    if (h) dispatch({ type: "hello", hello: { ...h, incidents: h.incidents ?? [], history: h.history ?? [] }, at: Date.now() });
  });
  es.addEventListener("snapshot", (e) => {
    const s = parse<Snapshot>(e);
    if (s) dispatch({ type: "snapshot", snapshot: s, at: Date.now() });
  });
  es.addEventListener("cells", (e) => {
    const f = parse<CellFrame>(e);
    if (f) dispatch({ type: "cells", frame: f, at: Date.now() });
  });
  es.addEventListener("incident", (e) => {
    const v = parse<IncidentView>(e);
    if (v) dispatch({ type: "incident", view: v, at: Date.now() });
  });
  es.onopen = () => dispatch({ type: "status", status: "open" });
  es.onerror = () => {
    dispatch({
      type: "status",
      status: es.readyState === EventSource.CLOSED ? "error" : "reconnecting",
      error: "stream unavailable",
    });
  };
  return { stop: () => es.close() };
}
