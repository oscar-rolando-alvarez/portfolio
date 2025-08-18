use anchor_lang::prelude::*;
use pyth_sdk_solana::{load_price_feed_from_account_info, PriceFeed, Price};
use switchboard_v2::AggregatorAccountData;
use crate::constants::*;
use crate::errors::LendingError;
use crate::state::PriceData;

pub struct OracleUtils;

impl OracleUtils {
    /// Get price from Pyth oracle
    pub fn get_pyth_price(
        price_feed_account: &AccountInfo,
        max_age_seconds: i64,
        max_confidence_pct: u64,
    ) -> Result<PriceData> {
        let price_feed = load_price_feed_from_account_info(price_feed_account)
            .map_err(|_| LendingError::InvalidOracleAccount)?;

        let current_timestamp = Clock::get()?.unix_timestamp;
        let price = price_feed
            .get_current_price()
            .ok_or(LendingError::PriceFeedNotFound)?;

        // Check price age
        if current_timestamp - price.publish_time > max_age_seconds {
            return Err(LendingError::OraclePriceTooOld.into());
        }

        // Check confidence interval
        let confidence_pct = Self::calculate_confidence_percentage(price.price, price.conf)?;
        if confidence_pct > max_confidence_pct {
            return Err(LendingError::OraclePriceConfidenceTooLow.into());
        }

        // Convert to our price format
        let normalized_price = Self::normalize_pyth_price(price.price, price.expo)?;
        let normalized_conf = Self::normalize_pyth_price(price.conf as i64, price.expo)?;

        // Get EMA price if available
        let ema_price = price_feed
            .get_ema_price()
            .map(|ema| Self::normalize_pyth_price(ema.price, ema.expo).unwrap_or(0))
            .unwrap_or(normalized_price);

        Ok(PriceData {
            price: normalized_price,
            confidence: normalized_conf,
            publish_time: price.publish_time,
            ema_price,
        })
    }

    /// Get price from Switchboard oracle
    pub fn get_switchboard_price(
        aggregator_account: &AccountInfo,
        max_age_seconds: i64,
    ) -> Result<PriceData> {
        let aggregator = AggregatorAccountData::new(aggregator_account)
            .map_err(|_| LendingError::InvalidOracleAccount)?;

        let current_timestamp = Clock::get()?.unix_timestamp;
        
        // Get latest round data
        let latest_round = aggregator.latest_confirmed_round
            .ok_or(LendingError::PriceFeedNotFound)?;

        // Check price age
        if current_timestamp - latest_round.round_open_timestamp > max_age_seconds {
            return Err(LendingError::OraclePriceTooOld.into());
        }

        // Convert Switchboard decimal to u64 price (8 decimals)
        let price = latest_round.result
            .mantissa()
            .checked_mul(10_u128.pow(8))
            .ok_or(LendingError::MathOverflow)?
            .checked_div(10_u128.pow(latest_round.result.scale() as u32))
            .ok_or(LendingError::MathOverflow)? as u64;

        Ok(PriceData {
            price,
            confidence: 0, // Switchboard doesn't provide confidence interval
            publish_time: latest_round.round_open_timestamp,
            ema_price: price, // Use current price as EMA
        })
    }

    /// Normalize Pyth price to 8 decimal places
    fn normalize_pyth_price(price: i64, expo: i32) -> Result<u64> {
        const TARGET_DECIMALS: i32 = 8;
        
        if price < 0 {
            return Err(LendingError::InvalidAmount.into());
        }

        let price_u64 = price as u64;
        
        if expo >= 0 {
            // Positive exponent: multiply
            let multiplier = 10_u64.pow(expo as u32);
            let scaled_price = price_u64
                .checked_mul(multiplier)
                .ok_or(LendingError::MathOverflow)?;
            
            // Scale to target decimals
            if expo > TARGET_DECIMALS {
                let divisor = 10_u64.pow((expo - TARGET_DECIMALS) as u32);
                scaled_price
                    .checked_div(divisor)
                    .ok_or(LendingError::MathOverflow.into())
            } else {
                let multiplier = 10_u64.pow((TARGET_DECIMALS - expo) as u32);
                scaled_price
                    .checked_mul(multiplier)
                    .ok_or(LendingError::MathOverflow.into())
            }
        } else {
            // Negative exponent: divide
            let abs_expo = (-expo) as u32;
            
            if abs_expo > TARGET_DECIMALS as u32 {
                let divisor = 10_u64.pow(abs_expo - TARGET_DECIMALS as u32);
                price_u64
                    .checked_div(divisor)
                    .ok_or(LendingError::MathOverflow.into())
            } else {
                let multiplier = 10_u64.pow(TARGET_DECIMALS as u32 - abs_expo);
                price_u64
                    .checked_mul(multiplier)
                    .ok_or(LendingError::MathOverflow.into())
            }
        }
    }

