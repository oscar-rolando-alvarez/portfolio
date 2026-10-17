use crate::constants::*;
use crate::errors::LendingError;
use crate::events::MarketCreated;
use crate::state::{Market, MarketConfig, Protocol};
use crate::token::{self, TransferArgs};
use anchor_lang::prelude::*;
use anchor_spl::token_interface::{Mint, TokenAccount, TokenInterface};

#[derive(Accounts)]
pub struct InitializeProtocol<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,
    #[account(
        init,
        payer = admin,
        space = 8 + Protocol::INIT_SPACE,
        seeds = [PROTOCOL_SEED],
        bump
    )]
    pub protocol: Account<'info, Protocol>,
    pub system_program: Program<'info, System>,
}

pub fn handle_initialize_protocol(ctx: Context<InitializeProtocol>) -> Result<()> {
    let protocol = &mut ctx.accounts.protocol;
    protocol.admin = ctx.accounts.admin.key();
    protocol.paused = false;
    protocol.market_count = 0;
    protocol.bump = ctx.bumps.protocol;
    Ok(())
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug)]
pub struct CreateMarketParams {
    pub collateral_feed_id: [u8; 32],
    pub loan_feed_id: [u8; 32],
    pub config: MarketConfig,
}

#[derive(Accounts)]
pub struct CreateMarket<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,
    #[account(mut, seeds = [PROTOCOL_SEED], bump = protocol.bump, has_one = admin)]
    pub protocol: Account<'info, Protocol>,
    #[account(mint::token_program = token_program)]
    pub collateral_mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(mint::token_program = token_program)]
    pub loan_mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(
        init,
        payer = admin,
        space = 8 + Market::INIT_SPACE,
        seeds = [MARKET_SEED, collateral_mint.key().as_ref(), loan_mint.key().as_ref()],
        bump
    )]
    pub market: Box<Account<'info, Market>>,
    #[account(
        init,
        payer = admin,
        seeds = [COLLATERAL_VAULT_SEED, market.key().as_ref()],
        bump,
        token::mint = collateral_mint,
        token::authority = market,
        token::token_program = token_program
    )]
    pub collateral_vault: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(
        init,
        payer = admin,
        seeds = [LOAN_VAULT_SEED, market.key().as_ref()],
        bump,
        token::mint = loan_mint,
        token::authority = market,
        token::token_program = token_program
    )]
    pub loan_vault: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(
        init,
        payer = admin,
        seeds = [SHARE_MINT_SEED, market.key().as_ref()],
        bump,
        mint::decimals = loan_mint.decimals,
        mint::authority = market,
        mint::token_program = token_program
    )]
    pub share_mint: Box<InterfaceAccount<'info, Mint>>,
    pub token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
}

pub fn handle_create_market(ctx: Context<CreateMarket>, params: CreateMarketParams) -> Result<()> {
    params.config.validate()?;
    require_keys_neq!(
        ctx.accounts.collateral_mint.key(),
        ctx.accounts.loan_mint.key(),
        LendingError::SameMint
    );

    let now = Clock::get()?.unix_timestamp;
    let market = &mut ctx.accounts.market;
    market.protocol = ctx.accounts.protocol.key();
    market.collateral_mint = ctx.accounts.collateral_mint.key();
    market.loan_mint = ctx.accounts.loan_mint.key();
    market.collateral_vault = ctx.accounts.collateral_vault.key();
    market.loan_vault = ctx.accounts.loan_vault.key();
    market.share_mint = ctx.accounts.share_mint.key();
    market.token_program = ctx.accounts.token_program.key();
    market.collateral_decimals = ctx.accounts.collateral_mint.decimals;
    market.loan_decimals = ctx.accounts.loan_mint.decimals;
    market.collateral_feed_id = params.collateral_feed_id;
    market.loan_feed_id = params.loan_feed_id;
    market.config = params.config;
    market.total_deposits = 0;
    market.total_shares = 0;
    market.total_borrows = 0;
    market.total_reserves = 0;
    market.borrow_index = WAD;
    market.last_accrual_ts = now;
    market.flash_loan_amount = 0;
    market.flash_loan_active = false;
    market.paused = false;
    market.bump = ctx.bumps.market;

    let protocol = &mut ctx.accounts.protocol;
    protocol.market_count = protocol
        .market_count
        .checked_add(1)
        .ok_or(LendingError::MathOverflow)?;

    emit!(MarketCreated {
        market: market.key(),
        collateral_mint: market.collateral_mint,
        loan_mint: market.loan_mint,
    });
    Ok(())
}

#[derive(Accounts)]
pub struct SetProtocolPaused<'info> {
    pub admin: Signer<'info>,
    #[account(mut, seeds = [PROTOCOL_SEED], bump = protocol.bump, has_one = admin)]
    pub protocol: Account<'info, Protocol>,
}

pub fn handle_set_protocol_paused(ctx: Context<SetProtocolPaused>, paused: bool) -> Result<()> {
    ctx.accounts.protocol.paused = paused;
    Ok(())
}

#[derive(Accounts)]
pub struct UpdateMarket<'info> {
    pub admin: Signer<'info>,
    #[account(seeds = [PROTOCOL_SEED], bump = protocol.bump, has_one = admin)]
    pub protocol: Account<'info, Protocol>,
    #[account(mut, has_one = protocol)]
    pub market: Box<Account<'info, Market>>,
}

pub fn handle_update_market(
    ctx: Context<UpdateMarket>,
    config: Option<MarketConfig>,
    paused: Option<bool>,
) -> Result<()> {
    let market = &mut ctx.accounts.market;
    // Settle interest under the old parameters before changing them.
    market.accrue_interest(Clock::get()?.unix_timestamp)?;
    if let Some(config) = config {
        config.validate()?;
        market.config = config;
    }
    if let Some(paused) = paused {
        market.paused = paused;
    }
    Ok(())
}

#[derive(Accounts)]
pub struct CollectReserves<'info> {
    pub admin: Signer<'info>,
    #[account(seeds = [PROTOCOL_SEED], bump = protocol.bump, has_one = admin)]
    pub protocol: Account<'info, Protocol>,
    #[account(
        mut,
        has_one = protocol,
        has_one = loan_mint,
        has_one = loan_vault,
        has_one = token_program
    )]
    pub market: Box<Account<'info, Market>>,
    pub loan_mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(mut)]
    pub loan_vault: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(mut, token::mint = loan_mint)]
    pub destination: Box<InterfaceAccount<'info, TokenAccount>>,
    pub token_program: Interface<'info, TokenInterface>,
}

pub fn handle_collect_reserves(ctx: Context<CollectReserves>, amount: u64) -> Result<()> {
    require!(amount > 0, LendingError::ZeroAmount);
    let market = &mut ctx.accounts.market;
    require!(!market.flash_loan_active, LendingError::FlashLoanInProgress);
    market.accrue_interest(Clock::get()?.unix_timestamp)?;
    require!(
        amount <= market.total_reserves,
        LendingError::InsufficientReserves
    );
    market.total_reserves -= amount;

    let seeds = market.signer_seeds();
    token::transfer(
        TransferArgs {
            token_program: &ctx.accounts.token_program.to_account_info(),
            from: &ctx.accounts.loan_vault.to_account_info(),
            to: &ctx.accounts.destination.to_account_info(),
            mint: &ctx.accounts.loan_mint.to_account_info(),
            authority: &market.to_account_info(),
            decimals: market.loan_decimals,
        },
        amount,
        &[&seeds],
    )
}
