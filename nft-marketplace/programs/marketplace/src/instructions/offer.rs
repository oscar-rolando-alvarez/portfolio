use crate::errors::MarketplaceError;
use crate::escrow::{Escrow, pay};
use crate::events::{OfferCancelled, OfferMade, Sold};
use crate::state::*;
use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token_interface::{Mint, TokenAccount, TokenInterface};

#[derive(Accounts)]
pub struct MakeOffer<'info> {
    #[account(mut)]
    pub buyer: Signer<'info>,
    #[account(seeds = [MARKETPLACE_SEED], bump = marketplace.bump)]
    pub marketplace: Account<'info, Marketplace>,
    pub mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(
        init,
        payer = buyer,
        space = 8 + Offer::INIT_SPACE,
        seeds = [OFFER_SEED, mint.key().as_ref(), buyer.key().as_ref()],
        bump
    )]
    pub offer: Account<'info, Offer>,
    pub system_program: Program<'info, System>,
}

/// Escrows `amount` lamports in the offer account until it is accepted or cancelled.
pub fn handle_make_offer(ctx: Context<MakeOffer>, amount: u64, expires_at: i64) -> Result<()> {
    require!(!ctx.accounts.marketplace.paused, MarketplaceError::Paused);
    require!(amount > 0, MarketplaceError::ZeroPrice);
    let now = Clock::get()?.unix_timestamp;
    require!(expires_at > now, MarketplaceError::InvalidExpiry);

    pay(
        &ctx.accounts.system_program.to_account_info(),
        &ctx.accounts.buyer.to_account_info(),
        &ctx.accounts.offer.to_account_info(),
        amount,
    )?;

    let offer = &mut ctx.accounts.offer;
    offer.buyer = ctx.accounts.buyer.key();
    offer.mint = ctx.accounts.mint.key();
    offer.amount = amount;
    offer.expires_at = expires_at;
    offer.bump = ctx.bumps.offer;
    emit!(OfferMade {
        mint: offer.mint,
        buyer: offer.buyer,
        amount,
        expires_at,
    });
    Ok(())
}

#[derive(Accounts)]
pub struct CancelOffer<'info> {
    #[account(mut)]
    pub buyer: Signer<'info>,
    /// Closing returns both the escrowed lamports and the rent to the buyer.
    #[account(mut, close = buyer, has_one = buyer)]
    pub offer: Account<'info, Offer>,
}

pub fn handle_cancel_offer(ctx: Context<CancelOffer>) -> Result<()> {
    emit!(OfferCancelled {
        mint: ctx.accounts.offer.mint,
        buyer: ctx.accounts.buyer.key(),
    });
    Ok(())
}

#[derive(Accounts)]
pub struct AcceptOffer<'info> {
    #[account(mut)]
    pub seller: Signer<'info>,
    #[account(mut, seeds = [MARKETPLACE_SEED], bump = marketplace.bump, has_one = treasury)]
    pub marketplace: Account<'info, Marketplace>,
    #[account(mut)]
    pub treasury: SystemAccount<'info>,
    #[account(
        mut,
        close = seller,
        seeds = [LISTING_SEED, mint.key().as_ref()],
        bump = listing.bump,
        has_one = seller,
        has_one = mint
    )]
    pub listing: Account<'info, Listing>,
    #[account(
        mut,
        close = buyer,
        seeds = [OFFER_SEED, mint.key().as_ref(), buyer.key().as_ref()],
        bump = offer.bump,
        has_one = buyer,
        has_one = mint
    )]
    pub offer: Account<'info, Offer>,
    #[account(mut)]
    pub buyer: SystemAccount<'info>,
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
        payer = seller,
        associated_token::mint = mint,
        associated_token::authority = buyer,
        associated_token::token_program = token_program
    )]
    pub buyer_token_account: Box<InterfaceAccount<'info, TokenAccount>>,
    pub token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

pub fn handle_accept_offer(ctx: Context<AcceptOffer>) -> Result<()> {
    let marketplace = &mut ctx.accounts.marketplace;
    require!(!marketplace.paused, MarketplaceError::Paused);
    let offer = &ctx.accounts.offer;
    let now = Clock::get()?.unix_timestamp;
    require!(now < offer.expires_at, MarketplaceError::OfferExpired);

    let amount = offer.amount;
    let fee = marketplace.fee_for(amount);
    let listing = &ctx.accounts.listing;
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

    // The offer account is owned by this program, so lamports can be moved
    // directly; this happens after the CPIs to keep runtime balance checks valid.
    offer.sub_lamports(amount)?;
    ctx.accounts.treasury.add_lamports(fee)?;
    ctx.accounts.seller.add_lamports(amount - fee)?;

    marketplace.record_sale(amount);
    emit!(Sold {
        mint: listing.mint,
        seller: listing.seller,
        buyer: offer.buyer,
        price: amount,
        fee,
        via_offer: true,
    });
    Ok(())
}
