use anchor_lang::prelude::*;
use anchor_spl::token::{Token, TokenAccount, Transfer};
use crate::constants::*;
use crate::errors::LendingError;
use crate::state::{Protocol, GovernanceStake};
use crate::utils::TokenUtils;

#[derive(Accounts)]
pub struct UnstakeGovernanceTokens<'info> {
    #[account(
        seeds = [PROTOCOL_SEED],
        bump = protocol.bump
    )]
    pub protocol: Account<'info, Protocol>,
    
    #[account(
        mut,
        seeds = [GOVERNANCE_SEED, user.key().as_ref()],
        bump = governance_stake.bump
    )]
    pub governance_stake: Account<'info, GovernanceStake>,
    
    #[account(
        mut,
        token::authority = user
    )]
    pub user_governance_tokens: Account<'info, TokenAccount>,
    
    #[account(mut)]
    pub governance_vault: Account<'info, TokenAccount>,
    
    /// CHECK: Governance authority PDA
    #[account(
        seeds = [GOVERNANCE_SEED, b"authority"],
        bump
    )]
    pub governance_authority: UncheckedAccount<'info>,
    
    #[account(mut)]
    pub user: Signer<'info>,
    
    pub token_program: Program<'info, Token>,
}

pub fn unstake_governance_tokens(ctx: Context<UnstakeGovernanceTokens>, amount: u64) -> Result<()> {
    let governance_stake = &mut ctx.accounts.governance_stake;
    let clock = Clock::get()?;
    
    // Check if lock period has ended
    if !governance_stake.can_unstake(clock.unix_timestamp) {
        return Err(LendingError::StakingPeriodNotEnded.into());
    }
    
    // Check sufficient staked amount
    if governance_stake.staked_amount < amount {
        return Err(LendingError::InsufficientLiquidity.into());
    }
    
    // Transfer tokens back to user
    let governance_seeds = &[
        GOVERNANCE_SEED,
        b"authority",
        &[ctx.bumps.governance_authority],
    ];
    let signer_seeds = &[&governance_seeds[..]];
    
    TokenUtils::transfer_tokens(
        &ctx.accounts.token_program,
        &ctx.accounts.governance_vault,
        &ctx.accounts.user_governance_tokens,
        &ctx.accounts.governance_authority.to_account_info(),
        amount,
        signer_seeds,
    )?;
    
    // Update stake record
    governance_stake.staked_amount = governance_stake.staked_amount
        .checked_sub(amount)
        .unwrap();
    
    msg!("Unstaked {} governance tokens for user {}", amount, ctx.accounts.user.key());
    
    Ok(())
}