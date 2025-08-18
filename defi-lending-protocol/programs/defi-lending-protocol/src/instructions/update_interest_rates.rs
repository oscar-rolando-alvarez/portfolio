use anchor_lang::prelude::*;
use crate::constants::*;
use crate::state::{Pool};

#[derive(Accounts)]
pub struct UpdateInterestRates<'info> {
    #[account(
        mut,
        seeds = [POOL_SEED, pool.asset_mint.as_ref()],
        bump = pool.bump
    )]
    pub pool: Account<'info, Pool>,
}

pub fn update_interest_rates(ctx: Context<UpdateInterestRates>) -> Result<()> {
    let pool = &mut ctx.accounts.pool;
    
    // Update indexes first
    pool.update_indexes()?;
    
    // Calculate and update interest rates
    pool.calculate_interest_rates()?;
    
    msg!(
        "Interest rates updated for pool {}: liquidity_rate={}, variable_borrow_rate={}, stable_borrow_rate={}",
        pool.key(),
        pool.liquidity_rate,
        pool.variable_borrow_rate,
        pool.stable_borrow_rate
    );

    Ok(())
}