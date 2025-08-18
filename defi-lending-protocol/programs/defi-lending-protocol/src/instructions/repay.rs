use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, Token, TokenAccount, Transfer, Burn};
use crate::constants::*;
use crate::errors::LendingError;
use crate::state::{Protocol, Pool, UserObligation, InterestRateMode};
use crate::utils::TokenUtils;

#[derive(Accounts)]
pub struct Repay<'info> {
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
        token::mint = pool.variable_debt_token_mint,
        token::authority = user
    )]
    pub user_debt_token_account: Account<'info, TokenAccount>,
    
    #[account(
        mut,
        address = pool.variable_debt_token_mint
    )]
    pub debt_token_mint: Account<'info, Mint>,
    
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

pub fn repay(ctx: Context<Repay>, amount: u64) -> Result<()> {
    if amount == 0 {
        return Err(LendingError::InvalidAmount.into());
    }

    let pool = &mut ctx.accounts.pool;
    let user_obligation = &mut ctx.accounts.user_obligation;
    
    // Update pool interest rates and indexes
    pool.update_indexes()?;
    
    // Calculate current debt from debt tokens
    let current_debt = TokenUtils::calculate_current_debt(
        ctx.accounts.user_debt_token_account.amount,
        pool.variable_borrow_index,
    )?;
    
    // Determine actual repay amount (can't repay more than owed)
    let repay_amount = amount.min(current_debt);
    
    // Calculate debt tokens to burn
    let debt_tokens_to_burn = TokenUtils::calculate_debt_token_amount(
        repay_amount,
        pool.variable_borrow_index,
    )?;
    
    // Check user has enough tokens to repay
    TokenUtils::check_sufficient_balance(&ctx.accounts.user_asset_account, repay_amount)?;
    
    // Transfer repayment from user to pool
    TokenUtils::transfer_tokens(
        &ctx.accounts.token_program,
        &ctx.accounts.user_asset_account,
        &ctx.accounts.pool_asset_account,
        &ctx.accounts.user.to_account_info(),
        repay_amount,
        &[],
    )?;
    
    // Burn user's debt tokens
    TokenUtils::burn_tokens(
        &ctx.accounts.token_program,
        &ctx.accounts.debt_token_mint,
        &ctx.accounts.user_debt_token_account,
        &ctx.accounts.user.to_account_info(),
        debt_tokens_to_burn,
        &[],
    )?;
    
    // Update pool state
    pool.total_variable_borrows = pool.total_variable_borrows
        .checked_sub(debt_tokens_to_burn)
        .ok_or(LendingError::MathOverflow)?;
    
    pool.available_liquidity = pool.available_liquidity
        .checked_add(repay_amount)
        .ok_or(LendingError::MathOverflow)?;
    
    // Update user obligation
    user_obligation.remove_borrow(pool.key(), repay_amount, InterestRateMode::Variable)?;
    
    // Update user's total debt value
    let repayment_value_usd = TokenUtils::calculate_usd_value(
        repay_amount,
        // Would need oracle price here in real implementation
        100_000_000, // Placeholder price
        ctx.accounts.pool_asset_account.mint.as_ref().decimals,
    )?;
    
    user_obligation.total_debt_value = user_obligation.total_debt_value
        .checked_sub(repayment_value_usd)
        .unwrap_or(0);
    
    // Recalculate interest rates
    pool.calculate_interest_rates()?;
    
    msg!(
        "User {} repaid {} tokens, burned {} debt tokens",
        ctx.accounts.user.key(),
        repay_amount,
        debt_tokens_to_burn
    );

    Ok(())
}