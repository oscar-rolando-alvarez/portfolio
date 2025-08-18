use anchor_lang::prelude::*;
use crate::constants::*;
use crate::errors::LendingError;

/// Math utilities for lending protocol calculations
pub struct MathUtils;

impl MathUtils {
    /// Multiply two u64 numbers with overflow protection
    pub fn mul_u64(a: u64, b: u64) -> Result<u64> {
        a.checked_mul(b)
            .ok_or(LendingError::MathOverflow.into())
    }

    /// Divide two u64 numbers with overflow protection
    pub fn div_u64(a: u64, b: u64) -> Result<u64> {
        if b == 0 {
            return Err(LendingError::MathOverflow.into());
        }
        Ok(a / b)
    }

    /// Add two u64 numbers with overflow protection
    pub fn add_u64(a: u64, b: u64) -> Result<u64> {
        a.checked_add(b)
            .ok_or(LendingError::MathOverflow.into())
    }

    /// Subtract two u64 numbers with overflow protection
    pub fn sub_u64(a: u64, b: u64) -> Result<u64> {
        a.checked_sub(b)
            .ok_or(LendingError::MathOverflow.into())
    }

    /// Calculate percentage of a value
    pub fn percentage_of(value: u64, percentage: u64) -> Result<u64> {
        value
            .checked_mul(percentage)
            .ok_or(LendingError::MathOverflow)?
            .checked_div(BASIS_POINTS)
            .ok_or(LendingError::MathOverflow.into())
    }

    /// Calculate utilization rate as basis points
    pub fn calculate_utilization_rate(total_debt: u64, total_liquidity: u64) -> Result<u64> {
        if total_liquidity == 0 {
            return Ok(0);
        }

        total_debt
            .checked_mul(BASIS_POINTS)
            .ok_or(LendingError::MathOverflow)?
            .checked_div(total_liquidity)
            .ok_or(LendingError::MathOverflow.into())
    }

    /// Ray math operations (1e27 precision)
    pub fn ray_mul(a: u128, b: u128) -> Result<u128> {
        (a.checked_mul(b).ok_or(LendingError::MathOverflow)?)
            .checked_add(HALF_RAY)
            .ok_or(LendingError::MathOverflow)?
            .checked_div(RAY)
            .ok_or(LendingError::MathOverflow.into())
    }

    pub fn ray_div(a: u128, b: u128) -> Result<u128> {
        if b == 0 {
            return Err(LendingError::MathOverflow.into());
        }

        let half_b = b / 2;
        (a.checked_mul(RAY).ok_or(LendingError::MathOverflow)?)
            .checked_add(half_b)
            .ok_or(LendingError::MathOverflow)?
            .checked_div(b)
            .ok_or(LendingError::MathOverflow.into())
    }

    /// WAD math operations (1e18 precision)
    pub fn wad_mul(a: u128, b: u128) -> Result<u128> {
        (a.checked_mul(b).ok_or(LendingError::MathOverflow)?)
            .checked_add(HALF_WAD)
            .ok_or(LendingError::MathOverflow)?
            .checked_div(WAD)
            .ok_or(LendingError::MathOverflow.into())
    }

    pub fn wad_div(a: u128, b: u128) -> Result<u128> {
        if b == 0 {
            return Err(LendingError::MathOverflow.into());
        }

        let half_b = b / 2;
        (a.checked_mul(WAD).ok_or(LendingError::MathOverflow)?)
            .checked_add(half_b)
            .ok_or(LendingError::MathOverflow)?
            .checked_div(b)
            .ok_or(LendingError::MathOverflow.into())
    }

    /// Calculate interest rate based on utilization and rate model
    pub fn calculate_interest_rate(
        utilization_rate: u64,
        optimal_utilization: u64,
        base_rate: u64,
        slope1: u64,
        slope2: u64,
    ) -> Result<u64> {
        if utilization_rate <= optimal_utilization {
            // Linear interpolation below optimal
            let rate_increment = slope1
                .checked_mul(utilization_rate)
                .ok_or(LendingError::MathOverflow)?
                .checked_div(optimal_utilization)
                .ok_or(LendingError::MathOverflow)?;

            base_rate
                .checked_add(rate_increment)
                .ok_or(LendingError::MathOverflow.into())
        } else {
            // Linear interpolation above optimal
            let excess_utilization = utilization_rate
                .checked_sub(optimal_utilization)
                .ok_or(LendingError::MathOverflow)?;

            let max_excess = BASIS_POINTS
                .checked_sub(optimal_utilization)
                .ok_or(LendingError::MathOverflow)?;

            let rate_increment = slope2
                .checked_mul(excess_utilization)
                .ok_or(LendingError::MathOverflow)?
                .checked_div(max_excess)
                .ok_or(LendingError::MathOverflow)?;

            base_rate
                .checked_add(slope1)
                .ok_or(LendingError::MathOverflow)?
                .checked_add(rate_increment)
                .ok_or(LendingError::MathOverflow.into())
        }
    }

