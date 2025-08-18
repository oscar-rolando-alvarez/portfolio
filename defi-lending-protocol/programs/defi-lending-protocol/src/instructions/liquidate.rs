use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, Token, TokenAccount, Transfer, Burn};
use crate::constants::*;
use crate::errors::LendingError;
use crate::state::{Protocol, Pool, UserObligation, InterestRateMode};
use crate::utils::{TokenUtils, OracleUtils, calculate_liquidation_amounts, calculate_health_factor};

#[derive(Accounts)]
pub struct Liquidate<'info> {
    #[account(
        seeds = [PROTOCOL_SEED],
        bump = protocol.bump,
        constraint = !protocol.is_paused() @ LendingError::PoolPaused
    )]
    pub protocol: Account<'info, Protocol>,
    
    /// Collateral pool (where we seize collateral)
    #[account(
        mut,
        seeds = [POOL_SEED, collateral_pool.asset_mint.as_ref()],
        bump = collateral_pool.bump,
        constraint = collateral_pool.is_active() @ LendingError::PoolPaused
    )]
    pub collateral_pool: Account<'info, Pool>,
    
    /// Debt pool (where we repay debt)
    #[account(
        mut,
        seeds = [POOL_SEED, debt_pool.asset_mint.as_ref()],
        bump = debt_pool.bump,
        constraint = debt_pool.is_active() @ LendingError::PoolPaused
    )]
    pub debt_pool: Account<'info, Pool>,
    
    #[account(
        mut,
        seeds = [USER_OBLIGATION_SEED, borrower.key().as_ref(), protocol.key().as_ref()],
        bump = user_obligation.bump,
        constraint = user_obligation.is_liquidatable() @ LendingError::HealthyPosition
    )]
    pub user_obligation: Account<'info, UserObligation>,
    
    /// Liquidator pays with this account (debt token)
    #[account(
        mut,
        token::mint = debt_pool.asset_mint,
        token::authority = liquidator
    )]
    pub liquidator_debt_account: Account<'info, TokenAccount>,
    
    /// Liquidator receives collateral in this account
    #[account(
        mut,
        token::mint = collateral_pool.asset_mint,
        token::authority = liquidator
    )]
    pub liquidator_collateral_account: Account<'info, TokenAccount>,
    
    /// Borrower's aToken account (collateral to be seized)
    #[account(
        mut,
        token::mint = collateral_pool.a_token_mint,
        token::authority = borrower
    )]
    pub borrower_a_token_account: Account<'info, TokenAccount>,
    
    /// Borrower's debt token account
    #[account(
        mut,
        token::mint = debt_pool.variable_debt_token_mint,
        token::authority = borrower
    )]
    pub borrower_debt_token_account: Account<'info, TokenAccount>,
    
    /// Debt pool's asset account
    #[account(
        mut,
        address = debt_pool.asset_token_account
    )]
    pub debt_pool_asset_account: Account<'info, TokenAccount>,
    
    /// Collateral pool's asset account
    #[account(
        mut,
        address = collateral_pool.asset_token_account
    )]
    pub collateral_pool_asset_account: Account<'info, TokenAccount>,
    
    #[account(
        mut,
        address = collateral_pool.a_token_mint
    )]
    pub a_token_mint: Account<'info, Mint>,
    
    #[account(
        mut,
        address = debt_pool.variable_debt_token_mint
    )]
    pub debt_token_mint: Account<'info, Mint>,
    
    /// CHECK: Pool authority for collateral pool
    #[account(
        seeds = [POOL_SEED, collateral_pool.asset_mint.as_ref(), b"authority"],
        bump
    )]
    pub collateral_pool_authority: UncheckedAccount<'info>,
    
    /// CHECK: Pool authority for debt pool
    #[account(
        seeds = [POOL_SEED, debt_pool.asset_mint.as_ref(), b"authority"],
        bump
    )]
    pub debt_pool_authority: UncheckedAccount<'info>,
    
    /// Collateral price oracle
    /// CHECK: Validated during price fetch
    #[account(address = collateral_pool.oracle_price_feed)]
    pub collateral_oracle: UncheckedAccount<'info>,
    
    /// Debt price oracle
    /// CHECK: Validated during price fetch
    #[account(address = debt_pool.oracle_price_feed)]
    pub debt_oracle: UncheckedAccount<'info>,
    
    /// The borrower being liquidated
    /// CHECK: Must match user obligation
    pub borrower: UncheckedAccount<'info>,
    
    #[account(mut)]
    pub liquidator: Signer<'info>,
    
    pub token_program: Program<'info, Token>,
}

