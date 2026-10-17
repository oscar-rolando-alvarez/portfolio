//! Isolated-market lending protocol.
//!
//! Each market pairs one collateral asset with one borrowable asset. Suppliers
//! deposit the borrowable asset and receive interest-bearing share tokens;
//! borrowers lock collateral and borrow against it up to the market LTV, priced
//! by Pyth pull oracles. Unhealthy positions can be liquidated, and idle
//! liquidity is available for single-transaction flash loans.

use anchor_lang::prelude::*;

pub mod constants;
pub mod errors;
pub mod events;
pub mod instructions;
pub mod math;
pub mod oracle;
pub mod state;
pub mod token;

use instructions::*;
use state::MarketConfig;

declare_id!("4sohRUrhAnm75sFwUbeE6tJHRQCNq5MMf4PEYEUi1WdD");

#[program]
pub mod defi_lending_protocol {
    use super::*;

    /// Creates the singleton protocol config; the signer becomes admin.
    pub fn initialize_protocol(ctx: Context<InitializeProtocol>) -> Result<()> {
        handle_initialize_protocol(ctx)
    }

    /// Creates an isolated market with its vaults and share mint (admin only).
    pub fn create_market(ctx: Context<CreateMarket>, params: CreateMarketParams) -> Result<()> {
        handle_create_market(ctx, params)
    }

    /// Global circuit breaker (admin only).
    pub fn set_protocol_paused(ctx: Context<SetProtocolPaused>, paused: bool) -> Result<()> {
        handle_set_protocol_paused(ctx, paused)
    }

    /// Updates risk parameters and/or pauses a single market (admin only).
    pub fn update_market(
        ctx: Context<UpdateMarket>,
        config: Option<MarketConfig>,
        paused: Option<bool>,
    ) -> Result<()> {
        handle_update_market(ctx, config, paused)
    }

    /// Transfers accumulated protocol reserves out of a market (admin only).
    pub fn collect_reserves(ctx: Context<CollectReserves>, amount: u64) -> Result<()> {
        handle_collect_reserves(ctx, amount)
    }

    /// Supplies the borrowable asset and mints share tokens.
    pub fn supply(ctx: Context<SupplyLiquidity>, amount: u64) -> Result<()> {
        handle_supply(ctx, amount)
    }

    /// Burns share tokens and returns the underlying plus accrued interest.
    pub fn withdraw(ctx: Context<SupplyLiquidity>, shares: u64) -> Result<()> {
        handle_withdraw(ctx, shares)
    }

    /// Opens an empty borrowing position for the signer in a market.
    pub fn open_position(ctx: Context<OpenPosition>) -> Result<()> {
        handle_open_position(ctx)
    }

    pub fn deposit_collateral(ctx: Context<DepositCollateral>, amount: u64) -> Result<()> {
        handle_deposit_collateral(ctx, amount)
    }

    pub fn withdraw_collateral(ctx: Context<WithdrawCollateral>, amount: u64) -> Result<()> {
        handle_withdraw_collateral(ctx, amount)
    }

    pub fn borrow(ctx: Context<Borrow>, amount: u64) -> Result<()> {
        handle_borrow(ctx, amount)
    }

    pub fn repay(ctx: Context<Repay>, amount: u64) -> Result<()> {
        handle_repay(ctx, amount)
    }

    pub fn liquidate(ctx: Context<Liquidate>, max_repay: u64) -> Result<()> {
        handle_liquidate(ctx, max_repay)
    }

    pub fn flash_borrow(ctx: Context<FlashLoanAccounts>, amount: u64) -> Result<()> {
        handle_flash_borrow(ctx, amount)
    }

    pub fn flash_repay(ctx: Context<FlashLoanAccounts>, amount: u64) -> Result<()> {
        handle_flash_repay(ctx, amount)
    }
}
