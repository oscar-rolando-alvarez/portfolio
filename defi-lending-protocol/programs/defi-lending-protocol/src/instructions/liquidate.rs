use crate::constants::*;
use crate::errors::LendingError;
use crate::events::Liquidated;
use crate::instructions::borrow::reduce_debt;
use crate::instructions::risk::{RiskSnapshot, load_prices};
use crate::math;
use crate::state::{Market, Position, Protocol};
use crate::token::{self, TransferArgs};
use anchor_lang::prelude::*;
use anchor_spl::token_interface::{Mint, TokenAccount, TokenInterface};
use pyth_solana_receiver_sdk::price_update::PriceUpdateV2;

#[derive(Accounts)]
pub struct Liquidate<'info> {
    pub liquidator: Signer<'info>,
    #[account(seeds = [PROTOCOL_SEED], bump = protocol.bump)]
    pub protocol: Account<'info, Protocol>,
    #[account(
        mut,
        has_one = protocol,
        has_one = collateral_mint,
        has_one = loan_mint,
        has_one = collateral_vault,
        has_one = loan_vault,
        has_one = token_program
    )]
    pub market: Box<Account<'info, Market>>,
    #[account(mut, has_one = market)]
    pub position: Account<'info, Position>,
    pub collateral_mint: Box<InterfaceAccount<'info, Mint>>,
    pub loan_mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(mut)]
    pub collateral_vault: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(mut)]
    pub loan_vault: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(mut, token::mint = loan_mint, token::authority = liquidator)]
    pub liquidator_loan_account: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(mut, token::mint = collateral_mint)]
    pub liquidator_collateral_account: Box<InterfaceAccount<'info, TokenAccount>>,
    pub collateral_price: Box<Account<'info, PriceUpdateV2>>,
    pub loan_price: Box<Account<'info, PriceUpdateV2>>,
    pub token_program: Interface<'info, TokenInterface>,
}

/// Repays up to `max_repay` of an unhealthy position's debt (bounded by the
/// close factor) and seizes collateral worth the repaid value plus the bonus.
pub fn handle_liquidate(ctx: Context<Liquidate>, max_repay: u64) -> Result<()> {
    require!(max_repay > 0, LendingError::ZeroAmount);
    let clock = Clock::get()?;
    let market = &mut ctx.accounts.market;
    // Liquidations stay enabled while paused to protect solvency.
    require!(!market.flash_loan_active, LendingError::FlashLoanInProgress);
    market.accrue_interest(clock.unix_timestamp)?;

    let position = &mut ctx.accounts.position;
    let prices = load_prices(
        market,
        &ctx.accounts.collateral_price,
        &ctx.accounts.loan_price,
        &clock,
    )?;
    let risk = RiskSnapshot::new(market, position, &prices)?;
    require!(risk.is_liquidatable(market)?, LendingError::PositionHealthy);

    let close_limit =
        math::mul_div_ceil(risk.debt as u128, CLOSE_FACTOR_BPS as u128, BPS as u128)? as u64;
    let mut repay = max_repay.min(close_limit).min(risk.debt);

    let bonus = BPS + market.config.liquidation_bonus_bps as u64;
    let repay_value = math::usd_value_wad(
        repay,
        market.loan_decimals,
        prices.loan.price,
        prices.loan.expo,
    )?;
    let seize_value = math::mul_div_floor(repay_value, bonus as u128, BPS as u128)?;
    let mut seize = math::amount_for_usd_value(
        seize_value,
        market.collateral_decimals,
        prices.collateral.price,
        prices.collateral.expo,
    )?;

    // Bad-debt edge case: not enough collateral left, so scale the repayment down.
    if seize > position.collateral_amount {
        seize = position.collateral_amount;
        let available_value = math::usd_value_wad(
            seize,
            market.collateral_decimals,
            prices.collateral.price,
            prices.collateral.expo,
        )?;
        let repay_value = math::mul_div_floor(available_value, BPS as u128, bonus as u128)?;
        repay = math::amount_for_usd_value(
            repay_value,
            market.loan_decimals,
            prices.loan.price,
            prices.loan.expo,
        )?
        .min(repay);
    }
    require!(repay > 0 && seize > 0, LendingError::ZeroAmount);

    let token_program = ctx.accounts.token_program.to_account_info();
    token::transfer(
        TransferArgs {
            token_program: &token_program,
            from: &ctx.accounts.liquidator_loan_account.to_account_info(),
            to: &ctx.accounts.loan_vault.to_account_info(),
            mint: &ctx.accounts.loan_mint.to_account_info(),
            authority: &ctx.accounts.liquidator.to_account_info(),
            decimals: market.loan_decimals,
        },
        repay,
        &[],
    )?;

    reduce_debt(market, position, repay, risk.debt)?;
    position.collateral_amount -= seize;

    let seeds = market.signer_seeds();
    token::transfer(
        TransferArgs {
            token_program: &token_program,
            from: &ctx.accounts.collateral_vault.to_account_info(),
            to: &ctx.accounts.liquidator_collateral_account.to_account_info(),
            mint: &ctx.accounts.collateral_mint.to_account_info(),
            authority: &market.to_account_info(),
            decimals: market.collateral_decimals,
        },
        seize,
        &[&seeds],
    )?;

    emit!(Liquidated {
        market: market.key(),
        owner: position.owner,
        liquidator: ctx.accounts.liquidator.key(),
        repaid: repay,
        collateral_seized: seize,
    });
    Ok(())
}
