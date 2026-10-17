use crate::events::MetadataUpdated;
use crate::state::*;
use anchor_lang::prelude::*;
use anchor_lang::system_program::{self, Transfer};
use anchor_spl::compat::spl_token_metadata_interface::state::Field;
use anchor_spl::token_2022::Token2022;
use anchor_spl::token_interface::{self, Mint, TokenMetadataUpdateField};

#[derive(Accounts)]
pub struct UpdateNftUri<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(
        seeds = [COLLECTION_SEED, collection.authority.as_ref(), collection.name.as_bytes()],
        bump = collection.bump,
        has_one = authority
    )]
    pub collection: Account<'info, Collection>,
    #[account(
        seeds = [NFT_RECORD_SEED, mint.key().as_ref()],
        bump = nft_record.bump,
        has_one = collection,
        has_one = mint
    )]
    pub nft_record: Account<'info, NftRecord>,
    #[account(mut, mint::token_program = token_program)]
    pub mint: Box<InterfaceAccount<'info, Mint>>,
    pub token_program: Program<'info, Token2022>,
    pub system_program: Program<'info, System>,
}

/// Points an NFT at a new metadata document (e.g. after a reveal).
pub fn handle_update_nft_uri(ctx: Context<UpdateNftUri>, uri: String) -> Result<()> {
    let symbol = ctx.accounts.collection.symbol.clone();
    validate_metadata("placeholder", &symbol, &uri)?;

    // Conservatively fund the worst case (old URI kept + new URI added) so the
    // token program's realloc never fails for lack of rent.
    let mint_info = ctx.accounts.mint.to_account_info();
    let required = Rent::get()?.minimum_balance(mint_info.data_len() + uri.len());
    let top_up = required.saturating_sub(mint_info.lamports());
    if top_up > 0 {
        system_program::transfer(
            CpiContext::new(
                ctx.accounts.system_program.key(),
                Transfer {
                    from: ctx.accounts.authority.to_account_info(),
                    to: mint_info.clone(),
                },
            ),
            top_up,
        )?;
    }

    let collection = &ctx.accounts.collection;
    let bump = [collection.bump];
    let seeds: &[&[u8]] = &[
        COLLECTION_SEED,
        collection.authority.as_ref(),
        collection.name.as_bytes(),
        &bump,
    ];
    let signer = [seeds];
    token_interface::token_metadata_update_field(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.key(),
            TokenMetadataUpdateField {
                program_id: ctx.accounts.token_program.to_account_info(),
                metadata: mint_info,
                update_authority: collection.to_account_info(),
            },
            &signer,
        ),
        Field::Uri,
        uri.clone(),
    )?;

    emit!(MetadataUpdated {
        collection: collection.key(),
        mint: ctx.accounts.mint.key(),
        uri,
        timestamp: Clock::get()?.unix_timestamp,
    });
    Ok(())
}
