use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, Token, TokenAccount, Transfer, MintTo};
use crate::constants::*;
use crate::errors::LendingError;
use crate::state::{Protocol, Pool, UserObligation, InterestRateMode};
use crate::utils::{TokenUtils, MathUtils, OracleUtils, calculate_health_factor};

#[derive(Accounts)]
pub struct Borrow<'info> {
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
        constraint = pool.is_active() @ LendingError::PoolPaused,
        constraint = pool.reserve_config.borrowing_enabled @ LendingError::BorrowNotAllowed
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
    
    /// Price oracle account
    /// CHECK: Validated during price fetch
    #[account(address = pool.oracle_price_feed)]
    pub oracle_price_feed: UncheckedAccount<'info>,
    
    #[account(mut)]
    pub user: Signer<'info>,
    
    pub token_program: Program<'info, Token>,
}

pub fn borrow(ctx: Context<Borrow>, amount: u64) -> Result<()> {
    if amount == 0 {
        return Err(LendingError::InvalidAmount.into());
    }

    let pool = &mut ctx.accounts.pool;
    let user_obligation = &mut ctx.accounts.user_obligation;
    
    // Check available liquidity
    if pool.available_liquidity < amount {
        return Err(LendingError::InsufficientLiquidity.into());
    }
    
    // Update pool interest rates and indexes
    pool.update_indexes()?;
    pool.calculate_interest_rates()?;
    
    // Get current price from oracle
    let price_data = OracleUtils::get_pyth_price(
        &ctx.accounts.oracle_price_feed.to_account_info(),
        MAX_PRICE_AGE,
        ORACLE_CONFIDENCE_THRESHOLD,
    )?;
    
    // Calculate debt token amount to mint
    let debt_token_amount = TokenUtils::calculate_debt_token_amount(amount, pool.variable_borrow_index)?;
    
    // Check borrowing capacity
    let new_debt_value = user_obligation.total_debt_value
        .checked_add(
            TokenUtils::calculate_usd_value(
                amount, 
                price_data.price, 
                ctx.accounts.pool_asset_account.mint.as_ref().decimals
            )?
        )
        .ok_or(LendingError::MathOverflow)?;
    
    let max_borrow = MathUtils::percentage_of(
        user_obligation.total_collateral_value,
        pool.reserve_config.ltv,
    )?;
    
    if new_debt_value > max_borrow {
        return Err(LendingError::InsufficientCollateral.into());
    }
    
    // Calculate health factor after borrowing
    let health_factor = calculate_health_factor(
        user_obligation.total_collateral_value,
        new_debt_value,
        pool.reserve_config.liquidation_threshold,
    )?;
    
    if health_factor < BASIS_POINTS {
        return Err(LendingError::HealthFactorTooLow.into());
    }
    
    // Transfer tokens from pool to user
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
        amount,
        signer_seeds,
    )?;
    
    // Mint debt tokens to user
    TokenUtils::mint_tokens(
        &ctx.accounts.token_program,
        &ctx.accounts.debt_token_mint,
        &ctx.accounts.user_debt_token_account,
        &ctx.accounts.pool_authority.to_account_info(),
        debt_token_amount,
        signer_seeds,
    )?;
    
    // Update pool state
    pool.total_variable_borrows = pool.total_variable_borrows
        .checked_add(debt_token_amount)
        .ok_or(LendingError::MathOverflow)?;
    
    pool.available_liquidity = pool.available_liquidity
        .checked_sub(amount)
        .ok_or(LendingError::MathOverflow)?;
    
    // Update user obligation
    user_obligation.add_borrow(
        pool.key(),
        amount,
        InterestRateMode::Variable,
        pool.variable_borrow_rate,
    )?;
    
    user_obligation.total_debt_value = new_debt_value;
    user_obligation.health_factor = health_factor;
    
    // Recalculate interest rates after borrow
    pool.calculate_interest_rates()?;
    
    msg!(
        "User {} borrowed {} tokens, minted {} debt tokens for pool {}",
        ctx.accounts.user.key(),
        amount,
        debt_token_amount,
        pool.key()
    );

    Ok(())
}