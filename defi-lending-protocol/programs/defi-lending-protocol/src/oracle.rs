//! Pyth pull-oracle integration (PriceUpdateV2 accounts posted by the Pyth
//! Solana Receiver). The account owner is checked by Anchor's `Account<T>`
//! wrapper; here we enforce the feed id, freshness, full Wormhole verification
//! and a maximum confidence interval.

use crate::constants::{BPS, MAX_ORACLE_CONFIDENCE_BPS};
use crate::errors::LendingError;
use anchor_lang::prelude::*;
use pyth_solana_receiver_sdk::price_update::PriceUpdateV2;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct OraclePrice {
    pub price: i64,
    pub expo: i32,
}

pub fn load_price(
    update: &PriceUpdateV2,
    feed_id: &[u8; 32],
    max_age_secs: u64,
    clock: &Clock,
) -> Result<OraclePrice> {
    let p = update
        .get_price_no_older_than(clock, max_age_secs, feed_id)
        .map_err(|_| error!(LendingError::InvalidOraclePrice))?;
    require!(p.price > 0, LendingError::NonPositivePrice);
    require!(
        (p.conf as u128) * (BPS as u128) <= (p.price as u128) * (MAX_ORACLE_CONFIDENCE_BPS as u128),
        LendingError::OracleConfidenceTooWide
    );
    Ok(OraclePrice {
        price: p.price,
        expo: p.exponent,
    })
}
