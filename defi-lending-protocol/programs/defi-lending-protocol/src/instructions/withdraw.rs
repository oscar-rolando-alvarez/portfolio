use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, Token, TokenAccount, Transfer, Burn};
use crate::constants::*;
use crate::errors::LendingError;
use crate::state::{Protocol, Pool, UserObligation};
use crate::utils::{TokenUtils, calculate_health_factor};

#[derive(Accounts)]
pub struct Withdraw<'info> {
    #[account(
        seeds = [PROTOCOL_SEED],
        bump = protocol.bump,
        constraint = !protocol.is_paused() @ LendingError::PoolPaused
    )]
    pub protocol: Account<'info, Protocol>,
    
    #[account(
        mut,
        seeds = [POOL_SEED, pool.asset_mint.as_ref()],
        bump = pool.bump,
        constraint = pool.is_active() @ LendingError::PoolPaused
    )]
    pub pool: Account<'info, Pool>,
    
    #[account(
        mut,
        seeds = [USER_OBLIGATION_SEED, user.key().as_ref(), protocol.key().as_ref()],
        bump = user_obligation.bump
    )]
    pub user_obligation: Account<'info, UserObligation>,
    
    #[account(
        mut,
        token::mint = pool.a_token_mint,
        token::authority = user
    )]
    pub user_a_token_account: Account<'info, TokenAccount>,
    
    #[account(
        mut,
        address = pool.asset_token_account
    )]
    pub pool_asset_account: Account<'info, TokenAccount>,
    
    #[account(
        mut,
        token::mint = pool.asset_mint,
        token::authority = user
    )]
    pub user_asset_account: Account<'info, TokenAccount>,
    
    #[account(
        mut,
        address = pool.a_token_mint
    )]
    pub a_token_mint: Account<'info, Mint>,
    
    /// CHECK: PDA authority for the pool
    #[account(
        seeds = [POOL_SEED, pool.asset_mint.as_ref(), b"authority"],
        bump
    )]
    pub pool_authority: UncheckedAccount<'info>,
    
    #[account(mut)]
    pub user: Signer<'info>,
    
    pub token_program: Program<'info, Token>,
}

pub fn withdraw(ctx: Context<Withdraw>, amount: u64) -> Result<()> {
    if amount == 0 {
        return Err(LendingError::InvalidAmount.into());
    }

    let pool = &mut ctx.accounts.pool;
    let user_obligation = &mut ctx.accounts.user_obligation;
    
    // Update pool interest rates and indexes
    pool.update_indexes()?;
    
    // Calculate underlying amount to withdraw
    let underlying_amount = TokenUtils::calculate_underlying_amount(amount, pool.liquidity_index)?;
    
    // Check if pool has enough liquidity
    if pool.available_liquidity < underlying_amount {
        return Err(LendingError::InsufficientLiquidity.into());
    }
    
    // Check user has enough aTokens
    TokenUtils::check_sufficient_balance(&ctx.accounts.user_a_token_account, amount)?;
    
    // Check health factor after withdrawal (if user has borrows)
    if user_obligation.total_debt_value > 0 {
        // Calculate new collateral value after withdrawal
        let withdrawal_value_usd = TokenUtils::calculate_usd_value(
            underlying_amount,
            // Would need oracle price here in real implementation
            100_000_000, // Placeholder price
            ctx.accounts.pool_asset_account.mint.as_ref().decimals,
        )?;
        
        let new_collateral_value = user_obligation.total_collateral_value
            .checked_sub(withdrawal_value_usd)
            .unwrap_or(0);
        
        let health_factor = calculate_health_factor(
            new_collateral_value,
            user_obligation.total_debt_value,
            pool.reserve_config.liquidation_threshold,
        )?;
        
        if health_factor < BASIS_POINTS {
            return Err(LendingError::HealthFactorTooLow.into());
        }
    }
    
    // Burn user's aTokens
    TokenUtils::burn_tokens(
        &ctx.accounts.token_program,
        &ctx.accounts.a_token_mint,
        &ctx.accounts.user_a_token_account,
        &ctx.accounts.user.to_account_info(),
        amount,
        &[],
    )?;
    
    // Transfer underlying tokens to user
    let pool_seeds = &[
        POOL_SEED,
        pool.asset_mint.as_ref(),
        b"authority",
        &[ctx.bumps.pool_authority],
    ];
    let signer_seeds = &[&pool_seeds[..]];
    
    TokenUtils::transfer_tokens(
        &ctx.accounts.token_program,
        &ctx.accounts.pool_asset_account,
        &ctx.accounts.user_asset_account,
        &ctx.accounts.pool_authority.to_account_info(),
        underlying_amount,
        signer_seeds,
    )?;
    
    // Update pool state
    pool.total_supply = pool.total_supply
        .checked_sub(amount)
        .ok_or(LendingError::MathOverflow)?;
    
    pool.available_liquidity = pool.available_liquidity
        .checked_sub(underlying_amount)
        .ok_or(LendingError::MathOverflow)?;
    
    // Update user obligation
    user_obligation.remove_deposit(pool.key(), amount)?;
    
    // Recalculate interest rates
    pool.calculate_interest_rates()?;
    
    msg!(
        "User {} withdrew {} underlying tokens by burning {} aTokens",
        ctx.accounts.user.key(),
        underlying_amount,
        amount
    );

    Ok(())
}