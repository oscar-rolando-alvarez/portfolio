use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, Token, TokenAccount, Transfer, MintTo};
use crate::constants::*;
use crate::errors::LendingError;
use crate::state::{Protocol, Pool, UserObligation};
use crate::utils::{TokenUtils, MathUtils};

#[derive(Accounts)]
pub struct Supply<'info> {
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
        token::mint = pool.asset_mint,
        token::authority = user
    )]
    pub user_asset_account: Account<'info, TokenAccount>,
    
    #[account(
        mut,
        address = pool.asset_token_account
    )]
    pub pool_asset_account: Account<'info, TokenAccount>,
    
    #[account(
        mut,
        token::mint = pool.a_token_mint,
        token::authority = user
    )]
    pub user_a_token_account: Account<'info, TokenAccount>,
    
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

pub fn supply(ctx: Context<Supply>, amount: u64) -> Result<()> {
    if amount == 0 {
        return Err(LendingError::InvalidAmount.into());
    }

    let pool = &mut ctx.accounts.pool;
    let user_obligation = &mut ctx.accounts.user_obligation;
    
    // Update pool interest rates and indexes
    pool.update_indexes()?;
    pool.calculate_interest_rates()?;
    
    // Calculate aToken amount to mint
    let a_token_amount = TokenUtils::calculate_a_token_amount(amount, pool.liquidity_index)?;
    
    // Transfer underlying tokens from user to pool
    TokenUtils::transfer_tokens(
        &ctx.accounts.token_program,
        &ctx.accounts.user_asset_account,
        &ctx.accounts.pool_asset_account,
        &ctx.accounts.user.to_account_info(),
        amount,
        &[],
    )?;
    
    // Mint aTokens to user
    let pool_seeds = &[
        POOL_SEED,
        pool.asset_mint.as_ref(),
        b"authority",
        &[ctx.bumps.pool_authority],
    ];
    let signer_seeds = &[&pool_seeds[..]];
    
    TokenUtils::mint_tokens(
        &ctx.accounts.token_program,
        &ctx.accounts.a_token_mint,
        &ctx.accounts.user_a_token_account,
        &ctx.accounts.pool_authority.to_account_info(),
        a_token_amount,
        signer_seeds,
    )?;
    
    // Update pool state
    pool.total_supply = pool.total_supply
        .checked_add(a_token_amount)
        .ok_or(LendingError::MathOverflow)?;
    
    pool.available_liquidity = pool.available_liquidity
        .checked_add(amount)
        .ok_or(LendingError::MathOverflow)?;
    
    // Update user obligation
    user_obligation.add_deposit(pool.key(), a_token_amount)?;
    
    // Recalculate interest rates after liquidity change
    pool.calculate_interest_rates()?;
    
    msg!(
        "User {} supplied {} tokens, received {} aTokens for pool {}",
        ctx.accounts.user.key(),
        amount,
        a_token_amount,
        pool.key()
    );

    Ok(())
}