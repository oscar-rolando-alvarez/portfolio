use anchor_lang::prelude::*;
use anchor_lang::solana_program::program::invoke;
use anchor_lang::solana_program::system_instruction;
use anchor_spl::token::{Token, TokenAccount};
use crate::{state::*, events::*, errors::*};

#[derive(Accounts)]
#[instruction(amount: u64)]
pub struct MakeOffer<'info> {
    #[account(
        seeds = [b"marketplace".as_ref()],
        bump,
        constraint = !marketplace.is_paused @ MarketplaceError::MarketplacePaused
    )]
    pub marketplace: Account<'info, Marketplace>,
    
    #[account(
        constraint = listing.is_active() @ MarketplaceError::ListingNotActive,
        constraint = listing.allow_offers @ MarketplaceError::OffersNotAllowed,
        constraint = listing.seller != bidder.key() @ MarketplaceError::CannotPurchaseOwnNft
    )]
    pub listing: Account<'info, Listing>,
    
    #[account(
        init,
        payer = bidder,
        space = Offer::LEN,
        seeds = [
            b"offer".as_ref(),
            listing.key().as_ref(),
            bidder.key().as_ref()
        ],
        bump
    )]
    pub offer: Account<'info, Offer>,
    
    #[account(mut)]
    pub bidder: Signer<'info>,
    
    /// CHECK: Escrow account to hold the offer funds
    #[account(
        mut,
        seeds = [b"escrow".as_ref(), offer.key().as_ref()],
        bump
    )]
    pub escrow_account: AccountInfo<'info>,
    
    pub system_program: Program<'info, System>,
}

pub fn handler(
    ctx: Context<MakeOffer>,
    amount: u64,
    expiry: i64,
) -> Result<()> {
    let listing = &ctx.accounts.listing;
    let offer = &mut ctx.accounts.offer;
    let bidder = &ctx.accounts.bidder;
    let escrow_account = &ctx.accounts.escrow_account;
    
    let current_time = Clock::get()?.unix_timestamp;
    
    require!(amount > 0, MarketplaceError::InvalidOfferAmount);
    require!(expiry > current_time, MarketplaceError::InvalidExpiry);
    require!(!listing.is_expired(), MarketplaceError::CannotOfferOnExpiredListing);
    require!(
        amount > listing.highest_offer,
        MarketplaceError::OfferTooLow
    );
    
    // Transfer offer amount to escrow
    invoke(
        &system_instruction::transfer(bidder.key, escrow_account.key, amount),
        &[
            bidder.to_account_info(),
            escrow_account.to_account_info(),
            ctx.accounts.system_program.to_account_info(),
        ],
    )?;
    
    offer.bidder = bidder.key();
    offer.listing = listing.key();
    offer.amount = amount;
    offer.expiry = expiry;
    offer.created_at = current_time;
    offer.escrow_account = escrow_account.key();
    offer.status = OfferStatus::Active;
    
    emit!(OfferMade {\n        offer: offer.key(),\n        listing: listing.key(),\n        bidder: bidder.key(),\n        amount,\n        expiry,\n        timestamp: current_time,\n    });\n    \n    Ok(())\n}"