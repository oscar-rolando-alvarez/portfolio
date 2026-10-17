import { describe, expect, it } from "vitest";
import { DemoEngine } from "./demo";
import {
  activeBySeverity,
  appendPoint,
  HISTORY_SECONDS,
  initialState,
  reducer,
  sortedIncidents,
  windowed,
  type StreamState,
} from "./reducer";
import type { Point } from "./types";

const p = (ts: number, v = 1): Point => ({ ts, eventsPerSec: v, devicesOnline: v, availability: 1, anomalyScore: 0 });

describe("appendPoint", () => {
  it("keeps order, replaces same-second frames and ignores stale ones", () => {
    let h = appendPoint([], p(1000));
    h = appendPoint(h, p(2000));
    expect(appendPoint(h, p(2000, 9)).at(-1)!.eventsPerSec).toBe(9);
    expect(appendPoint(h, p(500))).toBe(h);
  });

  it("caps the window", () => {
    let h: Point[] = [];
    for (let i = 0; i < HISTORY_SECONDS + 50; i++) h = appendPoint(h, p(i * 1000));
    expect(h).toHaveLength(HISTORY_SECONDS);
    expect(h[0]!.ts).toBe(50_000);
    expect(windowed(h, 300)).toHaveLength(300);
  });
});

describe("reducer", () => {
  const engine = new DemoEngine("acme-utilities", 300, 1_800_000_000_000);

  it("hydrates from hello and accumulates snapshots, cells and markers", () => {
    let s: StreamState = reducer(initialState(), { type: "reset", mode: "demo", tenant: "acme-utilities" });
    expect(s.status).toBe("connecting");
    s = reducer(s, { type: "hello", hello: engine.hello(300), at: 1 });
    expect(s.status).toBe("open");
    expect(s.history).toHaveLength(900);
    expect(Object.keys(s.incidents).length).toBeGreaterThan(0);
    s = reducer(s, { type: "snapshot", snapshot: engine.snapshot(301), at: 2 });
    expect(s.latest?.seq).toBe(301);
    expect(s.markers.some((m) => m.type === "anomaly" && m.kind === "cell_outage")).toBe(true);
    s = reducer(s, { type: "cells", frame: engine.cellFrame(301), at: 3 });
    expect(s.cells?.ids.length).toBe(engine.cells.length);
    const before = s.markers.length;
    s = reducer(s, { type: "snapshot", snapshot: engine.snapshot(302), at: 4 });
    expect(s.markers.length).toBe(before); // same onset => no duplicate marker
  });

  it("upserts incidents and derives severity counts and ordering", () => {
    let s = reducer(initialState(), { type: "hello", hello: engine.hello(300), at: 1 });
    const outage = engine.incidents(300).find((v) => v.incident.suspected_fault === "cell_outage")!;
    s = reducer(s, { type: "incident", view: { ...outage, incident: { ...outage.incident, status: "RESOLVED" } }, at: 2 });
    expect(s.incidents[outage.incident.incident_id]!.incident.status).toBe("RESOLVED");
    const sorted = sortedIncidents(s);
    expect(sorted.at(-1)!.incident.status).toBe("RESOLVED");
    expect(activeBySeverity(s).critical).toBe(0);
    s = reducer(s, { type: "status", status: "error", error: "boom" });
    expect(s.error).toBe("boom");
    s = reducer(s, { type: "status", status: "open" });
    expect(s.error).toBeNull();
  });
});
