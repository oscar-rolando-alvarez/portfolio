use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer, Mint};
use anchor_spl::associated_token::AssociatedToken;
use mpl_token_metadata::accounts::Metadata;
use mpl_token_metadata::types::DataV2;

declare_id!("BPFLoaderUpgradeab1e11111111111111111111111");

pub mod errors;
pub mod events;
pub mod instructions;
pub mod state;
pub mod utils;

use errors::*;
use events::*;
use instructions::*;
use state::*;

#[program]
pub mod marketplace {
    use super::*;

    /// Initialize the marketplace with configuration
    pub fn initialize_marketplace(
        ctx: Context<InitializeMarketplace>,
        marketplace_fee: u16,
        max_listing_duration: i64,
    ) -> Result<()> {
        instructions::initialize_marketplace::handler(ctx, marketplace_fee, max_listing_duration)
    }

    /// Update marketplace configuration (admin only)
    pub fn update_marketplace_config(
        ctx: Context<UpdateMarketplaceConfig>,
        new_fee: Option<u16>,
        new_max_duration: Option<i64>,
        new_admin: Option<Pubkey>,
    ) -> Result<()> {
        instructions::update_marketplace_config::handler(ctx, new_fee, new_max_duration, new_admin)
    }

    /// List an NFT for sale
    pub fn list_nft(
        ctx: Context<ListNft>,
        price: u64,
        expiry: i64,
        allow_offers: bool,
    ) -> Result<()> {
        instructions::list_nft::handler(ctx, price, expiry, allow_offers)
    }

    /// Update listing price and parameters
    pub fn update_listing(
        ctx: Context<UpdateListing>,
        new_price: Option<u64>,
        new_expiry: Option<i64>,
        new_allow_offers: Option<bool>,
    ) -> Result<()> {
        instructions::update_listing::handler(ctx, new_price, new_expiry, new_allow_offers)
    }

    /// Cancel/delist an NFT
    pub fn delist_nft(ctx: Context<DelistNft>) -> Result<()> {
        instructions::delist_nft::handler(ctx)
    }

    /// Purchase a listed NFT directly
    pub fn purchase_nft(ctx: Context<PurchaseNft>) -> Result<()> {
        instructions::purchase_nft::handler(ctx)
    }

    /// Make an offer on a listed NFT
    pub fn make_offer(
        ctx: Context<MakeOffer>,
        amount: u64,
        expiry: i64,
    ) -> Result<()> {
        instructions::make_offer::handler(ctx, amount, expiry)
    }

    /// Accept an offer on your listed NFT
    pub fn accept_offer(ctx: Context<AcceptOffer>) -> Result<()> {
        instructions::accept_offer::handler(ctx)
    }

    /// Cancel an offer you made
    pub fn cancel_offer(ctx: Context<CancelOffer>) -> Result<()> {
        instructions::cancel_offer::handler(ctx)
    }

    /// Withdraw expired offers (cleanup)
    pub fn withdraw_expired_offer(ctx: Context<WithdrawExpiredOffer>) -> Result<()> {
        instructions::withdraw_expired_offer::handler(ctx)
    }

    /// Withdraw marketplace fees (admin only)
    pub fn withdraw_fees(ctx: Context<WithdrawFees>, amount: u64) -> Result<()> {
        instructions::withdraw_fees::handler(ctx, amount)
    }

    /// Emergency pause marketplace (admin only)
    pub fn pause_marketplace(ctx: Context<PauseMarketplace>) -> Result<()> {
        instructions::pause_marketplace::handler(ctx)
    }

    /// Resume marketplace operations (admin only)
    pub fn resume_marketplace(ctx: Context<ResumeMarketplace>) -> Result<()> {
        instructions::resume_marketplace::handler(ctx)
    }
}