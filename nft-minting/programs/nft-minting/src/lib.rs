//! Token-2022 NFT minting.
//!
//! Collections are program PDAs; every NFT is a Token-2022 mint with the
//! metadata-pointer and token-metadata extensions, so name, symbol, URI and
//! extra fields (collection, royalty) live on-chain inside the mint account
//! with no external metadata program. After minting one token to the
//! recipient the mint authority is removed, fixing supply at one.

use anchor_lang::prelude::*;

pub mod errors;
pub mod events;
pub mod instructions;
pub mod state;

use instructions::*;

declare_id!("6XjqxHv3WqK5VZL3KhuUGiW7ad51Ppu9qxg8bxLBxivr");

#[program]
pub mod nft_minting {
    use super::*;

    pub fn create_collection(
        ctx: Context<CreateCollection>,
        name: String,
        symbol: String,
        uri: String,
        royalty_bps: u16,
        max_supply: u64,
    ) -> Result<()> {
        handle_create_collection(ctx, name, symbol, uri, royalty_bps, max_supply)
    }

    /// Mints a 1-of-1 Token-2022 NFT into a collection (collection authority only).
    pub fn mint_nft(ctx: Context<MintNft>, name: String, uri: String) -> Result<()> {
        handle_mint_nft(ctx, name, uri)
    }

    /// Updates the metadata URI of an NFT in the collection (collection authority only).
    pub fn update_nft_uri(ctx: Context<UpdateNftUri>, uri: String) -> Result<()> {
        handle_update_nft_uri(ctx, uri)
    }
}
