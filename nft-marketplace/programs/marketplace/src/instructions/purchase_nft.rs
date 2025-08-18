use anchor_lang::prelude::*;
use anchor_lang::solana_program::program::invoke;
use anchor_lang::solana_program::system_instruction;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};
use crate::{state::*, events::*, errors::*};

#[derive(Accounts)]
pub struct PurchaseNft<'info> {
    #[account(
        mut,
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
        constraint = listing.is_active() @ MarketplaceError::ListingNotActive,
        constraint = listing.seller != buyer.key() @ MarketplaceError::CannotPurchaseOwnNft
    )]
    pub listing: Account<'info, Listing>,
    
    #[account(mut)]
    pub buyer: Signer<'info>,
    
    /// CHECK: This is the seller account, validated through listing
    #[account(
        mut,
        constraint = seller.key() == listing.seller
    )]
    pub seller: AccountInfo<'info>,
    
    #[account(
        mut,
        associated_token::mint = listing.nft_mint,
        associated_token::authority = listing
    )]
    pub listing_nft_account: Account<'info, TokenAccount>,
    
    #[account(
        init_if_needed,
        payer = buyer,
        associated_token::mint = listing.nft_mint,
        associated_token::authority = buyer
    )]
    pub buyer_nft_account: Account<'info, TokenAccount>,
    
    /// CHECK: Treasury account for marketplace fees
    #[account(
        mut,
        constraint = treasury.key() == marketplace.treasury @ MarketplaceError::InvalidTreasuryAccount
    )]
    pub treasury: AccountInfo<'info>,
    
    #[account(
        init_if_needed,
        payer = buyer,
        space = UserProfile::LEN,
        seeds = [b"user_profile".as_ref(), buyer.key().as_ref()],
        bump
    )]
    pub buyer_profile: Account<'info, UserProfile>,
    
    #[account(
        mut,
        seeds = [b"user_profile".as_ref(), seller.key().as_ref()],
        bump
    )]
    pub seller_profile: Account<'info, UserProfile>,
    
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, anchor_spl::associated_token::AssociatedToken>,
    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<PurchaseNft>) -> Result<()> {
    let marketplace = &mut ctx.accounts.marketplace;
    let listing = &mut ctx.accounts.listing;
    let buyer = &ctx.accounts.buyer;
    let seller = &ctx.accounts.seller;
    let listing_nft_account = &ctx.accounts.listing_nft_account;
    let buyer_nft_account = &ctx.accounts.buyer_nft_account;
    let treasury = &ctx.accounts.treasury;
    let buyer_profile = &mut ctx.accounts.buyer_profile;
    let seller_profile = &mut ctx.accounts.seller_profile;
    
    let price = listing.price;
    let marketplace_fee_amount = (price as u128)
        .checked_mul(marketplace.marketplace_fee as u128)
        .and_then(|x| x.checked_div(10000))
        .and_then(|x| x.try_into().ok())
        .ok_or(MarketplaceError::ArithmeticOverflow)?;
    
    let seller_receives = price
        .checked_sub(marketplace_fee_amount)
        .ok_or(MarketplaceError::ArithmeticOverflow)?;
    
    // Validate buyer has sufficient funds
    require!(
        buyer.lamports() >= price,
        MarketplaceError::InsufficientFunds
    );
    
    // Transfer payment to seller
    invoke(
        &system_instruction::transfer(buyer.key, seller.key, seller_receives),
        &[
            buyer.to_account_info(),
            seller.to_account_info(),
            ctx.accounts.system_program.to_account_info(),
        ],
    )?;
    
    // Transfer marketplace fee to treasury
    if marketplace_fee_amount > 0 {
        invoke(
            &system_instruction::transfer(buyer.key, treasury.key, marketplace_fee_amount),
            &[
                buyer.to_account_info(),
                treasury.to_account_info(),
                ctx.accounts.system_program.to_account_info(),
            ],
        )?;
    }
    
    // Transfer NFT to buyer
    let listing_key = listing.key();
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
            to: buyer_nft_account.to_account_info(),
            authority: listing.to_account_info(),
        },
        signer_seeds,
    );
    token::transfer(transfer_ctx, 1)?;
    
    // Update marketplace stats
    marketplace.total_volume = marketplace.total_volume
        .checked_add(price)
        .ok_or(MarketplaceError::ArithmeticOverflow)?;
    marketplace.total_sales = marketplace.total_sales
        .checked_add(1)
        .ok_or(MarketplaceError::ArithmeticOverflow)?;
    
    // Update user profiles
    if buyer_profile.user == Pubkey::default() {
        buyer_profile.user = buyer.key();
        buyer_profile.created_at = Clock::get()?.unix_timestamp;
        buyer_profile.reputation = 500;
    }
    buyer_profile.update_purchase_stats(price);
    seller_profile.update_sale_stats(price);
    
    // Update listing status
    listing.status = ListingStatus::Sold;
    
    emit!(NftPurchased {
        listing: listing_key,
        seller: seller.key(),
        buyer: buyer.key(),
        nft_mint: listing.nft_mint,
        price,
        marketplace_fee: marketplace_fee_amount,
        seller_receives,
        timestamp: Clock::get()?.unix_timestamp,
    });
    
    msg!("NFT purchased: buyer={}, seller={}, price={}", buyer.key(), seller.key(), price);
    
    Ok(())
}