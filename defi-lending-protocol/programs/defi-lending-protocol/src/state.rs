use anchor_lang::prelude::*;

pub mod protocol;
pub mod pool;
pub mod user_obligation;
pub mod governance;
pub mod rewards;

pub use protocol::*;
pub use pool::*;
pub use user_obligation::*;
pub use governance::*;
pub use rewards::*;

/// Interest rate mode
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, PartialEq)]
pub enum InterestRateMode {
    /// Stable interest rate
    Stable = 1,
    /// Variable interest rate
    Variable = 2,
}

/// Liquidation close factor
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug)]
pub struct LiquidationConfig {
    /// Maximum percentage of debt that can be liquidated in one transaction
    pub close_factor: u64,
    /// Liquidation incentive for liquidators
    pub liquidation_incentive: u64,
}

/// Oracle price data
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug)]
pub struct PriceData {
    /// Price in USD with 8 decimal places
    pub price: u64,
    /// Confidence interval
    pub confidence: u64,
    /// Price publish time
    pub publish_time: i64,
    /// Exponential moving average price
    pub ema_price: u64,
}

/// Reserve configuration
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug)]
pub struct ReserveConfig {
    /// Loan to value ratio (in basis points)
    pub ltv: u64,
    /// Liquidation threshold (in basis points)
    pub liquidation_threshold: u64,
    /// Liquidation bonus (in basis points)
    pub liquidation_bonus: u64,
    /// Reserve factor (in basis points)
    pub reserve_factor: u64,
    /// Borrowing enabled
    pub borrowing_enabled: bool,
    /// Stable borrowing enabled
    pub stable_borrowing_enabled: bool,
}

/// Interest rate strategy
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug)]
pub struct InterestRateStrategy {
    /// Optimal utilization rate (in basis points)
    pub optimal_utilization_rate: u64,
    /// Base variable borrow rate (in basis points)
    pub base_variable_borrow_rate: u64,
    /// Variable rate slope 1 (in basis points)
    pub variable_rate_slope1: u64,
    /// Variable rate slope 2 (in basis points)
    pub variable_rate_slope2: u64,
    /// Stable rate slope 1 (in basis points)
    pub stable_rate_slope1: u64,
    /// Stable rate slope 2 (in basis points)
    pub stable_rate_slope2: u64,
}

impl Default for InterestRateStrategy {
    fn default() -> Self {
        Self {
            optimal_utilization_rate: 8000, // 80%
            base_variable_borrow_rate: 0,   // 0%
            variable_rate_slope1: 400,      // 4%
            variable_rate_slope2: 6000,     // 60%
            stable_rate_slope1: 200,        // 2%
            stable_rate_slope2: 6000,       // 60%
        }
    }
}

/// Flash loan data
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct FlashLoanData {
    /// Amount of tokens borrowed
    pub amount: u64,
    /// Fee amount
    pub fee: u64,
    /// Receiver program
    pub receiver: Pubkey,
    /// Additional parameters
    pub params: Vec<u8>,
}

/// Yield farming info
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug)]
pub struct YieldFarmingInfo {
    /// Total rewards distributed
    pub total_rewards: u64,
    /// Reward rate per second
    pub reward_rate: u64,
    /// Last update time
    pub last_update_time: i64,
    /// Reward per token stored
    pub reward_per_token_stored: u128,
}

/// User yield farming state
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug)]
pub struct UserYieldState {
    /// User reward per token paid
    pub reward_per_token_paid: u128,
    /// Rewards earned by user
    pub rewards: u64,
    /// Last claim time
    pub last_claim_time: i64,
}