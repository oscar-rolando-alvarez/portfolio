use crate::errors::MarketplaceError;
use crate::escrow::{Escrow, pay};
use crate::events::{Delisted, Listed, Sold};
use crate::state::*;
use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token_interface::{self, Mint, TokenAccount, TokenInterface, TransferChecked};

#[derive(Accounts)]
pub struct ListNft<'info> {
    #[account(mut)]
    pub seller: Signer<'info>,
    #[account(seeds = [MARKETPLACE_SEED], bump = marketplace.bump)]
    pub marketplace: Account<'info, Marketplace>,
    #[account(
        mint::token_program = token_program,
        constraint = mint.decimals == 0 && mint.supply == 1 @ MarketplaceError::NotAnNft
    )]
    pub mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(mut, token::mint = mint, token::authority = seller)]
    pub seller_token_account: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(
        init,
        payer = seller,
        space = 8 + Listing::INIT_SPACE,
        seeds = [LISTING_SEED, mint.key().as_ref()],
        bump
    )]
    pub listing: Account<'info, Listing>,
    #[account(
        init,
        payer = seller,
        associated_token::mint = mint,
        associated_token::authority = listing,
        associated_token::token_program = token_program
    )]
    pub vault: Box<InterfaceAccount<'info, TokenAccount>>,
    pub token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

pub fn handle_list_nft(ctx: Context<ListNft>, price: u64, expires_at: i64) -> Result<()> {
    require!(!ctx.accounts.marketplace.paused, MarketplaceError::Paused);
    require!(price > 0, MarketplaceError::ZeroPrice);
    let now = Clock::get()?.unix_timestamp;
    require!(
        expires_at == 0 || expires_at > now,
        MarketplaceError::InvalidExpiry
    );

    token_interface::transfer_checked(
        CpiContext::new(
            ctx.accounts.token_program.key(),
            TransferChecked {
                from: ctx.accounts.seller_token_account.to_account_info(),
                mint: ctx.accounts.mint.to_account_info(),
                to: ctx.accounts.vault.to_account_info(),
                authority: ctx.accounts.seller.to_account_info(),
            },
        ),
        1,
        0,
    )?;

    let listing = &mut ctx.accounts.listing;
    listing.seller = ctx.accounts.seller.key();
    listing.mint = ctx.accounts.mint.key();
    listing.price = price;
    listing.expires_at = expires_at;
    listing.created_at = now;
    listing.bump = ctx.bumps.listing;

    emit!(Listed {
        mint: listing.mint,
        seller: listing.seller,
        price,
        expires_at,
    });
    Ok(())
}

#[derive(Accounts)]
pub struct UpdateListing<'info> {
    pub seller: Signer<'info>,
    #[account(mut, has_one = seller)]
    pub listing: Account<'info, Listing>,
}

pub fn handle_update_listing(
    ctx: Context<UpdateListing>,
    price: u64,
    expires_at: i64,
) -> Result<()> {
    require!(price > 0, MarketplaceError::ZeroPrice);
    let now = Clock::get()?.unix_timestamp;
    require!(
        expires_at == 0 || expires_at > now,
        MarketplaceError::InvalidExpiry
    );
    let listing = &mut ctx.accounts.listing;
    listing.price = price;
    listing.expires_at = expires_at;
    emit!(Listed {
        mint: listing.mint,
        seller: listing.seller,
        price,
        expires_at,
    });
    Ok(())
}

#[derive(Accounts)]
pub struct DelistNft<'info> {
    #[account(mut)]
    pub seller: Signer<'info>,
    #[account(
        mut,
        close = seller,
        seeds = [LISTING_SEED, mint.key().as_ref()],
        bump = listing.bump,
        has_one = seller,
        has_one = mint
    )]
    pub listing: Account<'info, Listing>,
    #[account(mint::token_program = token_program)]
    pub mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = listing,
        associated_token::token_program = token_program
    )]
    pub vault: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(mut, token::mint = mint, token::authority = seller)]
    pub seller_token_account: Box<InterfaceAccount<'info, TokenAccount>>,
    pub token_program: Interface<'info, TokenInterface>,
}

pub fn handle_delist_nft(ctx: Context<DelistNft>) -> Result<()> {
    Escrow {
        token_program: &ctx.accounts.token_program.to_account_info(),
        mint: &ctx.accounts.mint.to_account_info(),
        vault: &ctx.accounts.vault.to_account_info(),
        listing: &ctx.accounts.listing.to_account_info(),
        listing_bump: ctx.accounts.listing.bump,
    }
    .release(
        &ctx.accounts.seller_token_account.to_account_info(),
        &ctx.accounts.seller.to_account_info(),
    )?;
    emit!(Delisted {
        mint: ctx.accounts.mint.key(),
        seller: ctx.accounts.seller.key(),
    });
    Ok(())
}

#[derive(Accounts)]
pub struct PurchaseNft<'info> {
    #[account(mut)]
    pub buyer: Signer<'info>,
    #[account(mut, address = listing.seller)]
    pub seller: SystemAccount<'info>,
    #[account(mut, seeds = [MARKETPLACE_SEED], bump = marketplace.bump, has_one = treasury)]
    pub marketplace: Account<'info, Marketplace>,
    #[account(mut)]
    pub treasury: SystemAccount<'info>,
    #[account(
        mut,
        close = seller,
        seeds = [LISTING_SEED, mint.key().as_ref()],
        bump = listing.bump,
        has_one = mint
    )]
    pub listing: Account<'info, Listing>,
    #[account(mint::token_program = token_program)]
    pub mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = listing,
        associated_token::token_program = token_program
    )]
    pub vault: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(
        init_if_needed,
        payer = buyer,
        associated_token::mint = mint,
        associated_token::authority = buyer,
        associated_token::token_program = token_program
    )]
    pub buyer_token_account: Box<InterfaceAccount<'info, TokenAccount>>,
    pub token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

/// Buys a listed NFT. `max_price` protects the buyer against the seller
/// raising the price between signing and execution.
pub fn handle_purchase_nft(ctx: Context<PurchaseNft>, max_price: u64) -> Result<()> {
    let marketplace = &mut ctx.accounts.marketplace;
    require!(!marketplace.paused, MarketplaceError::Paused);
    let listing = &ctx.accounts.listing;
    let now = Clock::get()?.unix_timestamp;
    require!(!listing.is_expired(now), MarketplaceError::ListingExpired);
    require!(
        listing.price <= max_price,
        MarketplaceError::PriceAboveMaximum
    );

    let price = listing.price;
    let fee = marketplace.fee_for(price);
    let system_program = ctx.accounts.system_program.to_account_info();
    let buyer = ctx.accounts.buyer.to_account_info();
    pay(
        &system_program,
        &buyer,
        &ctx.accounts.treasury.to_account_info(),
        fee,
    )?;
    pay(
        &system_program,
        &buyer,
        &ctx.accounts.seller.to_account_info(),
        price - fee,
    )?;

    Escrow {
        token_program: &ctx.accounts.token_program.to_account_info(),
        mint: &ctx.accounts.mint.to_account_info(),
        vault: &ctx.accounts.vault.to_account_info(),
        listing: &listing.to_account_info(),
        listing_bump: listing.bump,
    }
    .release(
        &ctx.accounts.buyer_token_account.to_account_info(),
        &ctx.accounts.seller.to_account_info(),
    )?;

    marketplace.record_sale(price);
    emit!(Sold {
        mint: listing.mint,
        seller: listing.seller,
        buyer: ctx.accounts.buyer.key(),
        price,
        fee,
        via_offer: false,
    });
    Ok(())
}
