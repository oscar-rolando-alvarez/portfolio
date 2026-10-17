use crate::errors::MintingError;
use crate::events::NftMinted;
use crate::state::*;
use anchor_lang::prelude::*;
use anchor_lang::system_program::{self, Transfer};
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::compat::spl_token_metadata_interface::state::Field;
use anchor_spl::token_2022::spl_token_2022::instruction::AuthorityType;
use anchor_spl::token_2022::{self, SetAuthority, Token2022};
use anchor_spl::token_interface::{
    self, Mint, MintTo, TokenAccount, TokenMetadataInitialize, TokenMetadataUpdateField,
};

#[derive(Accounts)]
pub struct MintNft<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(
        mut,
        seeds = [COLLECTION_SEED, collection.authority.as_ref(), collection.name.as_bytes()],
        bump = collection.bump,
        has_one = authority
    )]
    pub collection: Account<'info, Collection>,
    /// Fresh keypair for the NFT mint. The metadata pointer points at the mint
    /// itself, so all metadata lives inside this single account.
    #[account(
        init,
        signer,
        payer = authority,
        mint::decimals = 0,
        mint::authority = collection,
        mint::token_program = token_program,
        extensions::metadata_pointer::authority = collection,
        extensions::metadata_pointer::metadata_address = mint,
    )]
    pub mint: Box<InterfaceAccount<'info, Mint>>,
    /// CHECK: any wallet may receive the NFT; only used as the ATA owner.
    pub recipient: UncheckedAccount<'info>,
    #[account(
        init,
        payer = authority,
        associated_token::mint = mint,
        associated_token::authority = recipient,
        associated_token::token_program = token_program
    )]
    pub recipient_token_account: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(
        init,
        payer = authority,
        space = 8 + NftRecord::INIT_SPACE,
        seeds = [NFT_RECORD_SEED, mint.key().as_ref()],
        bump
    )]
    pub nft_record: Account<'info, NftRecord>,
    pub token_program: Program<'info, Token2022>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

pub fn handle_mint_nft(ctx: Context<MintNft>, name: String, uri: String) -> Result<()> {
    let collection = &ctx.accounts.collection;
    require!(collection.can_mint(), MintingError::MaxSupplyReached);
    let symbol = collection.symbol.clone();
    validate_metadata(&name, &symbol, &uri)?;

    let collection_key = collection.key().to_string();
    let royalty = collection.royalty_bps.to_string();
    let extra = [
        (COLLECTION_KEY, collection_key.as_str()),
        (ROYALTY_KEY, royalty.as_str()),
    ];

    // Pre-fund the rent for the variable-length metadata the token program
    // will realloc into the mint account.
    let mint_info = ctx.accounts.mint.to_account_info();
    let target_len = mint_info.data_len() + token_metadata_space(&name, &symbol, &uri, &extra);
    let required = Rent::get()?.minimum_balance(target_len);
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

    let authority_key = collection.authority;
    let bump = [collection.bump];
    let seeds: &[&[u8]] = &[
        COLLECTION_SEED,
        authority_key.as_ref(),
        collection.name.as_bytes(),
        &bump,
    ];
    let signer = [seeds];
    let token_program = ctx.accounts.token_program.key();
    let token_program_info = ctx.accounts.token_program.to_account_info();
    let collection_info = collection.to_account_info();

    token_interface::token_metadata_initialize(
        CpiContext::new_with_signer(
            token_program,
            TokenMetadataInitialize {
                program_id: token_program_info.clone(),
                metadata: mint_info.clone(),
                update_authority: collection_info.clone(),
                mint_authority: collection_info.clone(),
                mint: mint_info.clone(),
            },
            &signer,
        ),
        name.clone(),
        symbol,
        uri.clone(),
    )?;
    for (key, value) in extra {
        token_interface::token_metadata_update_field(
            CpiContext::new_with_signer(
                token_program,
                TokenMetadataUpdateField {
                    program_id: token_program_info.clone(),
                    metadata: mint_info.clone(),
                    update_authority: collection_info.clone(),
                },
                &signer,
            ),
            Field::Key(key.to_string()),
            value.to_string(),
        )?;
    }

    token_interface::mint_to(
        CpiContext::new_with_signer(
            token_program,
            MintTo {
                mint: mint_info.clone(),
                to: ctx.accounts.recipient_token_account.to_account_info(),
                authority: collection_info.clone(),
            },
            &signer,
        ),
        1,
    )?;
    // Fix the supply at exactly one token.
    token_2022::set_authority(
        CpiContext::new_with_signer(
            token_program,
            SetAuthority {
                current_authority: collection_info,
                account_or_mint: mint_info,
            },
            &signer,
        ),
        AuthorityType::MintTokens,
        None,
    )?;

    let now = Clock::get()?.unix_timestamp;
    let collection = &mut ctx.accounts.collection;
    let index = collection.minted;
    collection.minted = index.checked_add(1).ok_or(MintingError::MathOverflow)?;

    let record = &mut ctx.accounts.nft_record;
    record.collection = collection.key();
    record.mint = ctx.accounts.mint.key();
    record.index = index;
    record.minted_at = now;
    record.bump = ctx.bumps.nft_record;

    emit!(NftMinted {
        collection: record.collection,
        mint: record.mint,
        recipient: ctx.accounts.recipient.key(),
        index,
        name,
        uri,
        timestamp: now,
    });
    Ok(())
}
