//! Pure, deterministic fixed-point math used by the lending instructions.
//!
//! Everything here is side-effect free so it can be unit tested on the host
//! without a validator. Rounding always favours the protocol: users receive
//! amounts rounded down and owe amounts rounded up.

use crate::constants::{BPS, SECONDS_PER_YEAR, WAD};
use crate::errors::LendingError;
use crate::state::RateModel;
use anchor_lang::prelude::*;

fn overflow() -> Error {
    error!(LendingError::MathOverflow)
}

fn to_u64(v: u128) -> Result<u64> {
    u64::try_from(v).map_err(|_| overflow())
}

fn pow10(exp: u32) -> Result<u128> {
    10u128.checked_pow(exp).ok_or_else(overflow)
}

/// `a * b / c` rounded down, computed in u128.
pub fn mul_div_floor(a: u128, b: u128, c: u128) -> Result<u128> {
    require!(c != 0, LendingError::MathOverflow);
    a.checked_mul(b).ok_or_else(overflow).map(|p| p / c)
}

/// `a * b / c` rounded up, computed in u128.
pub fn mul_div_ceil(a: u128, b: u128, c: u128) -> Result<u128> {
    require!(c != 0, LendingError::MathOverflow);
    let p = a.checked_mul(b).ok_or_else(overflow)?;
    Ok(p.div_ceil(c))
}

/// Borrowed share of supplied liquidity, in basis points (capped at 100%).
pub fn utilization_bps(total_borrows: u64, total_deposits: u64) -> u64 {
    if total_deposits == 0 || total_borrows == 0 {
        return 0;
    }
    let u = (total_borrows as u128) * (BPS as u128) / (total_deposits as u128);
    u.min(BPS as u128) as u64
}

/// Kinked ("jump rate") interest model. Returns the annual borrow rate in bps.
pub fn borrow_rate_bps(utilization: u64, model: &RateModel) -> u64 {
    let optimal = model.optimal_utilization_bps as u64;
    let base = model.base_rate_bps as u64;
    let slope1 = model.slope1_bps as u64;
    let slope2 = model.slope2_bps as u64;
    if utilization <= optimal {
        base + slope1 * utilization / optimal.max(1)
    } else {
        let excess = utilization - optimal;
        let span = (BPS - optimal).max(1);
        base + slope1 + slope2 * excess / span
    }
}

/// Supply APR in bps implied by a borrow rate, utilization and reserve factor.
pub fn supply_rate_bps(borrow_rate: u64, utilization: u64, reserve_factor_bps: u64) -> u64 {
    borrow_rate * utilization / BPS * (BPS - reserve_factor_bps) / BPS
}

/// Result of accruing interest over an elapsed period.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Accrual {
    /// Interest added to outstanding borrows.
    pub interest: u64,
    /// Portion of `interest` kept by the protocol.
    pub reserve: u64,
    /// Updated cumulative borrow index (WAD).
    pub borrow_index: u128,
}

/// Simple (linear) interest accrual per call; compounding emerges from frequent
/// accrual, which is the common approach on Solana to bound compute usage.
pub fn accrue(
    total_borrows: u64,
    borrow_index: u128,
    rate_bps: u64,
    reserve_factor_bps: u64,
    elapsed_secs: u64,
) -> Result<Accrual> {
    if elapsed_secs == 0 || rate_bps == 0 {
        return Ok(Accrual {
            interest: 0,
            reserve: 0,
            borrow_index,
        });
    }
    let denom = (BPS as u128) * (SECONDS_PER_YEAR as u128);
    let growth = mul_div_floor(WAD, (rate_bps as u128) * (elapsed_secs as u128), denom)?;
    let new_index = mul_div_floor(borrow_index, WAD + growth, WAD)?;
    let interest = to_u64(mul_div_floor(total_borrows as u128, growth, WAD)?)?;
    let reserve = to_u64(mul_div_floor(
        interest as u128,
        reserve_factor_bps as u128,
        BPS as u128,
    )?)?;
    Ok(Accrual {
        interest,
        reserve,
        borrow_index: new_index,
    })
}

