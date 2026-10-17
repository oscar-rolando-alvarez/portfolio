//! Single-transaction flash loans using instruction introspection: `flash_borrow`
//! only succeeds if a matching `flash_repay` for the same market and amount
//! appears later in the same transaction, so funds can never leave the vault
//! beyond the transaction boundary.

use crate::constants::*;
use crate::errors::LendingError;
use crate::events::FlashLoan;
use crate::math;
use crate::state::{Market, Protocol};
use crate::token::{self, TransferArgs};
use anchor_lang::Discriminator;
use anchor_lang::compat::solana_instructions_sysvar::{
    load_current_index_checked, load_instruction_at_checked,
};
use anchor_lang::prelude::*;
use anchor_spl::token_interface::{Mint, TokenAccount, TokenInterface};

/// Index of the `market` account inside [`FlashLoanAccounts`].
const MARKET_ACCOUNT_INDEX: usize = 2;

#[derive(Accounts)]
pub struct FlashLoanAccounts<'info> {
    pub user: Signer<'info>,
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
    pub loan_mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(mut)]
    pub loan_vault: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(mut, token::mint = loan_mint, token::authority = user)]
    pub user_loan_account: Box<InterfaceAccount<'info, TokenAccount>>,
    /// CHECK: verified to be the instructions sysvar by the address constraint.
    #[account(address = anchor_lang::compat::solana_instructions_sysvar::ID)]
    pub instructions: UncheckedAccount<'info>,
    pub token_program: Interface<'info, TokenInterface>,
}

pub fn handle_flash_borrow(ctx: Context<FlashLoanAccounts>, amount: u64) -> Result<()> {
    require!(amount > 0, LendingError::ZeroAmount);
    let market = &mut ctx.accounts.market;
    market.assert_operational(&ctx.accounts.protocol)?;
    market.accrue_interest(Clock::get()?.unix_timestamp)?;
    require!(
        amount <= market.available_liquidity(),
        LendingError::InsufficientLiquidity
    );

    let ixs = ctx.accounts.instructions.to_account_info();
    let current = load_current_index_checked(&ixs)? as usize;
    let current_ix = load_instruction_at_checked(current, &ixs)?;
    require_keys_eq!(
        current_ix.program_id,
        crate::ID,
        LendingError::FlashLoanViaCpi
    );

    let market_key = market.key();
    let mut found = false;
    let mut index = current + 1;
    while let Ok(ix) = load_instruction_at_checked(index, &ixs) {
        if ix.program_id == crate::ID {
            let data = ix.data.as_slice();
            if data.starts_with(crate::instruction::FlashBorrow::DISCRIMINATOR) {
                // Nested flash loans would make the accounting ambiguous.
                return err!(LendingError::FlashLoanInProgress);
            }
            if data.starts_with(crate::instruction::FlashRepay::DISCRIMINATOR) {
                let disc_len = crate::instruction::FlashRepay::DISCRIMINATOR.len();
                let repay_amount = data
                    .get(disc_len..disc_len + 8)
                    .and_then(|b| b.try_into().ok())
                    .map(u64::from_le_bytes)
                    .ok_or(LendingError::FlashRepayMismatch)?;
                let same_market = ix
                    .accounts
                    .get(MARKET_ACCOUNT_INDEX)
                    .is_some_and(|m| m.pubkey == market_key);
                require!(
                    same_market && repay_amount == amount,
                    LendingError::FlashRepayMismatch
                );
                found = true;
                break;
            }
        }
        index += 1;
    }
    require!(found, LendingError::FlashRepayMissing);

    market.flash_loan_active = true;
    market.flash_loan_amount = amount;

    let seeds = market.signer_seeds();
    token::transfer(
        TransferArgs {
            token_program: &ctx.accounts.token_program.to_account_info(),
            from: &ctx.accounts.loan_vault.to_account_info(),
            to: &ctx.accounts.user_loan_account.to_account_info(),
            mint: &ctx.accounts.loan_mint.to_account_info(),
            authority: &market.to_account_info(),
            decimals: market.loan_decimals,
        },
        amount,
        &[&seeds],
    )
}

pub fn handle_flash_repay(ctx: Context<FlashLoanAccounts>, amount: u64) -> Result<()> {
    let market = &mut ctx.accounts.market;
    require!(market.flash_loan_active, LendingError::NoFlashLoan);
    require!(
        amount == market.flash_loan_amount,
        LendingError::FlashRepayMismatch
    );

    let fee = math::flash_loan_fee(amount, market.config.flash_loan_fee_bps as u64)?;
    let total = amount.checked_add(fee).ok_or(LendingError::MathOverflow)?;
    token::transfer(
        TransferArgs {
            token_program: &ctx.accounts.token_program.to_account_info(),
            from: &ctx.accounts.user_loan_account.to_account_info(),
            to: &ctx.accounts.loan_vault.to_account_info(),
            mint: &ctx.accounts.loan_mint.to_account_info(),
            authority: &ctx.accounts.user.to_account_info(),
            decimals: market.loan_decimals,
        },
        total,
        &[],
    )?;

    let (to_suppliers, to_reserves) =
        math::split_fee(fee, market.config.reserve_factor_bps as u64)?;
    market.total_deposits = market
        .total_deposits
        .checked_add(to_suppliers)
        .ok_or(LendingError::MathOverflow)?;
    market.total_reserves = market
        .total_reserves
        .checked_add(to_reserves)
        .ok_or(LendingError::MathOverflow)?;
    market.flash_loan_active = false;
    market.flash_loan_amount = 0;

    emit!(FlashLoan {
        market: market.key(),
        receiver: ctx.accounts.user.key(),
        amount,
        fee,
    });
    Ok(())
}
