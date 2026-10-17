use crate::constants::*;
use crate::errors::LendingError;
use crate::events::{Supplied, Withdrawn};
use crate::math;
use crate::state::{Market, Protocol};
use crate::token::{self, TransferArgs};
use anchor_lang::prelude::*;
use anchor_spl::token_interface::{Mint, TokenAccount, TokenInterface};

/// Accounts shared by `supply` and `withdraw`.
#[derive(Accounts)]
pub struct SupplyLiquidity<'info> {
    pub user: Signer<'info>,
    #[account(seeds = [PROTOCOL_SEED], bump = protocol.bump)]
    pub protocol: Account<'info, Protocol>,
    #[account(
        mut,
        has_one = protocol,
        has_one = loan_mint,
        has_one = loan_vault,
        has_one = share_mint,
        has_one = token_program
    )]
    pub market: Box<Account<'info, Market>>,
    pub loan_mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(mut)]
    pub loan_vault: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(mut)]
    pub share_mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(mut, token::mint = loan_mint, token::authority = user)]
    pub user_loan_account: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(mut, token::mint = share_mint, token::authority = user)]
    pub user_share_account: Box<InterfaceAccount<'info, TokenAccount>>,
    pub token_program: Interface<'info, TokenInterface>,
}

pub fn handle_supply(ctx: Context<SupplyLiquidity>, amount: u64) -> Result<()> {
    require!(amount > 0, LendingError::ZeroAmount);
    let market = &mut ctx.accounts.market;
    market.assert_operational(&ctx.accounts.protocol)?;
    market.accrue_interest(Clock::get()?.unix_timestamp)?;

    let shares = math::shares_for_deposit(amount, market.total_deposits, market.total_shares)?;
    require!(shares > 0, LendingError::ZeroAmount);

    let token_program = ctx.accounts.token_program.to_account_info();
    token::transfer(
        TransferArgs {
            token_program: &token_program,
            from: &ctx.accounts.user_loan_account.to_account_info(),
            to: &ctx.accounts.loan_vault.to_account_info(),
            mint: &ctx.accounts.loan_mint.to_account_info(),
            authority: &ctx.accounts.user.to_account_info(),
            decimals: market.loan_decimals,
        },
        amount,
        &[],
    )?;

    let seeds = market.signer_seeds();
    token::mint_to(
        &token_program,
        &ctx.accounts.share_mint.to_account_info(),
        &ctx.accounts.user_share_account.to_account_info(),
        &market.to_account_info(),
        shares,
        &[&seeds],
    )?;

    market.total_deposits = market
        .total_deposits
        .checked_add(amount)
        .ok_or(LendingError::MathOverflow)?;
    market.total_shares = market
        .total_shares
        .checked_add(shares)
        .ok_or(LendingError::MathOverflow)?;

    emit!(Supplied {
        market: market.key(),
        user: ctx.accounts.user.key(),
        amount,
        shares,
    });
    Ok(())
}

pub fn handle_withdraw(ctx: Context<SupplyLiquidity>, shares: u64) -> Result<()> {
    require!(shares > 0, LendingError::ZeroAmount);
    let market = &mut ctx.accounts.market;
    market.assert_operational(&ctx.accounts.protocol)?;
    market.accrue_interest(Clock::get()?.unix_timestamp)?;

    let amount = math::assets_for_shares(shares, market.total_deposits, market.total_shares)?;
    require!(amount > 0, LendingError::ZeroAmount);
    require!(
        amount <= market.available_liquidity(),
        LendingError::InsufficientLiquidity
    );

    let token_program = ctx.accounts.token_program.to_account_info();
    token::burn(
        &token_program,
        &ctx.accounts.share_mint.to_account_info(),
        &ctx.accounts.user_share_account.to_account_info(),
        &ctx.accounts.user.to_account_info(),
        shares,
    )?;

    market.total_deposits -= amount;
    market.total_shares -= shares;

    let seeds = market.signer_seeds();
    token::transfer(
        TransferArgs {
            token_program: &token_program,
            from: &ctx.accounts.loan_vault.to_account_info(),
            to: &ctx.accounts.user_loan_account.to_account_info(),
            mint: &ctx.accounts.loan_mint.to_account_info(),
            authority: &market.to_account_info(),
            decimals: market.loan_decimals,
        },
        amount,
        &[&seeds],
    )?;

    emit!(Withdrawn {
        market: market.key(),
        user: ctx.accounts.user.key(),
        amount,
        shares,
    });
    Ok(())
}
