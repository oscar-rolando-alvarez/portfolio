use anchor_lang::prelude::*;
use crate::state::{InterestRateStrategy, ReserveConfig, YieldFarmingInfo};

/// Liquidity pool state
#[account]
#[derive(Debug)]
pub struct Pool {
    /// Pool authority (PDA)
    pub authority: Pubkey,
    /// Asset mint (underlying token)
    pub asset_mint: Pubkey,
    /// Asset token account (pool's reserve)
    pub asset_token_account: Pubkey,
    /// aToken mint (receipt token for suppliers)
    pub a_token_mint: Pubkey,
    /// Stable debt token mint
    pub stable_debt_token_mint: Pubkey,
    /// Variable debt token mint
    pub variable_debt_token_mint: Pubkey,
    /// Oracle price feed account
    pub oracle_price_feed: Pubkey,
    /// Total supply (aTokens)
    pub total_supply: u64,
    /// Total stable borrows
    pub total_stable_borrows: u64,
    /// Total variable borrows
    pub total_variable_borrows: u64,
    /// Available liquidity
    pub available_liquidity: u64,
    /// Liquidity rate (supply APY)
    pub liquidity_rate: u64,
    /// Variable borrow rate
    pub variable_borrow_rate: u64,
    /// Stable borrow rate
    pub stable_borrow_rate: u64,
    /// Liquidity index (cumulative)
    pub liquidity_index: u128,
    /// Variable borrow index (cumulative)
    pub variable_borrow_index: u128,
    /// Reserve configuration
    pub reserve_config: ReserveConfig,
    /// Interest rate strategy
    pub interest_rate_strategy: InterestRateStrategy,
    /// Yield farming info
    pub yield_farming_info: YieldFarmingInfo,
    /// Last update timestamp
    pub last_update_timestamp: i64,
    /// Pool active state
    pub active: bool,
    /// Pool frozen state (deposits/withdrawals disabled)
    pub frozen: bool,
    /// Pool paused state
    pub paused: bool,
    /// Pool bump seed
    pub bump: u8,
}

impl Pool {
    pub const LEN: usize = 8 + 32 * 7 + 8 * 8 + 16 * 2 + 
        std::mem::size_of::<ReserveConfig>() +
        std::mem::size_of::<InterestRateStrategy>() +
        std::mem::size_of::<YieldFarmingInfo>() +
        8 + 1 * 4;

    pub fn is_active(&self) -> bool {
        self.active && !self.frozen && !self.paused
    }

    pub fn get_total_debt(&self) -> u64 {
        self.total_stable_borrows
            .checked_add(self.total_variable_borrows)
            .unwrap_or(0)
    }

    pub fn get_utilization_rate(&self) -> Result<u64> {
        let total_debt = self.get_total_debt();
        let total_liquidity = self.available_liquidity
            .checked_add(total_debt)
            .ok_or(crate::errors::LendingError::MathOverflow)?;

        if total_liquidity == 0 {
            return Ok(0);
        }

        // Calculate utilization rate in basis points
        let utilization = total_debt
            .checked_mul(10000)
            .ok_or(crate::errors::LendingError::MathOverflow)?
            .checked_div(total_liquidity)
            .ok_or(crate::errors::LendingError::MathOverflow)?;

        Ok(utilization)
    }

