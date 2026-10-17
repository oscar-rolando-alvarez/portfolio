import { describe, expect, it } from "vitest";
import type { RateModel } from "./accounts";
import { WAD } from "./accounts";
import {
  borrowRateBps,
  currentDebt,
  healthFactor,
  rateCurve,
  supplyRateBps,
  utilizationBps,
} from "./rates";

const model: RateModel = {
  baseRateBps: 200,
  slope1Bps: 400,
  slope2Bps: 7_500,
  optimalUtilizationBps: 8_000,
};

describe("utilizationBps", () => {
  it("is 0 with no deposits", () => {
    expect(utilizationBps(100n, 0n)).toBe(0);
  });
  it("computes borrows/deposits in bps with integer division", () => {
    expect(utilizationBps(600n, 1_000n)).toBe(6_000);
    expect(utilizationBps(1n, 3n)).toBe(3_333);
  });
  it("caps at 100%", () => {
    expect(utilizationBps(2_000n, 1_000n)).toBe(10_000);
  });
});

describe("borrowRateBps", () => {
  it("equals the base rate at 0% utilization", () => {
    expect(borrowRateBps(model, 0)).toBe(200);
  });
  it("rises by slope1 up to the kink", () => {
    expect(borrowRateBps(model, 4_000)).toBe(200 + 200);
    expect(borrowRateBps(model, 8_000)).toBe(600);
  });
  it("rises by slope2 above the kink", () => {
    expect(borrowRateBps(model, 9_000)).toBe(600 + 3_750);
    expect(borrowRateBps(model, 10_000)).toBe(600 + 7_500);
  });
  it("handles a 100% optimal utilization without dividing by zero", () => {
    expect(borrowRateBps({ ...model, optimalUtilizationBps: 10_000 }, 10_000)).toBe(600);
  });
  it("handles a 0% optimal utilization", () => {
    expect(borrowRateBps({ ...model, optimalUtilizationBps: 0 }, 5_000)).toBe(600 + 3_750);
  });
});

describe("supplyRateBps", () => {
  it("scales borrow rate by utilization and reserve factor", () => {
    // borrow 6000bps u => 200 + 400*6000/8000 = 500; 500*0.6 = 300; *0.9 = 270
    expect(supplyRateBps(model, 6_000, 1_000)).toBe(270);
  });
  it("is 0 when nothing is borrowed", () => {
    expect(supplyRateBps(model, 0, 1_000)).toBe(0);
  });
});

describe("currentDebt", () => {
  it("rounds up borrow_scaled * index / WAD", () => {
    expect(currentDebt(100n, WAD)).toBe(100n);
    expect(currentDebt(3n, WAD + 1n)).toBe(4n);
    expect(currentDebt(1_000n, (WAD * 105n) / 100n)).toBe(1_050n);
  });
  it("is 0 with nothing borrowed", () => {
    expect(currentDebt(0n, WAD)).toBe(0n);
  });
});

describe("healthFactor", () => {
  it("is infinite without debt", () => {
    expect(healthFactor(100, 0, 8_000)).toBe(Number.POSITIVE_INFINITY);
  });
  it("weights collateral by the liquidation threshold", () => {
    expect(healthFactor(1_000, 400, 8_000)).toBeCloseTo(2);
    expect(healthFactor(1_000, 900, 8_000)).toBeLessThan(1);
  });
});

describe("rateCurve", () => {
  it("covers 0..100% and includes the kink", () => {
    const pts = rateCurve(model, 1_000, 3);
    expect(pts[0]?.utilizationBps).toBe(0);
    expect(pts.at(-1)?.utilizationBps).toBe(10_000);
    expect(pts.some((p) => p.utilizationBps === 8_000)).toBe(true);
    const sorted = [...pts].sort((a, b) => a.utilizationBps - b.utilizationBps);
    expect(pts).toEqual(sorted);
  });
});
