import { type Market, type RateModel, WAD } from "./accounts";

export const BPS = 10_000;

/** Utilization in bps: min(borrows * 10000 / deposits, 10000); 0 when there are no deposits. */
export function utilizationBps(totalBorrows: bigint, totalDeposits: bigint): number {
  if (totalDeposits <= 0n) return 0;
  const u = (totalBorrows * BigInt(BPS)) / totalDeposits;
  return Number(u > BigInt(BPS) ? BigInt(BPS) : u);
}

/** Kinked (two-slope) borrow rate, annualized, in bps. Integer math mirrors the program. */
export function borrowRateBps(model: RateModel, utilization: number): number {
  const u = Math.min(Math.max(Math.trunc(utilization), 0), BPS);
  const opt = model.optimalUtilizationBps;
  if (opt <= 0) {
    return model.baseRateBps + model.slope1Bps + Math.floor((model.slope2Bps * u) / BPS);
  }
  if (u <= opt || opt >= BPS) {
    return model.baseRateBps + Math.floor((model.slope1Bps * Math.min(u, opt)) / opt);
  }
  return (
    model.baseRateBps + model.slope1Bps + Math.floor((model.slope2Bps * (u - opt)) / (BPS - opt))
  );
}

/** Supply rate in bps: borrow_rate * u / 10000 * (10000 - reserve_factor) / 10000. */
export function supplyRateBps(
  model: RateModel,
  utilization: number,
  reserveFactorBps: number,
): number {
  const borrow = borrowRateBps(model, utilization);
  const u = Math.min(Math.max(Math.trunc(utilization), 0), BPS);
  const rf = Math.min(Math.max(reserveFactorBps, 0), BPS);
  return Math.floor((Math.floor((borrow * u) / BPS) * (BPS - rf)) / BPS);
}

export interface MarketRates {
  utilizationBps: number;
  borrowRateBps: number;
  supplyRateBps: number;
}

export function marketRates(market: Market): MarketRates {
  const u = utilizationBps(market.totalBorrows, market.totalDeposits);
  return {
    utilizationBps: u,
    borrowRateBps: borrowRateBps(market.config.rateModel, u),
    supplyRateBps: supplyRateBps(market.config.rateModel, u, market.config.reserveFactorBps),
  };
}

/** Current debt in loan-token base units: ceil(borrow_scaled * borrow_index / WAD). */
export function currentDebt(borrowScaled: bigint, borrowIndex: bigint): bigint {
  if (borrowScaled <= 0n || borrowIndex <= 0n) return 0n;
  const product = borrowScaled * borrowIndex;
  return (product + WAD - 1n) / WAD;
}

/**
 * Health factor = collateral value * liquidation threshold / debt value.
 * Values must be expressed in the same quote unit (e.g. USD from the oracle).
 * Returns Infinity when there is no debt; < 1 means the position is liquidatable.
 */
export function healthFactor(
  collateralValue: number,
  debtValue: number,
  liquidationThresholdBps: number,
): number {
  if (debtValue <= 0) return Number.POSITIVE_INFINITY;
  return (collateralValue * liquidationThresholdBps) / BPS / debtValue;
}

export interface RatePoint {
  utilizationBps: number;
  borrowRateBps: number;
  supplyRateBps: number;
}

/** Samples the rate curve from 0% to 100% utilization (inclusive), always including the kink. */
export function rateCurve(model: RateModel, reserveFactorBps: number, steps = 50): RatePoint[] {
  const n = Math.max(1, Math.trunc(steps));
  const us = new Set<number>();
  for (let i = 0; i <= n; i++) us.add(Math.round((i * BPS) / n));
  if (model.optimalUtilizationBps > 0 && model.optimalUtilizationBps < BPS) {
    us.add(model.optimalUtilizationBps);
  }
  return [...us]
    .sort((a, b) => a - b)
    .map((u) => ({
      utilizationBps: u,
      borrowRateBps: borrowRateBps(model, u),
      supplyRateBps: supplyRateBps(model, u, reserveFactorBps),
    }));
}
