//! NFT marketplace program.
//!
//! Sellers escrow an NFT (SPL Token or Token-2022, decimals 0 / supply 1) in a
//! listing PDA and set a SOL price. Buyers purchase atomically (SOL to seller
//! and treasury, NFT to buyer) or escrow SOL offers that the seller can accept.

use anchor_lang::prelude::*;

pub mod errors;
pub mod escrow;
pub mod events;
pub mod instructions;
pub mod state;

use instructions::*;

declare_id!("BKvFQqBhXJNpKjmAzwvsbuHGKG54EPcdcV7YmRfxw1Te");

#[program]
pub mod marketplace {
    use super::*;

    pub fn initialize_marketplace(
        ctx: Context<InitializeMarketplace>,
        fee_bps: u16,
        treasury: Pubkey,
    ) -> Result<()> {
        handle_initialize_marketplace(ctx, fee_bps, treasury)
    }

    /// Admin-only: fee, treasury, pause switch and admin rotation.
    pub fn update_marketplace(
        ctx: Context<UpdateMarketplace>,
        update: MarketplaceUpdate,
    ) -> Result<()> {
        handle_update_marketplace(ctx, update)
    }

    pub fn list_nft(ctx: Context<ListNft>, price: u64, expires_at: i64) -> Result<()> {
        handle_list_nft(ctx, price, expires_at)
    }

    pub fn update_listing(ctx: Context<UpdateListing>, price: u64, expires_at: i64) -> Result<()> {
        handle_update_listing(ctx, price, expires_at)
    }

    pub fn delist_nft(ctx: Context<DelistNft>) -> Result<()> {
        handle_delist_nft(ctx)
    }

    pub fn purchase_nft(ctx: Context<PurchaseNft>, max_price: u64) -> Result<()> {
        handle_purchase_nft(ctx, max_price)
    }

    pub fn make_offer(ctx: Context<MakeOffer>, amount: u64, expires_at: i64) -> Result<()> {
        handle_make_offer(ctx, amount, expires_at)
    }

    pub fn cancel_offer(ctx: Context<CancelOffer>) -> Result<()> {
        handle_cancel_offer(ctx)
    }

    pub fn accept_offer(ctx: Context<AcceptOffer>) -> Result<()> {
        handle_accept_offer(ctx)
    }
}
