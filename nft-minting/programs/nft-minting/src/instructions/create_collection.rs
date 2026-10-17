use crate::errors::MintingError;
use crate::events::CollectionCreated;
use crate::state::*;
use anchor_lang::prelude::*;

#[derive(Accounts)]
#[instruction(name: String, symbol: String, uri: String, royalty_bps: u16, max_supply: u64)]
pub struct CreateCollection<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(
        init,
        payer = authority,
        space = 8 + Collection::INIT_SPACE,
        seeds = [COLLECTION_SEED, authority.key().as_ref(), name.as_bytes()],
        bump
    )]
    pub collection: Account<'info, Collection>,
    pub system_program: Program<'info, System>,
}

pub fn handle_create_collection(
    ctx: Context<CreateCollection>,
    name: String,
    symbol: String,
    uri: String,
    royalty_bps: u16,
    max_supply: u64,
) -> Result<()> {
    validate_metadata(&name, &symbol, &uri)?;
    require!(royalty_bps <= MAX_ROYALTY_BPS, MintingError::InvalidRoyalty);

    let now = Clock::get()?.unix_timestamp;
    let collection = &mut ctx.accounts.collection;
    collection.authority = ctx.accounts.authority.key();
    collection.name = name;
    collection.symbol = symbol;
    collection.uri = uri;
    collection.royalty_bps = royalty_bps;
    collection.max_supply = max_supply;
    collection.minted = 0;
    collection.created_at = now;
    collection.bump = ctx.bumps.collection;

    emit!(CollectionCreated {
        collection: collection.key(),
        authority: collection.authority,
        name: collection.name.clone(),
        symbol: collection.symbol.clone(),
        uri: collection.uri.clone(),
        royalty_bps,
        max_supply,
        timestamp: now,
    });
    Ok(())
}
