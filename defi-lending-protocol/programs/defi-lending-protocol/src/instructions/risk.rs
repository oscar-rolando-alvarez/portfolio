use crate::math;
use crate::oracle::{self, OraclePrice};
use crate::state::{Market, Position};
use anchor_lang::prelude::*;
use pyth_solana_receiver_sdk::price_update::PriceUpdateV2;

pub struct MarketPrices {
    pub collateral: OraclePrice,
    pub loan: OraclePrice,
}

pub fn load_prices(
    market: &Market,
    collateral_update: &PriceUpdateV2,
    loan_update: &PriceUpdateV2,
    clock: &Clock,
) -> Result<MarketPrices> {
    let max_age = market.config.max_price_age_secs;
    Ok(MarketPrices {
        collateral: oracle::load_price(
            collateral_update,
            &market.collateral_feed_id,
            max_age,
            clock,
        )?,
        loan: oracle::load_price(loan_update, &market.loan_feed_id, max_age, clock)?,
    })
}

/// USD valuation of a position at current oracle prices.
pub struct RiskSnapshot {
    pub debt: u64,
    pub collateral_value: u128,
    pub debt_value: u128,
}

impl RiskSnapshot {
    pub fn new(market: &Market, position: &Position, prices: &MarketPrices) -> Result<Self> {
        let debt = position.debt(market)?;
        Self::with_debt(market, position.collateral_amount, debt, prices)
    }

    pub fn with_debt(
        market: &Market,
        collateral_amount: u64,
        debt: u64,
        prices: &MarketPrices,
    ) -> Result<Self> {
        Ok(Self {
            debt,
            collateral_value: math::usd_value_wad(
                collateral_amount,
                market.collateral_decimals,
                prices.collateral.price,
                prices.collateral.expo,
            )?,
            debt_value: math::usd_value_wad(
                debt,
                market.loan_decimals,
                prices.loan.price,
                prices.loan.expo,
            )?,
        })
    }

    pub fn within_ltv(&self, market: &Market) -> Result<bool> {
        math::within_limit(
            self.collateral_value,
            self.debt_value,
            market.config.ltv_bps as u64,
        )
    }

    pub fn is_liquidatable(&self, market: &Market) -> Result<bool> {
        Ok(self.debt > 0
            && !math::within_limit(
                self.collateral_value,
                self.debt_value,
                market.config.liquidation_threshold_bps as u64,
            )?)
    }
}
