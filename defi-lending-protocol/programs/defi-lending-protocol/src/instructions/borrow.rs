use crate::constants::*;
use crate::errors::LendingError;
use crate::events::{Borrowed, Repaid};
use crate::instructions::risk::{RiskSnapshot, load_prices};
use crate::math;
use crate::state::{Market, Position, Protocol};
use crate::token::{self, TransferArgs};
use anchor_lang::prelude::*;
use anchor_spl::token_interface::{Mint, TokenAccount, TokenInterface};
use pyth_solana_receiver_sdk::price_update::PriceUpdateV2;

#[derive(Accounts)]
pub struct Borrow<'info> {
    pub owner: Signer<'info>,
    #[account(seeds = [PROTOCOL_SEED], bump = protocol.bump)]
    pub protocol: Account<'info, Protocol>,
    #[account(
        mut,
        has_one = protocol,
        has_one = loan_mint,
        has_one = loan_vault,
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
    pub loan_mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(mut)]
    pub loan_vault: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(mut, token::mint = loan_mint)]
    pub destination: Box<InterfaceAccount<'info, TokenAccount>>,
    pub collateral_price: Box<Account<'info, PriceUpdateV2>>,
    pub loan_price: Box<Account<'info, PriceUpdateV2>>,
    pub token_program: Interface<'info, TokenInterface>,
}

pub fn handle_borrow(ctx: Context<Borrow>, amount: u64) -> Result<()> {
    require!(amount > 0, LendingError::ZeroAmount);
    let clock = Clock::get()?;
    let market = &mut ctx.accounts.market;
    market.assert_operational(&ctx.accounts.protocol)?;
    market.accrue_interest(clock.unix_timestamp)?;
    require!(
        amount <= market.available_liquidity(),
        LendingError::InsufficientLiquidity
    );

    let position = &mut ctx.accounts.position;
    position.borrow_scaled = position
        .borrow_scaled
        .checked_add(math::scaled_debt_ceil(amount, market.borrow_index)?)
        .ok_or(LendingError::MathOverflow)?;

    let prices = load_prices(
        market,
        &ctx.accounts.collateral_price,
        &ctx.accounts.loan_price,
        &clock,
    )?;
    let risk = RiskSnapshot::new(market, position, &prices)?;
    require!(risk.within_ltv(market)?, LendingError::LtvExceeded);

    market.total_borrows = market
        .total_borrows
        .checked_add(amount)
        .ok_or(LendingError::MathOverflow)?;

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
    )?;

    emit!(Borrowed {
        market: market.key(),
        owner: position.owner,
        amount,
        debt: risk.debt,
    });
    Ok(())
}

#[derive(Accounts)]
pub struct Repay<'info> {
    /// Anyone may repay on behalf of a position owner.
    pub payer: Signer<'info>,
    #[account(seeds = [PROTOCOL_SEED], bump = protocol.bump)]
    pub protocol: Account<'info, Protocol>,
    #[account(
        mut,
        has_one = protocol,
        has_one = loan_mint,
        has_one = loan_vault,
        has_one = token_program
    )]
    pub market: Box<Account<'info, Market>>,
    #[account(mut, has_one = market)]
    pub position: Account<'info, Position>,
    pub loan_mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(mut)]
    pub loan_vault: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(mut, token::mint = loan_mint, token::authority = payer)]
    pub payer_loan_account: Box<InterfaceAccount<'info, TokenAccount>>,
    pub token_program: Interface<'info, TokenInterface>,
}

/// Repays up to `amount`; passing `u64::MAX` repays the full debt.
pub fn handle_repay(ctx: Context<Repay>, amount: u64) -> Result<()> {
    require!(amount > 0, LendingError::ZeroAmount);
    let market = &mut ctx.accounts.market;
    // Repaying is allowed while paused so users can always reduce risk.
    require!(!market.flash_loan_active, LendingError::FlashLoanInProgress);
    market.accrue_interest(Clock::get()?.unix_timestamp)?;

    let position = &mut ctx.accounts.position;
    let debt = position.debt(market)?;
    require!(debt > 0, LendingError::NoDebt);
    let repay = amount.min(debt);

    token::transfer(
        TransferArgs {
            token_program: &ctx.accounts.token_program.to_account_info(),
            from: &ctx.accounts.payer_loan_account.to_account_info(),
            to: &ctx.accounts.loan_vault.to_account_info(),
            mint: &ctx.accounts.loan_mint.to_account_info(),
            authority: &ctx.accounts.payer.to_account_info(),
            decimals: market.loan_decimals,
        },
        repay,
        &[],
    )?;

    reduce_debt(market, position, repay, debt)?;

    emit!(Repaid {
        market: market.key(),
        owner: position.owner,
        amount: repay,
        remaining_debt: position.debt(market)?,
    });
    Ok(())
}

/// Applies a repayment of `repay` (<= `debt`) to the position and market totals.
pub fn reduce_debt(
    market: &mut Market,
    position: &mut Position,
    repay: u64,
    debt: u64,
) -> Result<()> {
    if repay == debt {
        position.borrow_scaled = 0;
    } else {
        let scaled = math::scaled_debt_floor(repay, market.borrow_index)?;
        position.borrow_scaled = position.borrow_scaled.saturating_sub(scaled);
    }
    market.total_borrows = market.total_borrows.saturating_sub(repay);
    Ok(())
}