pub fn liquidate(
    ctx: Context<Liquidate>,
    debt_to_cover: u64,
    receive_a_token: bool,
) -> Result<()> {
    if debt_to_cover == 0 {
        return Err(LendingError::InvalidAmount.into());
    }

    let collateral_pool = &mut ctx.accounts.collateral_pool;
    let debt_pool = &mut ctx.accounts.debt_pool;
    let user_obligation = &mut ctx.accounts.user_obligation;
    
    // Update both pools
    collateral_pool.update_indexes()?;
    debt_pool.update_indexes()?;
    
    // Get oracle prices
    let collateral_price = OracleUtils::get_pyth_price(
        &ctx.accounts.collateral_oracle.to_account_info(),
        MAX_PRICE_AGE,
        ORACLE_CONFIDENCE_THRESHOLD,
    )?;
    
    let debt_price = OracleUtils::get_pyth_price(
        &ctx.accounts.debt_oracle.to_account_info(),
        MAX_PRICE_AGE,
        ORACLE_CONFIDENCE_THRESHOLD,
    )?;
    
    // Calculate current health factor
    let health_factor = calculate_health_factor(
        user_obligation.total_collateral_value,
        user_obligation.total_debt_value,
        collateral_pool.reserve_config.liquidation_threshold,
    )?;
    
    if health_factor >= BASIS_POINTS {
        return Err(LendingError::HealthyPosition.into());
    }
    
    // Calculate maximum debt that can be liquidated (typically 50% of total debt)
    let max_liquidation_amount = user_obligation.total_debt_value / 2;
    let debt_to_cover_usd = TokenUtils::calculate_usd_value(
        debt_to_cover,
        debt_price.price,
        ctx.accounts.debt_pool_asset_account.mint.as_ref().decimals,
    )?;
    
    if debt_to_cover_usd > max_liquidation_amount {
        return Err(LendingError::InvalidLiquidationAmount.into());
    }
    
    // Calculate collateral to seize
    let (collateral_amount, liquidation_bonus) = calculate_liquidation_amounts(
        debt_to_cover,
        debt_price.price,
        collateral_price.price,
        collateral_pool.reserve_config.liquidation_bonus,
    )?;
    
    // Calculate debt tokens to burn
    let debt_tokens_to_burn = TokenUtils::calculate_debt_token_amount(
        debt_to_cover,
        debt_pool.variable_borrow_index,
    )?;
    
    // Check liquidator has enough debt tokens
    TokenUtils::check_sufficient_balance(
        &ctx.accounts.liquidator_debt_account,
        debt_to_cover,
    )?;
    
    // Check borrower has enough collateral
    let a_tokens_to_burn = if receive_a_token {
        TokenUtils::calculate_a_token_amount(collateral_amount, collateral_pool.liquidity_index)?
    } else {
        0
    };
    
    let collateral_to_transfer = if receive_a_token {
        0
    } else {
        collateral_amount
    };
    
    // Step 1: Transfer debt tokens from liquidator to pool
    TokenUtils::transfer_tokens(
        &ctx.accounts.token_program,
        &ctx.accounts.liquidator_debt_account,
        &ctx.accounts.debt_pool_asset_account,
        &ctx.accounts.liquidator.to_account_info(),
        debt_to_cover,
        &[],
    )?;
    
    // Step 2: Burn borrower's debt tokens
    let debt_pool_seeds = &[
        POOL_SEED,
        debt_pool.asset_mint.as_ref(),
        b"authority",
        &[ctx.bumps.debt_pool_authority],
    ];
    let debt_signer_seeds = &[&debt_pool_seeds[..]];
    
    TokenUtils::burn_tokens(
        &ctx.accounts.token_program,
        &ctx.accounts.debt_token_mint,
        &ctx.accounts.borrower_debt_token_account,
        &ctx.accounts.debt_pool_authority.to_account_info(),
        debt_tokens_to_burn,
        debt_signer_seeds,
    )?;
    
    // Step 3: Handle collateral transfer
    let collateral_pool_seeds = &[
        POOL_SEED,
        collateral_pool.asset_mint.as_ref(),
        b"authority",
        &[ctx.bumps.collateral_pool_authority],
    ];
    let collateral_signer_seeds = &[&collateral_pool_seeds[..]];
    
    if receive_a_token {
        // Transfer aTokens from borrower to liquidator
        TokenUtils::transfer_tokens(
            &ctx.accounts.token_program,
            &ctx.accounts.borrower_a_token_account,
            &ctx.accounts.liquidator_collateral_account,
            &ctx.accounts.collateral_pool_authority.to_account_info(),
            a_tokens_to_burn,
            collateral_signer_seeds,
        )?;
    } else {
        // Burn borrower's aTokens and transfer underlying to liquidator
        TokenUtils::burn_tokens(
            &ctx.accounts.token_program,
            &ctx.accounts.a_token_mint,
            &ctx.accounts.borrower_a_token_account,
            &ctx.accounts.collateral_pool_authority.to_account_info(),
            a_tokens_to_burn,
            collateral_signer_seeds,
        )?;
        
        TokenUtils::transfer_tokens(
            &ctx.accounts.token_program,
            &ctx.accounts.collateral_pool_asset_account,
            &ctx.accounts.liquidator_collateral_account,
            &ctx.accounts.collateral_pool_authority.to_account_info(),
            collateral_to_transfer,
            collateral_signer_seeds,
        )?;
    }
    
    // Update pool states
    debt_pool.total_variable_borrows = debt_pool.total_variable_borrows
        .checked_sub(debt_tokens_to_burn)
        .ok_or(LendingError::MathOverflow)?;
    
    debt_pool.available_liquidity = debt_pool.available_liquidity
        .checked_add(debt_to_cover)
        .ok_or(LendingError::MathOverflow)?;
    
    if !receive_a_token {
        collateral_pool.total_supply = collateral_pool.total_supply
            .checked_sub(a_tokens_to_burn)
            .ok_or(LendingError::MathOverflow)?;
        
        collateral_pool.available_liquidity = collateral_pool.available_liquidity
            .checked_sub(collateral_to_transfer)
            .ok_or(LendingError::MathOverflow)?;
    }
    
    // Update user obligation
    user_obligation.remove_borrow(
        debt_pool.key(),
        debt_to_cover,
        InterestRateMode::Variable,
    )?;
    
    if !receive_a_token {
        user_obligation.remove_deposit(collateral_pool.key(), a_tokens_to_burn)?;
    }
    
    // Recalculate user's total debt and collateral values
    let new_debt_value = user_obligation.total_debt_value
        .checked_sub(debt_to_cover_usd)
        .unwrap_or(0);
    
    let collateral_value_seized = TokenUtils::calculate_usd_value(
        collateral_amount,
        collateral_price.price,
        ctx.accounts.collateral_pool_asset_account.mint.as_ref().decimals,
    )?;
    
    let new_collateral_value = user_obligation.total_collateral_value
        .checked_sub(collateral_value_seized)
        .unwrap_or(0);
    
    user_obligation.update_totals(new_collateral_value, new_debt_value);
    
    // Recalculate health factor
    let new_health_factor = calculate_health_factor(
        new_collateral_value,
        new_debt_value,
        collateral_pool.reserve_config.liquidation_threshold,
    )?;
    
    user_obligation.health_factor = new_health_factor;
    
    // Update interest rates
    debt_pool.calculate_interest_rates()?;
    collateral_pool.calculate_interest_rates()?;
    
    msg!(
        "Liquidation completed: liquidator={}, borrower={}, debt_covered={}, collateral_seized={}, bonus={}",
        ctx.accounts.liquidator.key(),
        ctx.accounts.borrower.key(),
        debt_to_cover,
        collateral_amount,
        liquidation_bonus
    );

    Ok(())
}