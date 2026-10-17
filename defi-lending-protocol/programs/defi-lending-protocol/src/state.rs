use crate::constants::*;
use crate::errors::LendingError;
use crate::math;
use anchor_lang::prelude::*;

/// Global protocol configuration (singleton PDA).
#[account]
#[derive(InitSpace)]
pub struct Protocol {
    pub admin: Pubkey,
    pub paused: bool,
    pub market_count: u64,
    pub bump: u8,
}

/// Kinked interest rate model parameters (all values in basis points).
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, PartialEq, Eq, InitSpace)]
pub struct RateModel {
    pub base_rate_bps: u32,
    pub slope1_bps: u32,
    pub slope2_bps: u32,
    pub optimal_utilization_bps: u16,
}

/// Risk parameters of an isolated market.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, PartialEq, Eq, InitSpace)]
pub struct MarketConfig {
    /// Maximum debt / collateral value when opening debt.
    pub ltv_bps: u16,
    /// Debt / collateral value above which a position becomes liquidatable.
    pub liquidation_threshold_bps: u16,
    /// Extra collateral awarded to liquidators.
    pub liquidation_bonus_bps: u16,
    /// Share of interest and fees kept by the protocol.
    pub reserve_factor_bps: u16,
    pub flash_loan_fee_bps: u16,
    /// Maximum accepted age of an oracle price, in seconds.
    pub max_price_age_secs: u64,
    pub rate_model: RateModel,
}

impl MarketConfig {
    pub fn validate(&self) -> Result<()> {
        let r = &self.rate_model;
        require!(
            self.ltv_bps > 0
                && self.ltv_bps < self.liquidation_threshold_bps
                && self.liquidation_threshold_bps <= MAX_LIQUIDATION_THRESHOLD_BPS
                && self.liquidation_bonus_bps <= MAX_LIQUIDATION_BONUS_BPS
                && self.reserve_factor_bps <= MAX_RESERVE_FACTOR_BPS
                && self.flash_loan_fee_bps <= MAX_FLASH_LOAN_FEE_BPS
                && self.max_price_age_secs > 0
                && self.max_price_age_secs <= MAX_PRICE_AGE_SECS
                && r.optimal_utilization_bps > 0
                && (r.optimal_utilization_bps as u64) < BPS
                && r.base_rate_bps + r.slope1_bps + r.slope2_bps <= MAX_BORROW_RATE_BPS,
            LendingError::InvalidConfig
        );
        // A liquidation must leave the position better collateralised, so the
        // threshold plus bonus must stay below 100%.
        let threshold_with_bonus = (self.liquidation_threshold_bps as u64)
            * (BPS + self.liquidation_bonus_bps as u64)
            / BPS;
        require!(threshold_with_bonus < BPS, LendingError::InvalidConfig);
        Ok(())
    }
}

/// An isolated lending market: one collateral asset, one borrowable asset.
#[account]
#[derive(InitSpace)]
pub struct Market {
    pub protocol: Pubkey,
    pub collateral_mint: Pubkey,
    pub loan_mint: Pubkey,
    pub collateral_vault: Pubkey,
    pub loan_vault: Pubkey,
    pub share_mint: Pubkey,
    pub token_program: Pubkey,
    pub collateral_decimals: u8,
    pub loan_decimals: u8,
    /// Pyth price feed ids (32 bytes) for each side of the market.
    pub collateral_feed_id: [u8; 32],
    pub loan_feed_id: [u8; 32],
    pub config: MarketConfig,
    /// Underlying owed to suppliers, including accrued interest.
    pub total_deposits: u64,
    /// Outstanding supply shares (mirrors the share mint supply).
    pub total_shares: u64,
    /// Outstanding borrows including accrued interest.
    pub total_borrows: u64,
    /// Protocol-owned reserves held in the loan vault.
    pub total_reserves: u64,
    /// Cumulative borrow index (WAD).
    pub borrow_index: u128,
    pub last_accrual_ts: i64,
    pub flash_loan_amount: u64,
    pub flash_loan_active: bool,
    pub paused: bool,
    pub bump: u8,
}

impl Market {
    pub fn signer_seeds(&self) -> [&[u8]; 4] {
        [
            MARKET_SEED,
            self.collateral_mint.as_ref(),
            self.loan_mint.as_ref(),
            core::slice::from_ref(&self.bump),
        ]
    }

    pub fn assert_operational(&self, protocol: &Protocol) -> Result<()> {
        require!(!protocol.paused && !self.paused, LendingError::Paused);
        require!(!self.flash_loan_active, LendingError::FlashLoanInProgress);
        Ok(())
    }

    /// Liquidity suppliers can withdraw or borrowers can borrow right now.
    pub fn available_liquidity(&self) -> u64 {
        self.total_deposits.saturating_sub(self.total_borrows)
    }

    pub fn utilization_bps(&self) -> u64 {
        math::utilization_bps(self.total_borrows, self.total_deposits)
    }

    pub fn borrow_rate_bps(&self) -> u64 {
        math::borrow_rate_bps(self.utilization_bps(), &self.config.rate_model)
    }

    /// Accrues interest up to `now`, crediting suppliers and reserves.
    pub fn accrue_interest(&mut self, now: i64) -> Result<()> {
        let elapsed = now.saturating_sub(self.last_accrual_ts).max(0) as u64;
        if elapsed == 0 {
            return Ok(());
        }
        let a = math::accrue(
            self.total_borrows,
            self.borrow_index,
            self.borrow_rate_bps(),
            self.config.reserve_factor_bps as u64,
            elapsed,
        )?;
        self.borrow_index = a.borrow_index;
        self.total_borrows = self
            .total_borrows
            .checked_add(a.interest)
            .ok_or(LendingError::MathOverflow)?;
        self.total_deposits = self
            .total_deposits
            .checked_add(a.interest - a.reserve)
            .ok_or(LendingError::MathOverflow)?;
        self.total_reserves = self
            .total_reserves
            .checked_add(a.reserve)
            .ok_or(LendingError::MathOverflow)?;
        self.last_accrual_ts = now;
        Ok(())
    }
}

/// A borrower's collateral and debt in one market.
#[account]
#[derive(InitSpace)]
pub struct Position {
    pub owner: Pubkey,
    pub market: Pubkey,
    pub collateral_amount: u64,
    /// Debt divided by the market borrow index at the time of borrowing (WAD).
    pub borrow_scaled: u128,
    pub bump: u8,
}

impl Position {
    pub fn debt(&self, market: &Market) -> Result<u64> {
        math::debt_from_scaled(self.borrow_scaled, market.borrow_index)
    }
}
