use anchor_lang::prelude::*;
use pyth_sdk_solana::{load_price_feed_from_account_info, PriceFeed};
use crate::constants::*;
use crate::errors::LendingError;

pub mod math;
pub mod oracle;
pub mod token;

pub use math::*;
pub use oracle::*;
pub use token::*;

/// Calculate compound interest using the formula: principal * (1 + rate)^time
pub fn calculate_compound_interest(
    principal: u128,
    annual_rate: u64, // in basis points
    time_in_seconds: i64,
) -> Result<u128> {
    if time_in_seconds <= 0 {
        return Ok(principal);
    }

    // Convert annual rate to per-second rate
    let rate_per_second = (annual_rate as u128)
        .checked_mul(WAD)
        .ok_or(LendingError::MathOverflow)?
        .checked_div(BASIS_POINTS as u128)
        .ok_or(LendingError::MathOverflow)?
        .checked_div(SECONDS_PER_YEAR as u128)
        .ok_or(LendingError::MathOverflow)?;

    // For small time periods, use linear approximation: principal * (1 + rate * time)
    let interest_factor = WAD
        .checked_add(
            rate_per_second
                .checked_mul(time_in_seconds as u128)
                .ok_or(LendingError::MathOverflow)?
        )
        .ok_or(LendingError::MathOverflow)?;

    principal
        .checked_mul(interest_factor)
        .ok_or(LendingError::MathOverflow)?
        .checked_div(WAD)
        .ok_or(LendingError::MathOverflow)
        .map_err(Into::into)
}

/// Calculate health factor: (total_collateral * liquidation_threshold) / total_debt
pub fn calculate_health_factor(
    total_collateral_usd: u64,
    total_debt_usd: u64,
    weighted_liquidation_threshold: u64, // in basis points
) -> Result<u64> {
    if total_debt_usd == 0 {
        return Ok(u64::MAX); // No debt means infinite health
    }

    let collateral_value = (total_collateral_usd as u128)
        .checked_mul(weighted_liquidation_threshold as u128)
        .ok_or(LendingError::MathOverflow)?
        .checked_div(BASIS_POINTS as u128)
        .ok_or(LendingError::MathOverflow)?;

    let health_factor = collateral_value
        .checked_mul(BASIS_POINTS as u128)
        .ok_or(LendingError::MathOverflow)?
        .checked_div(total_debt_usd as u128)
        .ok_or(LendingError::MathOverflow)?;

    Ok(health_factor.min(u64::MAX as u128) as u64)
}

/// Calculate maximum borrowable amount based on collateral
pub fn calculate_max_borrow_amount(
    collateral_value_usd: u64,
    existing_debt_usd: u64,
    ltv_ratio: u64, // in basis points
) -> Result<u64> {
    let max_debt = (collateral_value_usd as u128)
        .checked_mul(ltv_ratio as u128)
        .ok_or(LendingError::MathOverflow)?
        .checked_div(BASIS_POINTS as u128)
        .ok_or(LendingError::MathOverflow)?;

    if max_debt <= existing_debt_usd as u128 {
        return Ok(0);
    }

    let available_borrow = max_debt
        .checked_sub(existing_debt_usd as u128)
        .ok_or(LendingError::MathOverflow)?;

    Ok(available_borrow.min(u64::MAX as u128) as u64)
}

/// Calculate liquidation amount and bonus
pub fn calculate_liquidation_amounts(
    debt_to_cover: u64,
    debt_price: u64,
    collateral_price: u64,
    liquidation_bonus: u64, // in basis points
) -> Result<(u64, u64)> {
    // Calculate debt value in USD
    let debt_value_usd = (debt_to_cover as u128)
        .checked_mul(debt_price as u128)
        .ok_or(LendingError::MathOverflow)?
        .checked_div(PRECISION as u128)
        .ok_or(LendingError::MathOverflow)?;

    // Calculate collateral amount to seize (with bonus)
    let collateral_value_with_bonus = debt_value_usd
        .checked_mul((BASIS_POINTS + liquidation_bonus) as u128)
        .ok_or(LendingError::MathOverflow)?
        .checked_div(BASIS_POINTS as u128)
        .ok_or(LendingError::MathOverflow)?;

    let collateral_amount = collateral_value_with_bonus
        .checked_mul(PRECISION as u128)
        .ok_or(LendingError::MathOverflow)?
        .checked_div(collateral_price as u128)
        .ok_or(LendingError::MathOverflow)?;

    let liquidation_bonus_amount = collateral_value_with_bonus
        .checked_sub(debt_value_usd)
        .ok_or(LendingError::MathOverflow)?;

    Ok((
        collateral_amount.min(u64::MAX as u128) as u64,
        liquidation_bonus_amount.min(u64::MAX as u128) as u64,
    ))
}

