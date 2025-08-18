use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};
use crate::{state::*, events::*, errors::*};

#[derive(Accounts)]
pub struct DelistNft<'info> {
    #[account(
        seeds = [b"marketplace".as_ref()],
        bump,
        constraint = !marketplace.is_paused @ MarketplaceError::MarketplacePaused
    )]
    pub marketplace: Account<'info, Marketplace>,
    
    #[account(
        mut,
        seeds = [
            b"listing".as_ref(),
            listing.nft_mint.as_ref(),
            listing.seller.as_ref()
        ],
        bump,
        constraint = listing.is_seller(&seller.key()) @ MarketplaceError::NotSeller,
        close = seller
    )]
    pub listing: Account<'info, Listing>,
    
    #[account(mut)]
    pub seller: Signer<'info>,
    
    #[account(
        mut,
        associated_token::mint = listing.nft_mint,
        associated_token::authority = listing
    )]
    pub listing_nft_account: Account<'info, TokenAccount>,
    
    #[account(
        mut,
        associated_token::mint = listing.nft_mint,
        associated_token::authority = seller
    )]
    pub seller_nft_account: Account<'info, TokenAccount>,
    
    pub token_program: Program<'info, Token>,
}

pub fn handler(ctx: Context<DelistNft>) -> Result<()> {
    let listing = &ctx.accounts.listing;
    let seller = &ctx.accounts.seller;
    let listing_nft_account = &ctx.accounts.listing_nft_account;
    let seller_nft_account = &ctx.accounts.seller_nft_account;
    
    // Return NFT to seller
    let listing_seeds = &[
        b"listing".as_ref(),
        listing.nft_mint.as_ref(),
        listing.seller.as_ref(),
        &[ctx.bumps.listing],
    ];
    let signer_seeds = &[&listing_seeds[..]];
    
    let transfer_ctx = CpiContext::new_with_signer(
        ctx.accounts.token_program.to_account_info(),
        Transfer {
            from: listing_nft_account.to_account_info(),
            to: seller_nft_account.to_account_info(),
            authority: listing.to_account_info(),
        },
        signer_seeds,
    );
    token::transfer(transfer_ctx, 1)?;
    
    emit!(NftDelisted {
        listing: listing.key(),
        seller: seller.key(),
        nft_mint: listing.nft_mint,
        reason: DelistReason::SellerCancelled,
        timestamp: Clock::get()?.unix_timestamp,
    });
    
    Ok(())
}