/// Shares minted for depositing `amount` (rounded down).
pub fn shares_for_deposit(amount: u64, total_deposits: u64, total_shares: u64) -> Result<u64> {
    if total_shares == 0 || total_deposits == 0 {
        return Ok(amount);
    }
    to_u64(mul_div_floor(
        amount as u128,
        total_shares as u128,
        total_deposits as u128,
    )?)
}

/// Underlying assets redeemed for `shares` (rounded down).
pub fn assets_for_shares(shares: u64, total_deposits: u64, total_shares: u64) -> Result<u64> {
    if total_shares == 0 {
        return Ok(0);
    }
    to_u64(mul_div_floor(
        shares as u128,
        total_deposits as u128,
        total_shares as u128,
    )?)
}

/// Converts a borrowed amount into index-scaled debt (rounded up).
pub fn scaled_debt_ceil(amount: u64, borrow_index: u128) -> Result<u128> {
    mul_div_ceil(amount as u128, WAD, borrow_index)
}

/// Converts a repaid amount into index-scaled debt (rounded down).
pub fn scaled_debt_floor(amount: u64, borrow_index: u128) -> Result<u128> {
    mul_div_floor(amount as u128, WAD, borrow_index)
}

/// Current debt for index-scaled debt (rounded up).
pub fn debt_from_scaled(scaled: u128, borrow_index: u128) -> Result<u64> {
    to_u64(mul_div_ceil(scaled, borrow_index, WAD)?)
}

/// USD value (WAD-scaled) of `amount` base units of a token with `decimals`,
/// given a Pyth-style `price * 10^expo`.
pub fn usd_value_wad(amount: u64, decimals: u8, price: i64, expo: i32) -> Result<u128> {
    require!(price > 0, LendingError::NonPositivePrice);
    let raw = (amount as u128)
        .checked_mul(price as u128)
        .ok_or_else(overflow)?;
    let e: i64 = 18 + expo as i64 - decimals as i64;
    if e >= 0 {
        raw.checked_mul(pow10(e as u32)?).ok_or_else(overflow)
    } else {
        Ok(raw / pow10((-e) as u32)?)
    }
}

/// Inverse of [`usd_value_wad`]: base units worth `value_wad` (rounded down).
pub fn amount_for_usd_value(value_wad: u128, decimals: u8, price: i64, expo: i32) -> Result<u64> {
    require!(price > 0, LendingError::NonPositivePrice);
    let e: i64 = 18 + expo as i64 - decimals as i64;
    let amount = if e >= 0 {
        let denom = (price as u128)
            .checked_mul(pow10(e as u32)?)
            .ok_or_else(overflow)?;
        value_wad / denom
    } else {
        mul_div_floor(value_wad, pow10((-e) as u32)?, price as u128)?
    };
    to_u64(amount)
}

/// `true` when `debt_value <= collateral_value * limit_bps / BPS`.
pub fn within_limit(collateral_value: u128, debt_value: u128, limit_bps: u64) -> Result<bool> {
    let lhs = debt_value.checked_mul(BPS as u128).ok_or_else(overflow)?;
    let rhs = collateral_value
        .checked_mul(limit_bps as u128)
        .ok_or_else(overflow)?;
    Ok(lhs <= rhs)
}

/// Health factor in WAD (1e18 == liquidation boundary). `u128::MAX` when debt-free.
pub fn health_factor_wad(
    collateral_value: u128,
    debt_value: u128,
    liquidation_threshold_bps: u64,
) -> Result<u128> {
    if debt_value == 0 {
        return Ok(u128::MAX);
    }
    let weighted = mul_div_floor(
        collateral_value,
        liquidation_threshold_bps as u128,
        BPS as u128,
    )?;
    mul_div_floor(weighted, WAD, debt_value)
}

/// Fee charged on a flash loan (rounded up).
pub fn flash_loan_fee(amount: u64, fee_bps: u64) -> Result<u64> {
    to_u64(mul_div_ceil(amount as u128, fee_bps as u128, BPS as u128)?)
}