    /// Calculate confidence as percentage (basis points)
    fn calculate_confidence_percentage(price: i64, confidence: u64) -> Result<u64> {
        if price <= 0 {
            return Ok(BASIS_POINTS); // 100% confidence interval (worst case)
        }

        let price_abs = price.abs() as u64;
        confidence
            .checked_mul(BASIS_POINTS)
            .ok_or(LendingError::MathOverflow)?
            .checked_div(price_abs)
            .ok_or(LendingError::MathOverflow.into())
    }

    /// Get price with fallback to multiple oracles
    pub fn get_price_with_fallback(
        primary_oracle: &AccountInfo,
        secondary_oracle: Option<&AccountInfo>,
        oracle_type: OracleType,
        max_age_seconds: i64,
        max_confidence_pct: u64,
    ) -> Result<PriceData> {
        // Try primary oracle first
        let primary_result = match oracle_type {
            OracleType::Pyth => Self::get_pyth_price(primary_oracle, max_age_seconds, max_confidence_pct),
            OracleType::Switchboard => Self::get_switchboard_price(primary_oracle, max_age_seconds),
        };

        if let Ok(price_data) = primary_result {
            return Ok(price_data);
        }

        // Fallback to secondary oracle if available
        if let Some(secondary) = secondary_oracle {
            match oracle_type {
                OracleType::Pyth => Self::get_pyth_price(secondary, max_age_seconds, max_confidence_pct),
                OracleType::Switchboard => Self::get_switchboard_price(secondary, max_age_seconds),
            }
        } else {
            Err(LendingError::PriceFeedNotFound.into())
        }
    }

    /// Validate price data quality
    pub fn validate_price_data(
        price_data: &PriceData,
        min_price: u64,
        max_price: u64,
        max_confidence_pct: u64,
    ) -> Result<()> {
        // Check price bounds
        if price_data.price < min_price || price_data.price > max_price {
            return Err(LendingError::InvalidAmount.into());
        }

        // Check confidence interval
        let confidence_pct = if price_data.price > 0 {
            price_data.confidence
                .checked_mul(BASIS_POINTS)
                .ok_or(LendingError::MathOverflow)?
                .checked_div(price_data.price)
                .ok_or(LendingError::MathOverflow)?
        } else {
            BASIS_POINTS
        };

        if confidence_pct > max_confidence_pct {
            return Err(LendingError::OraclePriceConfidenceTooLow.into());
        }

        // Check age
        let current_time = Clock::get()?.unix_timestamp;
        if current_time - price_data.publish_time > MAX_PRICE_AGE {
            return Err(LendingError::OraclePriceTooOld.into());
        }

        Ok(())
    }

    /// Calculate TWAP (Time-Weighted Average Price) from multiple price points
    pub fn calculate_twap(
        price_points: &[(u64, i64)], // (price, timestamp) pairs
        window_seconds: i64,
    ) -> Result<u64> {
        if price_points.len() < 2 {
            return Err(LendingError::InvalidAmount.into());
        }

        let current_time = Clock::get()?.unix_timestamp;
        let start_time = current_time - window_seconds;

        let mut weighted_sum = 0u128;
        let mut total_weight = 0u64;

        for i in 0..price_points.len() - 1 {
            let (price, timestamp) = price_points[i];
            let (_, next_timestamp) = price_points[i + 1];

            // Skip prices outside the window
            if timestamp < start_time {
                continue;
            }

            let weight = (next_timestamp - timestamp).max(0) as u64;
            weighted_sum = weighted_sum
                .checked_add((price as u128).checked_mul(weight as u128).ok_or(LendingError::MathOverflow)?)
                .ok_or(LendingError::MathOverflow)?;
            total_weight = total_weight
                .checked_add(weight)
                .ok_or(LendingError::MathOverflow)?;
        }

        if total_weight == 0 {
            return Err(LendingError::InvalidAmount.into());
        }

        weighted_sum
            .checked_div(total_weight as u128)
            .ok_or(LendingError::MathOverflow)?
            .try_into()
            .map_err(|_| LendingError::MathOverflow.into())
    }
}

#[derive(Clone, Copy, Debug)]
pub enum OracleType {
    Pyth,
    Switchboard,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_normalize_pyth_price() {
        // Test case: price = 12345, expo = -2 (should become 123.45 with 8 decimals)
        let result = OracleUtils::normalize_pyth_price(12345, -2).unwrap();
        assert_eq!(result, 1234500000000); // 123.45 * 10^8 / 10^2 = 123.45 * 10^6

        // Test case: price = 100, expo = 0 (should become 100.00000000)
        let result = OracleUtils::normalize_pyth_price(100, 0).unwrap();
        assert_eq!(result, 10000000000); // 100 * 10^8
    }

    #[test]
    fn test_confidence_percentage() {
        let confidence_pct = OracleUtils::calculate_confidence_percentage(10000, 100).unwrap();
        assert_eq!(confidence_pct, 100); // 1% confidence
    }
}