import { describe, expect, it } from "vitest";
import golden from "./golden.json";
import { estimate, RECOMMENDATION_TITLES, tiered, PRICING, type FleetProfile } from "./model";

const cents = (x: number) => Math.round(x * 100) / 100;

describe("cost model parity with the Python estimator (golden.json)", () => {
  it("uses the same versioned pricing table", () => {
    expect(PRICING.version).toBe("2026-10-01");
    expect(golden.generated_by).toBe("fleetintel-cost golden");
  });

  it.each(golden.cases.map((c, i) => [i, c] as const))("case %i matches to the cent", (_i, c) => {
    const profile = Object.fromEntries(
      Object.entries(c.profile).map(([k, v]) => [k, typeof v === "string" && k !== "ingest_path" ? Number(v) : v]),
    ) as Partial<FleetProfile>;
    const r = estimate(profile);
    expect(cents(r.totalUsd)).toBe(Number(c.total_usd));
    for (const [cat, usd] of Object.entries(c.by_category)) {
      expect(cents(r.byCategory[cat as keyof typeof r.byCategory] ?? 0), cat).toBe(Number(usd));
    }
    expect(Number(r.perDeviceUsd.toFixed(6))).toBeCloseTo(Number(c.per_device_usd), 6);
    for (const [k, v] of Object.entries(c.volumes)) {
      expect(r.volumes[k as keyof typeof r.volumes]).toBeCloseTo(Number(v), 1);
    }
    expect(r.recommendations.map((x) => RECOMMENDATION_TITLES[x.id])).toEqual(c.recommendations.map((x) => x.title));
    r.recommendations.forEach((rec, j) => {
      expect(cents(rec.monthlySavingsUsd)).toBe(Number(c.recommendations[j]!.monthly_savings_usd));
    });
  });

  it("applies IoT Core messaging tiers", () => {
    const tiers = PRICING.iot_core.messaging_tiers;
    expect(tiered(500, tiers)).toBe(500);
    expect(tiered(6000, tiers)).toBeCloseTo(4900, 6);
  });

  it("gets cheaper per device at scale and with less frequent reporting", () => {
    const small = estimate({ devices: 10_000 }, false);
    const big = estimate({ devices: 10_000_000 }, false);
    expect(big.perDeviceUsd).toBeLessThan(small.perDeviceUsd);
    const fast = estimate({ report_interval_seconds: 60 }, false).totalUsd;
    const slow = estimate({ report_interval_seconds: 3600 }, false).totalUsd;
    expect(fast).toBeGreaterThan(slow);
  });
});