/// Splits `fee` between suppliers and protocol reserves.
pub fn split_fee(fee: u64, reserve_factor_bps: u64) -> Result<(u64, u64)> {
    let reserve = to_u64(mul_div_floor(
        fee as u128,
        reserve_factor_bps as u128,
        BPS as u128,
    )?)?;
    Ok((fee - reserve, reserve))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn model() -> RateModel {
        RateModel {
            base_rate_bps: 0,
            slope1_bps: 400,
            slope2_bps: 6_000,
            optimal_utilization_bps: 8_000,
        }
    }

    #[test]
    fn utilization_is_bounded() {
        assert_eq!(utilization_bps(0, 0), 0);
        assert_eq!(utilization_bps(50, 100), 5_000);
        assert_eq!(utilization_bps(150, 100), 10_000);
    }

    #[test]
    fn kinked_rate_model() {
        let m = model();
        assert_eq!(borrow_rate_bps(0, &m), 0);
        assert_eq!(borrow_rate_bps(4_000, &m), 200);
        assert_eq!(borrow_rate_bps(8_000, &m), 400);
        assert_eq!(borrow_rate_bps(9_000, &m), 400 + 3_000);
        assert_eq!(borrow_rate_bps(10_000, &m), 6_400);
    }

    #[test]
    fn supply_rate_accounts_for_reserve_factor() {
        // 10% borrow APR at 50% utilization with a 10% reserve factor -> 4.5%
        assert_eq!(supply_rate_bps(1_000, 5_000, 1_000), 450);
    }

    #[test]
    fn accrual_over_one_year_matches_rate() {
        let a = accrue(1_000_000, WAD, 1_000, 1_000, SECONDS_PER_YEAR).unwrap();
        assert_eq!(a.interest, 100_000);
        assert_eq!(a.reserve, 10_000);
        assert_eq!(a.borrow_index, WAD + WAD / 10);
    }

    #[test]
    fn accrual_noop_when_no_time_passed() {
        let a = accrue(1_000_000, WAD, 1_000, 1_000, 0).unwrap();
        assert_eq!(a.interest, 0);
        assert_eq!(a.borrow_index, WAD);
    }

    #[test]
    fn share_round_trip_never_creates_value() {
        let shares = shares_for_deposit(1_000, 3_333, 3_000).unwrap();
        let assets = assets_for_shares(shares, 3_333 + 1_000, 3_000 + shares).unwrap();
        assert!(assets <= 1_000);
        assert_eq!(shares_for_deposit(500, 0, 0).unwrap(), 500);
    }

    #[test]
    fn debt_rounding_favours_protocol() {
        let index = WAD + WAD / 3;
        let scaled = scaled_debt_ceil(1_000, index).unwrap();
        assert!(debt_from_scaled(scaled, index).unwrap() >= 1_000);
        assert!(scaled_debt_floor(1_000, index).unwrap() <= scaled);
    }

    #[test]
    fn usd_value_normalises_decimals_and_exponent() {
        // 2 SOL (9 decimals) at $150.00000000 (expo -8) == $300
        let v = usd_value_wad(2_000_000_000, 9, 15_000_000_000, -8).unwrap();
        assert_eq!(v, 300 * WAD);
        // 300 USDC (6 decimals) at $1.00 (expo -8)
        let u = usd_value_wad(300_000_000, 6, 100_000_000, -8).unwrap();
        assert_eq!(u, 300 * WAD);
        assert_eq!(
            amount_for_usd_value(v, 9, 15_000_000_000, -8).unwrap(),
            2_000_000_000
        );
    }

    #[test]
    fn rejects_non_positive_prices() {
        assert!(usd_value_wad(1, 6, 0, -8).is_err());
        assert!(usd_value_wad(1, 6, -5, -8).is_err());
    }

    #[test]
    fn ltv_and_health_factor() {
        assert!(within_limit(100 * WAD, 75 * WAD, 7_500).unwrap());
        assert!(!within_limit(100 * WAD, 76 * WAD, 7_500).unwrap());
        let hf = health_factor_wad(100 * WAD, 80 * WAD, 8_000).unwrap();
        assert_eq!(hf, WAD);
        assert_eq!(health_factor_wad(1, 0, 8_000).unwrap(), u128::MAX);
    }

    #[test]
    fn flash_fee_rounds_up_and_splits() {
        assert_eq!(flash_loan_fee(1_000_000, 9).unwrap(), 900);
        assert_eq!(flash_loan_fee(1, 9).unwrap(), 1);
        assert_eq!(split_fee(900, 1_000).unwrap(), (810, 90));
    }
}