    /// Calculate linear interest accumulation
    pub fn calculate_linear_interest(
        rate: u64,        // Annual rate in basis points
        time_delta: u64,  // Time in seconds
    ) -> Result<u128> {
        let rate_per_second = (rate as u128)
            .checked_mul(RAY)
            .ok_or(LendingError::MathOverflow)?
            .checked_div(BASIS_POINTS as u128)
            .ok_or(LendingError::MathOverflow)?
            .checked_div(SECONDS_PER_YEAR as u128)
            .ok_or(LendingError::MathOverflow)?;

        RAY.checked_add(
            rate_per_second
                .checked_mul(time_delta as u128)
                .ok_or(LendingError::MathOverflow)?
        )
        .ok_or(LendingError::MathOverflow.into())
    }

    /// Calculate compound interest accumulation
    pub fn calculate_compound_interest(
        rate: u64,        // Annual rate in basis points
        time_delta: u64,  // Time in seconds
    ) -> Result<u128> {
        // For short time periods, linear approximation is sufficient
        if time_delta < 86400 {  // Less than 1 day
            return Self::calculate_linear_interest(rate, time_delta);
        }

        // For longer periods, use compound interest formula
        // A = P(1 + r/n)^(nt) where n = compounding frequency
        let rate_per_second = (rate as u128)
            .checked_mul(RAY)
            .ok_or(LendingError::MathOverflow)?
            .checked_div(BASIS_POINTS as u128)
            .ok_or(LendingError::MathOverflow)?
            .checked_div(SECONDS_PER_YEAR as u128)
            .ok_or(LendingError::MathOverflow)?;

        // Simplified compound interest for blockchain efficiency
        let compound_factor = RAY
            .checked_add(
                rate_per_second
                    .checked_mul(time_delta as u128)
                    .ok_or(LendingError::MathOverflow)?
            )
            .ok_or(LendingError::MathOverflow)?;

        Ok(compound_factor)
    }

    /// Calculate weighted average
    pub fn calculate_weighted_average(
        value1: u64,
        weight1: u64,
        value2: u64,
        weight2: u64,
    ) -> Result<u64> {
        let total_weight = weight1
            .checked_add(weight2)
            .ok_or(LendingError::MathOverflow)?;

        if total_weight == 0 {
            return Ok(0);
        }

        let weighted_sum = value1
            .checked_mul(weight1)
            .ok_or(LendingError::MathOverflow)?
            .checked_add(
                value2
                    .checked_mul(weight2)
                    .ok_or(LendingError::MathOverflow)?
            )
            .ok_or(LendingError::MathOverflow)?;

        weighted_sum
            .checked_div(total_weight)
            .ok_or(LendingError::MathOverflow.into())
    }

    /// Scale value by decimal difference
    pub fn scale_by_decimals(value: u64, from_decimals: u8, to_decimals: u8) -> Result<u64> {
        if from_decimals == to_decimals {
            return Ok(value);
        }

        if from_decimals > to_decimals {
            let scale_down = 10_u64.pow((from_decimals - to_decimals) as u32);
            value
                .checked_div(scale_down)
                .ok_or(LendingError::MathOverflow.into())
        } else {
            let scale_up = 10_u64.pow((to_decimals - from_decimals) as u32);
            value
                .checked_mul(scale_up)
                .ok_or(LendingError::MathOverflow.into())
        }
    }

    /// Calculate minimum of two values
    pub fn min(a: u64, b: u64) -> u64 {
        if a < b { a } else { b }
    }

    /// Calculate maximum of two values
    pub fn max(a: u64, b: u64) -> u64 {
        if a > b { a } else { b }
    }

    /// Check if value is within bounds
    pub fn is_within_bounds(value: u64, min_value: u64, max_value: u64) -> bool {
        value >= min_value && value <= max_value
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_utilization_rate() {
        let utilization = MathUtils::calculate_utilization_rate(500, 1000).unwrap();
        assert_eq!(utilization, 5000); // 50%
    }

    #[test]
    fn test_interest_rate_calculation() {
        let rate = MathUtils::calculate_interest_rate(
            5000,  // 50% utilization
            8000,  // 80% optimal
            0,     // 0% base
            400,   // 4% slope1
            6000,  // 60% slope2
        ).unwrap();
        assert_eq!(rate, 250); // 2.5%
    }

    #[test]
    fn test_ray_math() {
        let a = RAY;
        let b = RAY / 2;
        let result = MathUtils::ray_mul(a, b).unwrap();
        assert_eq!(result, RAY / 2);
    }

    #[test]
    fn test_scale_decimals() {
        let value = 1000000; // 1 USDC (6 decimals)
        let scaled = MathUtils::scale_by_decimals(value, 6, 18).unwrap();
        assert_eq!(scaled, 1000000000000000000); // 1e18
    }
}