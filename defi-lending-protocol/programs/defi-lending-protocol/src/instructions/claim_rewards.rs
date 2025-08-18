use anchor_lang::prelude::*;
use anchor_spl::token::{Token, TokenAccount, Transfer};
use crate::constants::*;
use crate::errors::LendingError;
use crate::state::{Protocol, Pool, UserObligation, UserRewards, PoolRewards};
use crate::utils::TokenUtils;

#[derive(Accounts)]
pub struct ClaimRewards<'info> {
    #[account(
        seeds = [PROTOCOL_SEED],
        bump = protocol.bump
    )]
    pub protocol: Account<'info, Protocol>,
    
    #[account(
        mut,
        seeds = [POOL_SEED, pool.asset_mint.as_ref()],
        bump = pool.bump
    )]
    pub pool: Account<'info, Pool>,
    
    #[account(
        seeds = [USER_OBLIGATION_SEED, user.key().as_ref(), protocol.key().as_ref()],
        bump = user_obligation.bump
    )]
    pub user_obligation: Account<'info, UserObligation>,
    
    #[account(
        mut,
        seeds = [REWARDS_SEED, pool.key().as_ref()],
        bump
    )]
    pub pool_rewards: Account<'info, PoolRewards>,
    
    #[account(
        mut,
        seeds = [REWARDS_SEED, user.key().as_ref(), pool.key().as_ref()],
        bump
    )]
    pub user_rewards: Account<'info, UserRewards>,
    
    #[account(
        mut,
        token::mint = protocol.treasury, // Rewards token mint
        token::authority = user
    )]
    pub user_rewards_account: Account<'info, TokenAccount>,
    
    #[account(
        mut
        // Rewards vault managed by protocol
    )]
    pub rewards_vault: Account<'info, TokenAccount>,
    
    /// CHECK: PDA authority for rewards
    #[account(
        seeds = [REWARDS_SEED, b"authority"],
        bump
    )]
    pub rewards_authority: UncheckedAccount<'info>,
    
    #[account(mut)]
    pub user: Signer<'info>,
    
    pub token_program: Program<'info, Token>,
}

pub fn claim_rewards(ctx: Context<ClaimRewards>) -> Result<()> {
    let pool_rewards = &mut ctx.accounts.pool_rewards;
    let user_rewards = &mut ctx.accounts.user_rewards;
    let clock = Clock::get()?;
    
    // Update pool rewards state
    pool_rewards.update_rewards_per_point(clock.unix_timestamp, pool_rewards.rewards_per_second);
    
    // Calculate total pending rewards
    let total_pending = user_rewards.get_total_pending_rewards(
        pool_rewards.supply_rewards_per_point_stored,
        pool_rewards.borrow_rewards_per_point_stored,
    );
    
    if total_pending == 0 {
        return Err(LendingError::InvalidAmount.into());
    }
    
    // Update user rewards state
    user_rewards.update_user_rewards(
        user_rewards.user_supply_points,
        user_rewards.user_borrow_points,
        pool_rewards.supply_rewards_per_point_stored,
        pool_rewards.borrow_rewards_per_point_stored,
    );
    
    // Claim all pending rewards
    user_rewards.claim_rewards(total_pending)?;
    
    // Transfer rewards from vault to user
    let rewards_seeds = &[
        REWARDS_SEED,
        b"authority",
        &[ctx.bumps.rewards_authority],
    ];
    let signer_seeds = &[&rewards_seeds[..]];
    
    TokenUtils::transfer_tokens(
        &ctx.accounts.token_program,
        &ctx.accounts.rewards_vault,
        &ctx.accounts.user_rewards_account,
        &ctx.accounts.rewards_authority.to_account_info(),
        total_pending,
        signer_seeds,
    )?;
    
    msg!(
        "User {} claimed {} rewards tokens",
        ctx.accounts.user.key(),
        total_pending
    );

    Ok(())
}