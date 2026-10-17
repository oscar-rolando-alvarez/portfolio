import { describe, expect, it } from "vitest";
import { scenarioCsv } from "./cost/export";
import { estimate } from "./cost/model";
import { DemoEngine } from "./stream/demo";
import {
  DEFAULT_ASSUMPTIONS,
  meanDetectionLead,
  meanTimeToRemediate,
  monthProgress,
  remoteFixableShare,
  sessionLlmSpend,
  slaCompliance,
  valueSummary,
} from "./value";

const MID_OCT = Date.UTC(2026, 9, 16, 5, 0, 0); // ~half of a 30.4-day billing month

describe("value model", () => {
  const incidents = new DemoEngine("acme-utilities", 400, MID_OCT).incidents(400);

  it("tracks month progress in UTC", () => {
    const p = monthProgress(MID_OCT);
    expect(p.day).toBeCloseTo(15.21, 1);
    expect(p.fraction).toBeCloseTo(0.5, 1);
    expect(monthProgress(Date.UTC(2026, 9, 31, 23)).fraction).toBe(1);
  });

  it("matches the README value hypothesis for 1M devices", () => {
    const v = valueSummary(1_000_000, DEFAULT_ASSUMPTIONS, MID_OCT, incidents);
    expect(v.baselineTruckRolls).toBe(300);
    expect(v.projectedSavingsUsd).toBe(300 * 0.25 * 350); // 75 avoided x $350
    expect(v.platformCostUsd).toBeCloseTo(14789.57, 2); // same as the estimator
    expect(v.costPerDeviceUsd).toBeCloseTo(0.0148, 4);
    expect(v.llmSpendMonthUsd).toBeCloseTo(224.41, 2);
    expect(v.roi).toBeCloseTo((26250 - 14789.57) / 14789.57, 4);
    expect(v.truckRollsAvoided).toBeCloseTo(75 * monthProgress(MID_OCT).fraction, 6);
    expect(v.remoteFixableShare).toBe(1);
  });

  it("derives SLA compliance, detection lead and time to remediate", () => {
    const p = (availability: number) => ({ ts: 0, eventsPerSec: 1, devicesOnline: 1, availability, anomalyScore: 0 });
    expect(slaCompliance([p(0.999), p(0.99), p(0.996), p(0.9)], 0.995)).toBe(0.5);
    expect(slaCompliance([], 0.995)).toBeNull();
    expect(meanDetectionLead(incidents)).toBeGreaterThan(30);
    expect(meanDetectionLead([])).toBeNull();
    const first = incidents[0]!;
    const at = first.detection.confirmedMs + 120_000;
    expect(
      meanTimeToRemediate([{ ...first, incident: { ...first.incident, status: "DIAGNOSED" } }], { [first.incident.incident_id]: { at } }),
    ).toBe(120);
    expect(meanTimeToRemediate([], {})).toBeNull();
    expect(remoteFixableShare([])).toBeNull();
  });

  it("prices the session's diagnoses", () => {
    const s = sessionLlmSpend(incidents, 2.5, 10);
    expect(s.input).toBeGreaterThan(0);
    expect(s.usd).toBeCloseTo((s.input * 2.5 + s.output * 10) / 1e6, 10);
  });
});

describe("scenario CSV export", () => {
  it("lists inputs, line items and totals", () => {
    const r = estimate({ devices: 50_000 });
    const csv = scenarioCsv({ devices: 50_000, interval: 300, payload: 512, batch: 1, llmShare: 1, tier: "large" }, r);
    const lines = csv.trim().split("\n");
    expect(lines[0]).toBe("section,key,value,unit,unit_price_usd,monthly_usd");
    expect(lines).toContain("scenario,devices,50000,devices,,");
    expect(lines.at(-2)).toBe(`total,monthly_usd,,,,${r.totalUsd.toFixed(2)}`);
    expect(csv).toContain('"Messaging (5 KB units, tiered)"');
  });
});
