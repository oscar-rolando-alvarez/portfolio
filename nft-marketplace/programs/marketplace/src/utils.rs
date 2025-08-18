use anchor_lang::prelude::*;
use crate::errors::MarketplaceError;

pub fn calculate_fee(amount: u64, fee_bps: u16) -> Result<u64> {
    (amount as u128)
        .checked_mul(fee_bps as u128)
        .and_then(|x| x.checked_div(10000))
        .and_then(|x| x.try_into().ok())
        .ok_or(MarketplaceError::ArithmeticOverflow.into())
}

pub fn validate_percentage(percentage: u16, max_bps: u16) -> Result<()> {
    require!(percentage <= max_bps, MarketplaceError::FeeTooHigh);
    Ok(())
}

pub fn current_timestamp() -> Result<i64> {
    Ok(Clock::get()?.unix_timestamp)
}