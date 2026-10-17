use crate::errors::GovernanceError;
use crate::state::*;
use anchor_lang::prelude::*;
use anchor_spl::token_interface::{self, Mint, TokenAccount, TokenInterface, TransferChecked};

#[derive(Accounts)]
pub struct CreateStakeAccount<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    #[account(
        init,
        payer = owner,
        space = 8 + StakeAccount::INIT_SPACE,
        seeds = [STAKE_SEED, owner.key().as_ref()],
        bump
    )]
    pub stake: Account<'info, StakeAccount>,
    pub system_program: Program<'info, System>,
}

pub fn handle_create_stake_account(ctx: Context<CreateStakeAccount>) -> Result<()> {
    let stake = &mut ctx.accounts.stake;
    stake.owner = ctx.accounts.owner.key();
    stake.amount = 0;
    stake.locked_until = 0;
    stake.bump = ctx.bumps.stake;
    Ok(())
}

#[derive(Accounts)]
pub struct Stake<'info> {
    pub owner: Signer<'info>,
    #[account(mut, seeds = [CONFIG_SEED], bump = config.bump, has_one = mint, has_one = vault)]
    pub config: Account<'info, GovernanceConfig>,
    #[account(mut, seeds = [STAKE_SEED, owner.key().as_ref()], bump = stake.bump, has_one = owner)]
    pub stake: Account<'info, StakeAccount>,
    pub mint: InterfaceAccount<'info, Mint>,
    #[account(mut)]
    pub vault: InterfaceAccount<'info, TokenAccount>,
    #[account(mut, token::mint = mint, token::authority = owner)]
    pub owner_token_account: InterfaceAccount<'info, TokenAccount>,
    pub token_program: Interface<'info, TokenInterface>,
}

pub fn handle_stake(ctx: Context<Stake>, amount: u64) -> Result<()> {
    require!(amount > 0, GovernanceError::ZeroAmount);
    let cpi = CpiContext::new(
        ctx.accounts.token_program.key(),
        TransferChecked {
            from: ctx.accounts.owner_token_account.to_account_info(),
            mint: ctx.accounts.mint.to_account_info(),
            to: ctx.accounts.vault.to_account_info(),
            authority: ctx.accounts.owner.to_account_info(),
        },
    );
    token_interface::transfer_checked(cpi, amount, ctx.accounts.mint.decimals)?;

    let stake = &mut ctx.accounts.stake;
    stake.amount = stake
        .amount
        .checked_add(amount)
        .ok_or(GovernanceError::MathOverflow)?;
    let config = &mut ctx.accounts.config;
    config.total_staked = config
        .total_staked
        .checked_add(amount)
        .ok_or(GovernanceError::MathOverflow)?;
    Ok(())
}

pub fn handle_unstake(ctx: Context<Stake>, amount: u64) -> Result<()> {
    require!(amount > 0, GovernanceError::ZeroAmount);
    let now = Clock::get()?.unix_timestamp;
    let stake = &mut ctx.accounts.stake;
    require!(now >= stake.locked_until, GovernanceError::StakeLocked);
    require!(amount <= stake.amount, GovernanceError::InsufficientStake);
    stake.amount -= amount;
    let config = &mut ctx.accounts.config;
    config.total_staked = config.total_staked.saturating_sub(amount);

    let bump = [config.bump];
    let seeds: &[&[u8]] = &[CONFIG_SEED, &bump];
    let signer = [seeds];
    let cpi = CpiContext::new_with_signer(
        ctx.accounts.token_program.key(),
        TransferChecked {
            from: ctx.accounts.vault.to_account_info(),
            mint: ctx.accounts.mint.to_account_info(),
            to: ctx.accounts.owner_token_account.to_account_info(),
            authority: config.to_account_info(),
        },
        &signer,
    );
    token_interface::transfer_checked(cpi, amount, ctx.accounts.mint.decimals)
}
