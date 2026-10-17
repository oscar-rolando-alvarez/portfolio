use crate::errors::GovernanceError;
use crate::state::*;
use anchor_lang::prelude::*;
use anchor_spl::token_interface::{self, Mint, MintTo, TokenAccount, TokenInterface};

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug)]
pub struct GovernanceParams {
    pub voting_period_secs: i64,
    pub quorum_votes: u64,
    pub proposal_threshold: u64,
}

impl GovernanceParams {
    pub fn validate(&self) -> Result<()> {
        require!(
            (MIN_VOTING_PERIOD_SECS..=MAX_VOTING_PERIOD_SECS).contains(&self.voting_period_secs)
                && self.quorum_votes > 0,
            GovernanceError::InvalidParams
        );
        Ok(())
    }
}

#[derive(Accounts)]
#[instruction(decimals: u8)]
pub struct InitializeGovernance<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(
        init,
        payer = authority,
        space = 8 + GovernanceConfig::INIT_SPACE,
        seeds = [CONFIG_SEED],
        bump
    )]
    pub config: Account<'info, GovernanceConfig>,
    #[account(
        init,
        payer = authority,
        seeds = [MINT_SEED],
        bump,
        mint::decimals = decimals,
        mint::authority = config,
        mint::token_program = token_program
    )]
    pub mint: InterfaceAccount<'info, Mint>,
    #[account(
        init,
        payer = authority,
        seeds = [VAULT_SEED],
        bump,
        token::mint = mint,
        token::authority = config,
        token::token_program = token_program
    )]
    pub vault: InterfaceAccount<'info, TokenAccount>,
    pub token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
}

pub fn handle_initialize(
    ctx: Context<InitializeGovernance>,
    _decimals: u8,
    params: GovernanceParams,
) -> Result<()> {
    params.validate()?;
    let config = &mut ctx.accounts.config;
    config.authority = ctx.accounts.authority.key();
    config.mint = ctx.accounts.mint.key();
    config.vault = ctx.accounts.vault.key();
    config.voting_period_secs = params.voting_period_secs;
    config.quorum_votes = params.quorum_votes;
    config.proposal_threshold = params.proposal_threshold;
    config.proposal_count = 0;
    config.total_staked = 0;
    config.bump = ctx.bumps.config;
    Ok(())
}

#[derive(Accounts)]
pub struct MintTokens<'info> {
    pub authority: Signer<'info>,
    #[account(seeds = [CONFIG_SEED], bump = config.bump, has_one = authority, has_one = mint)]
    pub config: Account<'info, GovernanceConfig>,
    #[account(mut)]
    pub mint: InterfaceAccount<'info, Mint>,
    #[account(mut, token::mint = mint)]
    pub destination: InterfaceAccount<'info, TokenAccount>,
    pub token_program: Interface<'info, TokenInterface>,
}

pub fn handle_mint_tokens(ctx: Context<MintTokens>, amount: u64) -> Result<()> {
    require!(amount > 0, GovernanceError::ZeroAmount);
    let bump = [ctx.accounts.config.bump];
    let seeds: &[&[u8]] = &[CONFIG_SEED, &bump];
    let signer = [seeds];
    let cpi = CpiContext::new_with_signer(
        ctx.accounts.token_program.key(),
        MintTo {
            mint: ctx.accounts.mint.to_account_info(),
            to: ctx.accounts.destination.to_account_info(),
            authority: ctx.accounts.config.to_account_info(),
        },
        &signer,
    );
    token_interface::mint_to(cpi, amount)
}
