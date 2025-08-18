use anchor_lang::prelude::*;
use crate::constants::*;
use crate::errors::LendingError;
use crate::state::Pool;
use crate::utils::OracleUtils;

#[derive(Accounts)]
pub struct UpdateOraclePrice<'info> {
    #[account(
        mut,
        seeds = [POOL_SEED, pool.asset_mint.as_ref()],
        bump = pool.bump
    )]
    pub pool: Account<'info, Pool>,
    
    /// Price oracle account
    /// CHECK: Validated during price fetch
    #[account(address = pool.oracle_price_feed)]
    pub oracle_price_feed: UncheckedAccount<'info>,
}

pub fn update_oracle_price(ctx: Context<UpdateOraclePrice>) -> Result<()> {
    let pool = &mut ctx.accounts.pool;
    
    // Fetch and validate current price
    let price_data = OracleUtils::get_pyth_price(
        &ctx.accounts.oracle_price_feed.to_account_info(),
        MAX_PRICE_AGE,
        ORACLE_CONFIDENCE_THRESHOLD,
    )?;
    
    // Validate price data
    OracleUtils::validate_price_data(
        &price_data,
        1, // Min price $0.01
        100_000_000_000, // Max price $1000
        ORACLE_CONFIDENCE_THRESHOLD,
    )?;
    
    msg!(
        "Oracle price updated for pool {}: price={}, confidence={}, timestamp={}",
        pool.key(),
        price_data.price,
        price_data.confidence,
        price_data.publish_time
    );

    Ok(())
}