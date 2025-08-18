use anchor_lang::prelude::*;
use anchor_spl::token::{Token, TokenAccount, Transfer};
use crate::constants::*;
use crate::state::{Protocol, GovernanceStake};
use crate::utils::TokenUtils;

#[derive(Accounts)]
pub struct StakeGovernanceTokens<'info> {
    #[account(
        seeds = [PROTOCOL_SEED],
        bump = protocol.bump
    )]
    pub protocol: Account<'info, Protocol>,
    
    #[account(
        init_if_needed,
        payer = user,
        space = GovernanceStake::LEN,
        seeds = [GOVERNANCE_SEED, user.key().as_ref()],
        bump
    )]
    pub governance_stake: Account<'info, GovernanceStake>,
    
    #[account(
        mut,
        token::authority = user
    )]
    pub user_governance_tokens: Account<'info, TokenAccount>,
    
    #[account(mut)]
    pub governance_vault: Account<'info, TokenAccount>,
    
    #[account(mut)]
    pub user: Signer<'info>,
    
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

pub fn stake_governance_tokens(ctx: Context<StakeGovernanceTokens>, amount: u64) -> Result<()> {
    let governance_stake = &mut ctx.accounts.governance_stake;
    let clock = Clock::get()?;
    
    // Transfer tokens to governance vault
    TokenUtils::transfer_tokens(
        &ctx.accounts.token_program,
        &ctx.accounts.user_governance_tokens,
        &ctx.accounts.governance_vault,
        &ctx.accounts.user.to_account_info(),
        amount,
        &[],
    )?;
    
    // Update stake record
    governance_stake.user = ctx.accounts.user.key();
    governance_stake.staked_amount = governance_stake.staked_amount
        .checked_add(amount)
        .unwrap();
    governance_stake.stake_timestamp = clock.unix_timestamp;
    governance_stake.lock_end = clock.unix_timestamp + (30 * 24 * 60 * 60); // 30 days
    governance_stake.voting_power_multiplier = 100; // 1x multiplier
    governance_stake.bump = ctx.bumps.governance_stake;
    
    msg!("Staked {} governance tokens for user {}", amount, ctx.accounts.user.key());
    
    Ok(())
}