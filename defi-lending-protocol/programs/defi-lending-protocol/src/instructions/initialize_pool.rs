use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, Token, TokenAccount};
use crate::constants::*;
use crate::errors::LendingError;
use crate::state::{Protocol, Pool, ReserveConfig, InterestRateStrategy, YieldFarmingInfo};

#[derive(Accounts)]
#[instruction(asset_mint: Pubkey)]
pub struct InitializePool<'info> {
    #[account(
        mut,
        seeds = [PROTOCOL_SEED],
        bump = protocol.bump,
        has_one = admin @ LendingError::Unauthorized
    )]
    pub protocol: Account<'info, Protocol>,
    
    #[account(
        init,
        payer = admin,
        space = Pool::LEN,
        seeds = [POOL_SEED, asset_mint.as_ref()],
        bump
    )]
    pub pool: Account<'info, Pool>,
    
    /// CHECK: Validated in constraint
    #[account(address = asset_mint)]
    pub asset_mint: Account<'info, Mint>,
    
    #[account(
        init,
        payer = admin,
        token::mint = asset_mint,
        token::authority = pool_authority,
        seeds = [POOL_SEED, asset_mint.as_ref(), b"reserve"],
        bump
    )]
    pub asset_token_account: Account<'info, TokenAccount>,
    
    #[account(
        init,
        payer = admin,
        mint::decimals = asset_mint.decimals,
        mint::authority = pool_authority,
        seeds = [POOL_SEED, asset_mint.as_ref(), b"atoken"],
        bump
    )]
    pub a_token_mint: Account<'info, Mint>,
    
    #[account(
        init,
        payer = admin,
        mint::decimals = asset_mint.decimals,
        mint::authority = pool_authority,
        seeds = [POOL_SEED, asset_mint.as_ref(), b"stable_debt"],
        bump
    )]
    pub stable_debt_token_mint: Account<'info, Mint>,
    
    #[account(
        init,
        payer = admin,
        mint::decimals = asset_mint.decimals,
        mint::authority = pool_authority,
        seeds = [POOL_SEED, asset_mint.as_ref(), b"variable_debt"],
        bump
    )]
    pub variable_debt_token_mint: Account<'info, Mint>,
    
    /// CHECK: PDA authority for the pool
    #[account(
        seeds = [POOL_SEED, asset_mint.as_ref(), b"authority"],
        bump
    )]
    pub pool_authority: UncheckedAccount<'info>,
    
    /// Pyth or Switchboard price feed account
    /// CHECK: Validated during oracle price updates
    pub oracle_price_feed: UncheckedAccount<'info>,
    
    #[account(mut)]
    pub admin: Signer<'info>,
    
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

pub fn initialize_pool(
    ctx: Context<InitializePool>,
    asset_mint: Pubkey,
    collateral_factor: u64,
    reserve_factor: u64,
    liquidation_threshold: u64,
    liquidation_bonus: u64,
) -> Result<()> {
    // Validate parameters
    if collateral_factor > MAX_COLLATERAL_FACTOR || collateral_factor < MIN_COLLATERAL_FACTOR {
        return Err(LendingError::InvalidCollateralFactor.into());
    }
    
    if liquidation_threshold > MAX_LIQUIDATION_THRESHOLD || liquidation_threshold < MIN_LIQUIDATION_THRESHOLD {
        return Err(LendingError::InvalidLiquidationThreshold.into());
    }
    
    if liquidation_bonus > MAX_LIQUIDATION_BONUS || liquidation_bonus < MIN_LIQUIDATION_BONUS {
        return Err(LendingError::InvalidLiquidationBonus.into());
    }

    if reserve_factor > MAX_FEE_RATE {
        return Err(LendingError::ReserveFactorTooHigh.into());
    }

    let pool = &mut ctx.accounts.pool;
    let protocol = &mut ctx.accounts.protocol;
    let clock = Clock::get()?;

    // Initialize pool state
    pool.authority = ctx.accounts.pool_authority.key();
    pool.asset_mint = asset_mint;
    pool.asset_token_account = ctx.accounts.asset_token_account.key();
    pool.a_token_mint = ctx.accounts.a_token_mint.key();
    pool.stable_debt_token_mint = ctx.accounts.stable_debt_token_mint.key();
    pool.variable_debt_token_mint = ctx.accounts.variable_debt_token_mint.key();
    pool.oracle_price_feed = ctx.accounts.oracle_price_feed.key();
    
    // Initialize amounts
    pool.total_supply = 0;
    pool.total_stable_borrows = 0;
    pool.total_variable_borrows = 0;
    pool.available_liquidity = 0;
    
    // Initialize rates
    pool.liquidity_rate = 0;
    pool.variable_borrow_rate = 0;
    pool.stable_borrow_rate = 0;
    
    // Initialize indexes at RAY (1.0)
    pool.liquidity_index = RAY;
    pool.variable_borrow_index = RAY;
    
    // Configure reserve parameters
    pool.reserve_config = ReserveConfig {
        ltv: collateral_factor,
        liquidation_threshold,
        liquidation_bonus,
        reserve_factor,
        borrowing_enabled: true,
        stable_borrowing_enabled: true,
    };
    
    // Set default interest rate strategy
    pool.interest_rate_strategy = InterestRateStrategy::default();
    
    // Initialize yield farming
    pool.yield_farming_info = YieldFarmingInfo {
        total_rewards: 0,
        reward_rate: 0,
        last_update_time: clock.unix_timestamp,
        reward_per_token_stored: 0,
    };
    
    pool.last_update_timestamp = clock.unix_timestamp;
    pool.active = true;
    pool.frozen = false;
    pool.paused = false;
    pool.bump = ctx.bumps.pool;

    // Update protocol state
    protocol.total_pools = protocol.total_pools
        .checked_add(1)
        .ok_or(LendingError::MathOverflow)?;
    protocol.last_update_time = clock.unix_timestamp;

    msg!(
        "Pool initialized for asset: {}, collateral_factor: {} bps, liquidation_threshold: {} bps",
        asset_mint,
        collateral_factor,
        liquidation_threshold
    );

    Ok(())
}