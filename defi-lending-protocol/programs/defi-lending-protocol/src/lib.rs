use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};
use pyth_sdk_solana::load_price_feed_from_account_info;

pub mod constants;
pub mod errors;
pub mod instructions;
pub mod state;
pub mod utils;

use constants::*;
use errors::*;
use instructions::*;
use state::*;

declare_id!("DLendpNGzTTDdRsQHBJyYgQV9qR8JwKyFfvKSzWE8hT");

#[program]
pub mod defi_lending_protocol {
    use super::*;

    /// Initialize the lending protocol
    pub fn initialize_protocol(
        ctx: Context<InitializeProtocol>,
        admin: Pubkey,
        fee_rate: u64,
    ) -> Result<()> {
        instructions::initialize_protocol(ctx, admin, fee_rate)
    }

    /// Initialize a liquidity pool for a specific token
    pub fn initialize_pool(
        ctx: Context<InitializePool>,
        asset_mint: Pubkey,
        collateral_factor: u64,
        reserve_factor: u64,
        liquidation_threshold: u64,
        liquidation_bonus: u64,
    ) -> Result<()> {
        instructions::initialize_pool(
            ctx,
            asset_mint,
            collateral_factor,
            reserve_factor,
            liquidation_threshold,
            liquidation_bonus,
        )
    }

    /// Supply tokens to a liquidity pool
    pub fn supply(ctx: Context<Supply>, amount: u64) -> Result<()> {
        instructions::supply(ctx, amount)
    }

    /// Withdraw tokens from a liquidity pool
    pub fn withdraw(ctx: Context<Withdraw>, amount: u64) -> Result<()> {
        instructions::withdraw(ctx, amount)
    }

    /// Borrow tokens from a liquidity pool
    pub fn borrow(ctx: Context<Borrow>, amount: u64) -> Result<()> {
        instructions::borrow(ctx, amount)
    }

    /// Repay borrowed tokens
    pub fn repay(ctx: Context<Repay>, amount: u64) -> Result<()> {
        instructions::repay(ctx, amount)
    }

    /// Liquidate an unhealthy position
    pub fn liquidate(
        ctx: Context<Liquidate>,
        debt_to_cover: u64,
        receive_a_token: bool,
    ) -> Result<()> {
        instructions::liquidate(ctx, debt_to_cover, receive_a_token)
    }

    /// Execute a flash loan
    pub fn flash_loan(
        ctx: Context<FlashLoan>,
        amount: u64,
        params: Vec<u8>,
    ) -> Result<()> {
        instructions::flash_loan(ctx, amount, params)
    }

    /// Update interest rates for a pool
    pub fn update_interest_rates(ctx: Context<UpdateInterestRates>) -> Result<()> {
        instructions::update_interest_rates(ctx)
    }

    /// Claim rewards for liquidity providers
    pub fn claim_rewards(ctx: Context<ClaimRewards>) -> Result<()> {
        instructions::claim_rewards(ctx)
    }

    /// Update oracle price feeds
    pub fn update_oracle_price(ctx: Context<UpdateOraclePrice>) -> Result<()> {
        instructions::update_oracle_price(ctx)
    }

    /// Initialize user obligation account
    pub fn init_user_obligation(ctx: Context<InitUserObligation>) -> Result<()> {
        instructions::init_user_obligation(ctx)
    }

    /// Deposit collateral
    pub fn deposit_collateral(
        ctx: Context<DepositCollateral>,
        amount: u64,
    ) -> Result<()> {
        instructions::deposit_collateral(ctx, amount)
    }

    /// Withdraw collateral
    pub fn withdraw_collateral(
        ctx: Context<WithdrawCollateral>,
        amount: u64,
    ) -> Result<()> {
        instructions::withdraw_collateral(ctx, amount)
    }

    /// Stake governance tokens for voting power
    pub fn stake_governance_tokens(
        ctx: Context<StakeGovernanceTokens>,
        amount: u64,
    ) -> Result<()> {
        instructions::stake_governance_tokens(ctx, amount)
    }

    /// Unstake governance tokens
    pub fn unstake_governance_tokens(
        ctx: Context<UnstakeGovernanceTokens>,
        amount: u64,
    ) -> Result<()> {
        instructions::unstake_governance_tokens(ctx, amount)
    }
}