    pub fn calculate_interest_rates(&mut self) -> Result<()> {
        let utilization_rate = self.get_utilization_rate()?;
        let strategy = &self.interest_rate_strategy;

        // Calculate variable borrow rate
        if utilization_rate <= strategy.optimal_utilization_rate {
            // Below optimal utilization
            let excess_utilization = utilization_rate;
            self.variable_borrow_rate = strategy.base_variable_borrow_rate
                .checked_add(
                    strategy.variable_rate_slope1
                        .checked_mul(excess_utilization)
                        .ok_or(crate::errors::LendingError::MathOverflow)?
                        .checked_div(strategy.optimal_utilization_rate)
                        .ok_or(crate::errors::LendingError::MathOverflow)?
                )
                .ok_or(crate::errors::LendingError::MathOverflow)?;
        } else {
            // Above optimal utilization
            let excess_utilization = utilization_rate
                .checked_sub(strategy.optimal_utilization_rate)
                .ok_or(crate::errors::LendingError::MathOverflow)?;
            
            self.variable_borrow_rate = strategy.base_variable_borrow_rate
                .checked_add(strategy.variable_rate_slope1)
                .ok_or(crate::errors::LendingError::MathOverflow)?
                .checked_add(
                    strategy.variable_rate_slope2
                        .checked_mul(excess_utilization)
                        .ok_or(crate::errors::LendingError::MathOverflow)?
                        .checked_div(10000_u64.checked_sub(strategy.optimal_utilization_rate).unwrap())
                        .ok_or(crate::errors::LendingError::MathOverflow)?
                )
                .ok_or(crate::errors::LendingError::MathOverflow)?;
        }

        // Calculate stable borrow rate (typically higher than variable)
        self.stable_borrow_rate = self.variable_borrow_rate
            .checked_add(strategy.stable_rate_slope1)
            .ok_or(crate::errors::LendingError::MathOverflow)?;

        // Calculate liquidity rate (supply rate)
        let total_debt = self.get_total_debt();
        let overall_borrow_rate = self.variable_borrow_rate; // Simplified
        
        self.liquidity_rate = overall_borrow_rate
            .checked_mul(utilization_rate)
            .ok_or(crate::errors::LendingError::MathOverflow)?
            .checked_div(10000)
            .ok_or(crate::errors::LendingError::MathOverflow)?
            .checked_mul(10000_u64.checked_sub(self.reserve_config.reserve_factor).unwrap())
            .ok_or(crate::errors::LendingError::MathOverflow)?
            .checked_div(10000)
            .ok_or(crate::errors::LendingError::MathOverflow)?;

        self.last_update_timestamp = Clock::get()?.unix_timestamp;
        Ok(())
    }

    pub fn update_indexes(&mut self) -> Result<()> {
        let current_timestamp = Clock::get()?.unix_timestamp;
        let time_elapsed = current_timestamp
            .checked_sub(self.last_update_timestamp)
            .ok_or(crate::errors::LendingError::InvalidTimestamp)?;

        if time_elapsed > 0 {
            // Update liquidity index
            let liquidity_rate_per_second = self.liquidity_rate as u128 / crate::constants::SECONDS_PER_YEAR as u128;
            let liquidity_compound_factor = crate::constants::RAY
                .checked_add(liquidity_rate_per_second.checked_mul(time_elapsed as u128).unwrap())
                .unwrap();
            
            self.liquidity_index = self.liquidity_index
                .checked_mul(liquidity_compound_factor)
                .ok_or(crate::errors::LendingError::MathOverflow)?
                .checked_div(crate::constants::RAY)
                .ok_or(crate::errors::LendingError::MathOverflow)?;

            // Update variable borrow index
            let variable_rate_per_second = self.variable_borrow_rate as u128 / crate::constants::SECONDS_PER_YEAR as u128;
            let variable_compound_factor = crate::constants::RAY
                .checked_add(variable_rate_per_second.checked_mul(time_elapsed as u128).unwrap())
                .unwrap();
            
            self.variable_borrow_index = self.variable_borrow_index
                .checked_mul(variable_compound_factor)
                .ok_or(crate::errors::LendingError::MathOverflow)?
                .checked_div(crate::constants::RAY)
                .ok_or(crate::errors::LendingError::MathOverflow)?;

            self.last_update_timestamp = current_timestamp;
        }

        Ok(())
    }

    pub fn freeze(&mut self) {
        self.frozen = true;
    }

    pub fn unfreeze(&mut self) {
        self.frozen = false;
    }

    pub fn pause(&mut self) {
        self.paused = true;
    }

    pub fn unpause(&mut self) {
        self.paused = false;
    }
}