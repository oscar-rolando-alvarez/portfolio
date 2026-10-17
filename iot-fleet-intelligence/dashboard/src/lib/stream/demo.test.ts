import { describe, expect, it, vi } from "vitest";
import { CYCLE_SECONDS, DEMO_TENANTS, DemoEngine, demoCells, rng, scenario } from "./demo";
import { startDemo } from "./sources";
import type { StreamAction } from "./reducer";

const WALL = 1_800_000_000_000;

describe("demo engine", () => {
  const e = new DemoEngine("acme-utilities", 0, WALL);

  it("is deterministic", () => {
    const other = new DemoEngine("acme-utilities", 0, WALL);
    expect(other.snapshot(321)).toEqual(e.snapshot(321));
    expect(other.cellFrame(321)).toEqual(e.cellFrame(321));
    expect(rng(1)()).toBe(rng(1)());
  });

  it("mirrors the simulator catalogue (cell ids, PLMNs, scale)", () => {
    const cells = demoCells(DEMO_TENANTS[0]!);
    expect(cells[0]!.id).toBe("310-260-1000-100000");
    expect(new Set(cells.map((c) => c.plmn))).toEqual(new Set(["310260", "26201", "23415", "20801", "22210"]));
    const devices = cells.reduce((s, c) => s + c.devices, 0);
    expect(devices / 1_000_000).toBeGreaterThan(0.9);
    expect(devices / 1_000_000).toBeLessThan(1.1);
    const snap = e.snapshot(10);
    expect(snap.eventsPerSec).toBeGreaterThan(12_000);
    expect(snap.rsrp.counts).toHaveLength(snap.rsrp.edges.length - 1);
  });

  it("spreads the cell outage across one tracking area and recovers", () => {
    const outage = scenario(DEMO_TENANTS[0]!).find((f) => f.kind === "cell_outage")!;
    expect(outage.cells.length).toBe(12);
    const down = (t: number) => e.cellFrame(t).health.filter((h) => h < 20).length;
    expect(down(100)).toBe(0);
    expect(down(130)).toBe(1);
    expect(down(300)).toBe(12);
    expect(down(470)).toBe(0);
    const baseline = e.snapshot(460);
    const during = e.snapshot(300);
    expect(during.availability).toBeLessThan(baseline.availability);
    expect(during.devicesOnline).toBeLessThan(baseline.devicesOnline - 3000);
    expect(during.anomalies[0]).toMatchObject({ kind: "cell_outage", scopeType: "cell", scope: outage.scope });
    expect(during.topCells[0]!.health).toBeLessThan(0.1);
  });

  it("opens incidents after detection with bilingual diagnoses and resolves them", () => {
    const at = (t: number) =>
      e
        .incidents(t)
        .filter((v) => v.incident.suspected_fault === "cell_outage")
        .sort((a, b) => b.incident.opened_at.localeCompare(a.incident.opened_at))[0];
    expect(at(150)!.incident.status).toBe("RESOLVED"); // previous loop's outage, still in the 15-min window
    expect(at(160)!.incident.status).toBe("OPEN");
    const diag = at(200)!;
    expect(diag.incident.status).toBe("DIAGNOSED");
    expect(diag.detection.leadSeconds).toBe(32);
    expect(diag.diagnosis.en!.diagnosis.summary).toMatch(/^Suspected cell outage/);
    expect(diag.diagnosis.es!.diagnosis.summary).toMatch(/^Posible caída de celda/);
    expect(diag.diagnosis.es!.diagnosis.remediation_steps.map((s) => s.owner)).toEqual(
      diag.diagnosis.en!.diagnosis.remediation_steps.map((s) => s.owner),
    );
    expect(at(500)!.incident.status).toBe("RESOLVED");
    // a new cycle produces a new incident id
    const next = e.incidents(CYCLE_SECONDS + 200).filter((v) => v.incident.suspected_fault === "cell_outage");
    expect(new Set(next.map((v) => v.incident.incident_id)).size).toBe(next.length);
  });

  it("covers every fault type in one cycle", () => {
    const kinds = new Set(e.incidents(CYCLE_SECONDS - 1).map((v) => v.incident.suspected_fault));
    expect(kinds).toEqual(new Set(["apn_error", "cell_outage", "congestion", "firmware_regression", "roaming_misconfig"]));
  });

  it("falls back to the first tenant", () => {
    expect(new DemoEngine("unknown").tenant.id).toBe("acme-utilities");
  });
});

describe("demo source", () => {
  it("emits hello, then snapshots, cells and incident changes at 1 Hz", () => {
    vi.useFakeTimers();
    const actions: StreamAction[] = [];
    const src = startDemo("acme-utilities", (a) => actions.push(a), 160, WALL);
    expect(actions.map((a) => a.type).slice(0, 3)).toEqual(["hello", "snapshot", "cells"]);
    vi.advanceTimersByTime(20_000);
    src.stop();
    vi.useRealTimers();
    const types = actions.map((a) => a.type);
    expect(types.filter((x) => x === "snapshot")).toHaveLength(21);
    expect(types.filter((x) => x === "cells").length).toBeGreaterThanOrEqual(10);
    expect(types).toContain("incident");
  });
});
