use crate::errors::MarketplaceError;
use crate::state::*;
use anchor_lang::prelude::*;

#[derive(Accounts)]
pub struct InitializeMarketplace<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,
    #[account(
        init,
        payer = admin,
        space = 8 + Marketplace::INIT_SPACE,
        seeds = [MARKETPLACE_SEED],
        bump
    )]
    pub marketplace: Account<'info, Marketplace>,
    pub system_program: Program<'info, System>,
}

pub fn handle_initialize_marketplace(
    ctx: Context<InitializeMarketplace>,
    fee_bps: u16,
    treasury: Pubkey,
) -> Result<()> {
    require!(fee_bps <= MAX_FEE_BPS, MarketplaceError::FeeTooHigh);
    let m = &mut ctx.accounts.marketplace;
    m.admin = ctx.accounts.admin.key();
    m.treasury = treasury;
    m.fee_bps = fee_bps;
    m.paused = false;
    m.total_volume = 0;
    m.total_sales = 0;
    m.bump = ctx.bumps.marketplace;
    Ok(())
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, Default)]
pub struct MarketplaceUpdate {
    pub fee_bps: Option<u16>,
    pub treasury: Option<Pubkey>,
    pub paused: Option<bool>,
    pub admin: Option<Pubkey>,
}

#[derive(Accounts)]
pub struct UpdateMarketplace<'info> {
    pub admin: Signer<'info>,
    #[account(mut, seeds = [MARKETPLACE_SEED], bump = marketplace.bump, has_one = admin)]
    pub marketplace: Account<'info, Marketplace>,
}

pub fn handle_update_marketplace(
    ctx: Context<UpdateMarketplace>,
    update: MarketplaceUpdate,
) -> Result<()> {
    let m = &mut ctx.accounts.marketplace;
    if let Some(fee_bps) = update.fee_bps {
        require!(fee_bps <= MAX_FEE_BPS, MarketplaceError::FeeTooHigh);
        m.fee_bps = fee_bps;
    }
    if let Some(treasury) = update.treasury {
        m.treasury = treasury;
    }
    if let Some(paused) = update.paused {
        m.paused = paused;
    }
    if let Some(admin) = update.admin {
        m.admin = admin;
    }
    Ok(())
}