/// Validate account ownership and discriminator
pub fn validate_account<T: AccountDeserialize>(account_info: &AccountInfo) -> Result<T> {
    if account_info.owner != &crate::ID {
        return Err(LendingError::InvalidProgramOwner.into());
    }

    T::try_deserialize(&mut &account_info.data.borrow()[..])
        .map_err(|_| LendingError::AccountDiscriminatorMismatch.into())
}

/// Calculate flash loan fee
pub fn calculate_flash_loan_fee(amount: u64) -> Result<u64> {
    amount
        .checked_mul(FLASH_LOAN_FEE_RATE)
        .ok_or(LendingError::MathOverflow)?
        .checked_div(BASIS_POINTS)
        .ok_or(LendingError::MathOverflow)
        .map_err(Into::into)
}

/// Normalize amount to 18 decimals for calculations
pub fn normalize_amount(amount: u64, decimals: u8) -> Result<u128> {
    if decimals > 18 {
        return Err(LendingError::InvalidAmount.into());
    }
    
    let multiplier = 10_u128.pow((18 - decimals) as u32);
    (amount as u128)
        .checked_mul(multiplier)
        .ok_or(LendingError::MathOverflow)
        .map_err(Into::into)
}

/// Denormalize amount from 18 decimals
pub fn denormalize_amount(normalized_amount: u128, decimals: u8) -> Result<u64> {
    if decimals > 18 {
        return Err(LendingError::InvalidAmount.into());
    }
    
    let divisor = 10_u128.pow((18 - decimals) as u32);
    normalized_amount
        .checked_div(divisor)
        .ok_or(LendingError::MathOverflow)?
        .try_into()
        .map_err(|_| LendingError::MathOverflow.into())
}

/// Convert basis points to percentage
pub fn basis_points_to_percentage(basis_points: u64) -> f64 {
    basis_points as f64 / BASIS_POINTS as f64
}

/// Convert percentage to basis points
pub fn percentage_to_basis_points(percentage: f64) -> u64 {
    (percentage * BASIS_POINTS as f64) as u64
}

/// Check if timestamp is recent enough
pub fn is_timestamp_recent(timestamp: i64, max_age_seconds: i64) -> bool {
    let current_time = Clock::get().unwrap().unix_timestamp;
    current_time - timestamp <= max_age_seconds
}

/// Safe division with rounding
pub fn safe_div_round_up(dividend: u64, divisor: u64) -> Result<u64> {
    if divisor == 0 {
        return Err(LendingError::MathOverflow.into());
    }
    
    Ok((dividend + divisor - 1) / divisor)
}

/// Safe division with rounding down
pub fn safe_div_round_down(dividend: u64, divisor: u64) -> Result<u64> {
    if divisor == 0 {
        return Err(LendingError::MathOverflow.into());
    }
    
    Ok(dividend / divisor)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_calculate_health_factor() {
        let result = calculate_health_factor(1000, 500, 8000).unwrap();
        assert_eq!(result, 16000); // 160%
    }

    #[test]
    fn test_calculate_compound_interest() {
        let principal = 1000 * WAD;
        let annual_rate = 500; // 5%
        let time = 31536000; // 1 year
        
        let result = calculate_compound_interest(principal, annual_rate, time).unwrap();
        assert!(result > principal); // Should have grown
    }

    #[test]
    fn test_normalize_denormalize() {
        let amount = 1000000; // 1 USDC (6 decimals)
        let normalized = normalize_amount(amount, 6).unwrap();
        let denormalized = denormalize_amount(normalized, 6).unwrap();
        assert_eq!(amount, denormalized);
    }
}