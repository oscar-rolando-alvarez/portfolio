use anchor_lang::prelude::*;

/// Protocol constants
pub const PROTOCOL_SEED: &[u8] = b"protocol";
pub const POOL_SEED: &[u8] = b"pool";
pub const USER_OBLIGATION_SEED: &[u8] = b"user_obligation";
pub const GOVERNANCE_SEED: &[u8] = b"governance";
pub const REWARDS_SEED: &[u8] = b"rewards";
pub const FLASH_LOAN_SEED: &[u8] = b"flash_loan";

/// Interest rate model constants
pub const SECONDS_PER_YEAR: u64 = 365 * 24 * 60 * 60;
pub const WAD: u128 = 1_000_000_000_000_000_000; // 10^18
pub const HALF_WAD: u128 = WAD / 2;
pub const RAY: u128 = 1_000_000_000_000_000_000_000_000_000; // 10^27
pub const HALF_RAY: u128 = RAY / 2;

/// Pool configuration constants
pub const MAX_COLLATERAL_FACTOR: u64 = 90_00; // 90% (in basis points)
pub const MIN_COLLATERAL_FACTOR: u64 = 10_00; // 10% (in basis points)
pub const MAX_LIQUIDATION_THRESHOLD: u64 = 95_00; // 95% (in basis points)
pub const MIN_LIQUIDATION_THRESHOLD: u64 = 50_00; // 50% (in basis points)
pub const MAX_LIQUIDATION_BONUS: u64 = 20_00; // 20% (in basis points)
pub const MIN_LIQUIDATION_BONUS: u64 = 5_00; // 5% (in basis points)

/// Fee constants
pub const MAX_FEE_RATE: u64 = 10_00; // 10% (in basis points)
pub const FLASH_LOAN_FEE_RATE: u64 = 9; // 0.09% (in basis points)

/// Oracle constants
pub const MAX_PRICE_AGE: i64 = 300; // 5 minutes in seconds
pub const ORACLE_CONFIDENCE_THRESHOLD: u64 = 1_00; // 1% (in basis points)

/// Governance constants
pub const MIN_PROPOSAL_THRESHOLD: u64 = 100_000 * 10_u64.pow(6); // 100k tokens with 6 decimals
pub const VOTING_PERIOD: i64 = 7 * 24 * 60 * 60; // 7 days in seconds
pub const TIMELOCK_DELAY: i64 = 2 * 24 * 60 * 60; // 2 days in seconds

/// Precision constants
pub const BASIS_POINTS: u64 = 10_000;
pub const PRECISION: u64 = 1_000_000;

/// Time constants
pub const SLOT_PER_YEAR: u64 = 63_072_000; // Assuming 2 slots per second
pub const SLOTS_PER_DAY: u64 = 432_000; // 24 * 60 * 60 * 2

/// Account size constants
pub const PROTOCOL_SIZE: usize = 8 + 32 + 8 + 8 + 1; // discriminator + admin + fee_rate + total_pools + bump
pub const POOL_SIZE: usize = 8 + 32 + 32 + 32 + 32 + 32 + 8 + 8 + 8 + 8 + 8 + 8 + 8 + 8 + 8 + 8 + 8 + 8 + 1; // Full pool state
pub const USER_OBLIGATION_SIZE: usize = 8 + 32 + 32 + 4 + 32 * 10 + 4 + 32 * 10 + 8 + 8 + 1; // User obligation with max 10 deposits/borrows
pub const GOVERNANCE_SIZE: usize = 8 + 32 + 8 + 8 + 8 + 8 + 1; // Governance state

/// Math constants for interest rate calculations
pub const OPTIMAL_UTILIZATION_RATE: u64 = 80_00; // 80% (in basis points)
pub const BASE_VARIABLE_BORROW_RATE: u64 = 0; // 0% base rate
pub const VARIABLE_RATE_SLOPE1: u64 = 4_00; // 4% slope below optimal
pub const VARIABLE_RATE_SLOPE2: u64 = 60_00; // 60% slope above optimal
pub const STABLE_RATE_SLOPE1: u64 = 2_00; // 2% slope below optimal
pub const STABLE_RATE_SLOPE2: u64 = 60_00; // 60% slope above optimal