use crate::constants::*;
use crate::errors::LendingError;
use crate::events::CollateralChanged;
use crate::instructions::risk::{RiskSnapshot, load_prices};
use crate::state::{Market, Position, Protocol};
use crate::token::{self, TransferArgs};
use anchor_lang::prelude::*;
use anchor_spl::token_interface::{Mint, TokenAccount, TokenInterface};
use pyth_solana_receiver_sdk::price_update::PriceUpdateV2;

#[derive(Accounts)]
pub struct OpenPosition<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    pub market: Box<Account<'info, Market>>,
    #[account(
        init,
        payer = owner,
        space = 8 + Position::INIT_SPACE,
        seeds = [POSITION_SEED, market.key().as_ref(), owner.key().as_ref()],
        bump
    )]
    pub position: Account<'info, Position>,
    pub system_program: Program<'info, System>,
}

pub fn handle_open_position(ctx: Context<OpenPosition>) -> Result<()> {
    let position = &mut ctx.accounts.position;
    position.owner = ctx.accounts.owner.key();
    position.market = ctx.accounts.market.key();
    position.collateral_amount = 0;
    position.borrow_scaled = 0;
    position.bump = ctx.bumps.position;
    Ok(())
}

#[derive(Accounts)]
pub struct DepositCollateral<'info> {
    pub owner: Signer<'info>,
    #[account(seeds = [PROTOCOL_SEED], bump = protocol.bump)]
    pub protocol: Account<'info, Protocol>,
    #[account(
        has_one = protocol,
        has_one = collateral_mint,
        has_one = collateral_vault,
        has_one = token_program
    )]
    pub market: Box<Account<'info, Market>>,
    #[account(
        mut,
        seeds = [POSITION_SEED, market.key().as_ref(), owner.key().as_ref()],
        bump = position.bump,
        has_one = owner,
        has_one = market
    )]
    pub position: Account<'info, Position>,
    pub collateral_mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(mut)]
    pub collateral_vault: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(mut, token::mint = collateral_mint, token::authority = owner)]
    pub owner_collateral_account: Box<InterfaceAccount<'info, TokenAccount>>,
    pub token_program: Interface<'info, TokenInterface>,
}

pub fn handle_deposit_collateral(ctx: Context<DepositCollateral>, amount: u64) -> Result<()> {
    require!(amount > 0, LendingError::ZeroAmount);
    let market = &ctx.accounts.market;
    market.assert_operational(&ctx.accounts.protocol)?;

    token::transfer(
        TransferArgs {
            token_program: &ctx.accounts.token_program.to_account_info(),
            from: &ctx.accounts.owner_collateral_account.to_account_info(),
            to: &ctx.accounts.collateral_vault.to_account_info(),
            mint: &ctx.accounts.collateral_mint.to_account_info(),
            authority: &ctx.accounts.owner.to_account_info(),
            decimals: market.collateral_decimals,
        },
        amount,
        &[],
    )?;

    let position = &mut ctx.accounts.position;
    position.collateral_amount = position
        .collateral_amount
        .checked_add(amount)
        .ok_or(LendingError::MathOverflow)?;

    emit!(CollateralChanged {
        market: market.key(),
        owner: position.owner,
        delta: amount as i128,
        collateral_amount: position.collateral_amount,
    });
    Ok(())
}

#[derive(Accounts)]
pub struct WithdrawCollateral<'info> {
    pub owner: Signer<'info>,
    #[account(seeds = [PROTOCOL_SEED], bump = protocol.bump)]
    pub protocol: Account<'info, Protocol>,
    #[account(
        mut,
        has_one = protocol,
        has_one = collateral_mint,
        has_one = collateral_vault,
        has_one = token_program
    )]
    pub market: Box<Account<'info, Market>>,
    #[account(
        mut,
        seeds = [POSITION_SEED, market.key().as_ref(), owner.key().as_ref()],
        bump = position.bump,
        has_one = owner,
        has_one = market
    )]
    pub position: Account<'info, Position>,
    pub collateral_mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(mut)]
    pub collateral_vault: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(mut, token::mint = collateral_mint)]
    pub destination: Box<InterfaceAccount<'info, TokenAccount>>,
    pub collateral_price: Box<Account<'info, PriceUpdateV2>>,
    pub loan_price: Box<Account<'info, PriceUpdateV2>>,
    pub token_program: Interface<'info, TokenInterface>,
}

pub fn handle_withdraw_collateral(ctx: Context<WithdrawCollateral>, amount: u64) -> Result<()> {
    require!(amount > 0, LendingError::ZeroAmount);
    let clock = Clock::get()?;
    let market = &mut ctx.accounts.market;
    market.assert_operational(&ctx.accounts.protocol)?;
    market.accrue_interest(clock.unix_timestamp)?;

    let position = &mut ctx.accounts.position;
    require!(
        amount <= position.collateral_amount,
        LendingError::InsufficientCollateral
    );
    position.collateral_amount -= amount;

    if position.borrow_scaled > 0 {
        let prices = load_prices(
            market,
            &ctx.accounts.collateral_price,
            &ctx.accounts.loan_price,
            &clock,
        )?;
        let risk = RiskSnapshot::new(market, position, &prices)?;
        require!(risk.within_ltv(market)?, LendingError::LtvExceeded);
    }

    let seeds = market.signer_seeds();
    token::transfer(
        TransferArgs {
            token_program: &ctx.accounts.token_program.to_account_info(),
            from: &ctx.accounts.collateral_vault.to_account_info(),
            to: &ctx.accounts.destination.to_account_info(),
            mint: &ctx.accounts.collateral_mint.to_account_info(),
            authority: &market.to_account_info(),
            decimals: market.collateral_decimals,
        },
        amount,
        &[&seeds],
    )?;

    emit!(CollateralChanged {
        market: market.key(),
        owner: position.owner,
        delta: -(amount as i128),
        collateral_amount: position.collateral_amount,
    });
    Ok(())
}
