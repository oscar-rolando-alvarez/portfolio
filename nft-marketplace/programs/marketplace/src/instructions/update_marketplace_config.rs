use anchor_lang::prelude::*;
use crate::{state::*, events::*, errors::*};

#[derive(Accounts)]
pub struct UpdateMarketplaceConfig<'info> {
    #[account(
        mut,
        seeds = [b"marketplace".as_ref()],
        bump,
        constraint = marketplace.is_admin(&admin.key()) @ MarketplaceError::NotAdmin
    )]
    pub marketplace: Account<'info, Marketplace>,
    
    pub admin: Signer<'info>,
}

pub fn handler(
    ctx: Context<UpdateMarketplaceConfig>,
    new_fee: Option<u16>,
    new_max_duration: Option<i64>,
    new_admin: Option<Pubkey>,
) -> Result<()> {
    let marketplace = &mut ctx.accounts.marketplace;
    let admin = &ctx.accounts.admin;
    
    let old_fee = marketplace.marketplace_fee;
    let old_max_duration = marketplace.max_listing_duration;
    
    if let Some(fee) = new_fee {
        marketplace.validate_fee(fee)?;
        marketplace.marketplace_fee = fee;
    }
    
    if let Some(duration) = new_max_duration {
        require!(
            duration >= 3600 && duration <= 31_536_000,
            MarketplaceError::InvalidExpiry
        );
        marketplace.max_listing_duration = duration;
    }
    
    if let Some(admin_key) = new_admin {
        marketplace.admin = admin_key;
    }
    
    emit!(MarketplaceConfigUpdated {
        admin: admin.key(),
        old_fee,
        new_fee: marketplace.marketplace_fee,
        old_max_duration,
        new_max_duration: marketplace.max_listing_duration,
        timestamp: Clock::get()?.unix_timestamp,
    });
    
    Ok(())
}