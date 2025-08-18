use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};
use anchor_spl::associated_token::AssociatedToken;
use mpl_token_metadata::accounts::Metadata;
use crate::{state::*, events::*, errors::*};

#[derive(Accounts)]
#[instruction(price: u64)]
pub struct ListNft<'info> {
    #[account(
        seeds = [b"marketplace".as_ref()],
        bump,
        constraint = !marketplace.is_paused @ MarketplaceError::MarketplacePaused
    )]
    pub marketplace: Account<'info, Marketplace>,
    
    #[account(
        init,
        payer = seller,
        space = Listing::LEN,
        seeds = [
            b"listing".as_ref(),
            nft_mint.key().as_ref(),
            seller.key().as_ref()
        ],
        bump
    )]
    pub listing: Account<'info, Listing>,
    
    #[account(mut)]
    pub seller: Signer<'info>,
    
    pub nft_mint: Account<'info, anchor_spl::token::Mint>,
    
    #[account(
        mut,
        associated_token::mint = nft_mint,
        associated_token::authority = seller,
        constraint = seller_nft_account.amount == 1 @ MarketplaceError::InvalidNft
    )]
    pub seller_nft_account: Account<'info, TokenAccount>,
    
    #[account(
        init,
        payer = seller,
        associated_token::mint = nft_mint,
        associated_token::authority = listing
    )]
    pub listing_nft_account: Account<'info, TokenAccount>,
    
    /// Metaplex metadata account for the NFT
    #[account(
        seeds = [
            b"metadata".as_ref(),
            mpl_token_metadata::ID.as_ref(),
            nft_mint.key().as_ref()
        ],
        bump,
        seeds::program = mpl_token_metadata::ID
    )]
    pub metadata: Account<'info, Metadata>,
    
    /// Optional: Collection metadata account
    /// CHECK: Validated in instruction if provided
    pub collection_metadata: Option<AccountInfo<'info>>,
    
    #[account(
        init_if_needed,
        payer = seller,
        space = UserProfile::LEN,
        seeds = [b"user_profile".as_ref(), seller.key().as_ref()],
        bump
    )]
    pub seller_profile: Account<'info, UserProfile>,
    
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

pub fn handler(
    ctx: Context<ListNft>,
    price: u64,
    expiry: i64,
    allow_offers: bool,
) -> Result<()> {
    let marketplace = &ctx.accounts.marketplace;
    let listing = &mut ctx.accounts.listing;
    let seller = &ctx.accounts.seller;
    let nft_mint = &ctx.accounts.nft_mint;
    let seller_nft_account = &ctx.accounts.seller_nft_account;
    let listing_nft_account = &ctx.accounts.listing_nft_account;
    let metadata = &ctx.accounts.metadata;
    let seller_profile = &mut ctx.accounts.seller_profile;
    
    let clock = Clock::get()?;
    let current_time = clock.unix_timestamp;
    
    // Validate inputs
    require!(price > 0, MarketplaceError::InvalidPrice);
    require!(expiry > current_time, MarketplaceError::InvalidExpiry);
    require!(
        expiry - current_time <= marketplace.max_listing_duration,
        MarketplaceError::ListingDurationTooLong
    );
    
    // Validate NFT metadata
    require!(
        metadata.mint == nft_mint.key(),
        MarketplaceError::InvalidMetadata
    );
    
    // Initialize user profile if needed
    if seller_profile.user == Pubkey::default() {
        seller_profile.user = seller.key();
        seller_profile.created_at = current_time;
        seller_profile.reputation = 500; // Start with neutral reputation
    }
    seller_profile.update_activity();
    
    // Determine collection if applicable
    let collection = if let Some(collection_metadata) = &ctx.accounts.collection_metadata {
        // Validate collection metadata if provided
        Some(collection_metadata.key())
    } else if let Some(collection_info) = &metadata.collection {
        Some(collection_info.key)
    } else {
        None
    };
    
    // Determine category based on metadata (simplified logic)
    let category = determine_nft_category(&metadata.name, &metadata.symbol)?;
    
    // Transfer NFT to listing escrow
    let transfer_ctx = CpiContext::new(
        ctx.accounts.token_program.to_account_info(),
        Transfer {
            from: seller_nft_account.to_account_info(),
            to: listing_nft_account.to_account_info(),
            authority: seller.to_account_info(),
        },
    );
    token::transfer(transfer_ctx, 1)?;
    
    // Initialize listing
    listing.seller = seller.key();
    listing.nft_mint = nft_mint.key();
    listing.nft_token_account = listing_nft_account.key();
    listing.price = price;
    listing.expiry = expiry;
    listing.allow_offers = allow_offers;
    listing.highest_offer = 0;
    listing.highest_bidder = Pubkey::default();
    listing.created_at = current_time;
    listing.status = ListingStatus::Active;
    listing.collection = collection;
    listing.category = category;
    
    emit!(NftListed {
        listing: listing.key(),
        seller: seller.key(),
        nft_mint: nft_mint.key(),
        price,
        expiry,
        allow_offers,
        collection,
        category,
        timestamp: current_time,
    });
    
    msg!("NFT listed: mint={}, price={}, expiry={}", nft_mint.key(), price, expiry);
    
    Ok(())
}

fn determine_nft_category(name: &str, symbol: &str) -> Result<u8> {
    // Simplified category determination based on name/symbol
    // In a real implementation, this could be more sophisticated
    let name_lower = name.to_lowercase();
    let symbol_lower = symbol.to_lowercase();
    
    if name_lower.contains("art") || symbol_lower.contains("art") {
        Ok(1) // Art
    } else if name_lower.contains("game") || name_lower.contains("gaming") {
        Ok(2) // Gaming
    } else if name_lower.contains("music") || name_lower.contains("audio") {
        Ok(3) // Music
    } else if name_lower.contains("pfp") || name_lower.contains("avatar") {
        Ok(4) // PFP/Avatar
    } else if name_lower.contains("util") || name_lower.contains("access") {
        Ok(5) // Utility
    } else {
        Ok(0) // Other/Uncategorized
    }
}