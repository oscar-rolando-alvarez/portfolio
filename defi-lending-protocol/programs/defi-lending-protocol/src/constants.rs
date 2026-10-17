use anchor_lang::prelude::*;

#[constant]
pub const PROTOCOL_SEED: &[u8] = b"protocol";
#[constant]
pub const MARKET_SEED: &[u8] = b"market";
#[constant]
pub const COLLATERAL_VAULT_SEED: &[u8] = b"collateral_vault";
#[constant]
pub const LOAN_VAULT_SEED: &[u8] = b"loan_vault";
#[constant]
pub const SHARE_MINT_SEED: &[u8] = b"share_mint";
#[constant]
pub const POSITION_SEED: &[u8] = b"position";

/// 100% expressed in basis points.
pub const BPS: u64 = 10_000;
/// Fixed-point scale used for indexes and USD values (1e18).
pub const WAD: u128 = 1_000_000_000_000_000_000;
pub const SECONDS_PER_YEAR: u64 = 365 * 24 * 60 * 60;

/// Share of the outstanding debt a liquidator may repay in a single call.
pub const CLOSE_FACTOR_BPS: u64 = 5_000;
/// Maximum accepted oracle confidence interval relative to the price.
pub const MAX_ORACLE_CONFIDENCE_BPS: u64 = 200;

pub const MAX_LIQUIDATION_THRESHOLD_BPS: u16 = 9_500;
pub const MAX_LIQUIDATION_BONUS_BPS: u16 = 2_000;
pub const MAX_RESERVE_FACTOR_BPS: u16 = 5_000;
pub const MAX_FLASH_LOAN_FEE_BPS: u16 = 100;
pub const MAX_BORROW_RATE_BPS: u32 = 100_000; // 1000% APR hard ceiling
pub const MAX_PRICE_AGE_SECS: u64 = 3_600;
