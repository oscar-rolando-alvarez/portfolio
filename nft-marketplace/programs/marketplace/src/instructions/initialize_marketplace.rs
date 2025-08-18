use anchor_lang::prelude::*;
use crate::{state::*, events::*, errors::*};

#[derive(Accounts)]
pub struct InitializeMarketplace<'info> {
    #[account(
        init,
        payer = admin,
        space = Marketplace::LEN,
        seeds = [b"marketplace".as_ref()],
        bump
    )]
    pub marketplace: Account<'info, Marketplace>,
    
    #[account(mut)]
    pub admin: Signer<'info>,
    
    /// Treasury account for collecting marketplace fees
    /// CHECK: This is a simple account that will receive SOL
    pub treasury: AccountInfo<'info>,
    
    pub system_program: Program<'info, System>,
}

pub fn handler(
    ctx: Context<InitializeMarketplace>,
    marketplace_fee: u16,
    max_listing_duration: i64,
) -> Result<()> {
    let marketplace = &mut ctx.accounts.marketplace;
    let admin = &ctx.accounts.admin;
    let treasury = &ctx.accounts.treasury;
    
    // Validate fee (max 10%)
    require!(marketplace_fee <= 1000, MarketplaceError::FeeTooHigh);
    
    // Validate max listing duration (min 1 hour, max 1 year)
    require!(
        max_listing_duration >= 3600 && max_listing_duration <= 31_536_000,
        MarketplaceError::InvalidExpiry
    );
    
    marketplace.admin = admin.key();
    marketplace.marketplace_fee = marketplace_fee;
    marketplace.max_listing_duration = max_listing_duration;
    marketplace.is_paused = false;
    marketplace.treasury = treasury.key();
    marketplace.total_volume = 0;
    marketplace.total_listings = 0;
    marketplace.total_sales = 0;
    marketplace.version = 1;
    
    emit!(MarketplaceInitialized {
        admin: admin.key(),
        marketplace_fee,
        max_listing_duration,
        treasury: treasury.key(),
        timestamp: Clock::get()?.unix_timestamp,
    });
    
    msg!("Marketplace initialized with fee: {}bp, max duration: {}s", marketplace_fee, max_listing_duration);
    
    Ok(())
}