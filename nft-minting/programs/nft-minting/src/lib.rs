use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Mint};
use anchor_spl::associated_token::AssociatedToken;
use mpl_token_metadata::accounts::{Metadata, MasterEdition};
use mpl_token_metadata::types::{DataV2, CollectionDetails, CreatorV2};

declare_id!("BPFLoaderUpgradeab1e11111111111111111111111");

pub mod errors;
pub mod events;
pub mod instructions;
pub mod state;
pub mod utils;

use errors::*;
use events::*;
use instructions::*;
use state::*;

#[program]
pub mod nft_minting {
    use super::*;

    /// Initialize a new collection
    pub fn create_collection(
        ctx: Context<CreateCollection>,
        name: String,
        symbol: String,
        uri: String,
        royalty_percentage: u16,
        max_supply: Option<u64>,
    ) -> Result<()> {
        instructions::create_collection::handler(ctx, name, symbol, uri, royalty_percentage, max_supply)
    }

    /// Update collection metadata (creator only)
    pub fn update_collection(
        ctx: Context<UpdateCollection>,
        name: Option<String>,
        symbol: Option<String>,
        uri: Option<String>,
        royalty_percentage: Option<u16>,
    ) -> Result<()> {
        instructions::update_collection::handler(ctx, name, symbol, uri, royalty_percentage)
    }

    /// Mint a new NFT with custom metadata
    pub fn mint_nft(
        ctx: Context<MintNft>,
        name: String,
        symbol: String,
        uri: String,
        traits: Vec<TraitAttribute>,
        rarity_score: u16,
    ) -> Result<()> {
        instructions::mint_nft::handler(ctx, name, symbol, uri, traits, rarity_score)
    }

    /// Mint NFT to collection
    pub fn mint_to_collection(
        ctx: Context<MintToCollection>,
        name: String,
        symbol: String,
        uri: String,
        traits: Vec<TraitAttribute>,
        rarity_score: u16,
    ) -> Result<()> {
        instructions::mint_to_collection::handler(ctx, name, symbol, uri, traits, rarity_score)
    }

    /// Batch mint multiple NFTs
    pub fn batch_mint(
        ctx: Context<BatchMint>,
        mint_data: Vec<BatchMintData>,
    ) -> Result<()> {
        instructions::batch_mint::handler(ctx, mint_data)
    }

    /// Verify NFT in collection (collection authority only)
    pub fn verify_collection(ctx: Context<VerifyCollection>) -> Result<()> {
        instructions::verify_collection::handler(ctx)
    }

    /// Update NFT metadata (creator only)
    pub fn update_nft_metadata(
        ctx: Context<UpdateNftMetadata>,
        name: Option<String>,
        symbol: Option<String>,
        uri: Option<String>,
        traits: Option<Vec<TraitAttribute>>,
    ) -> Result<()> {
        instructions::update_nft_metadata::handler(ctx, name, symbol, uri, traits)
    }

    /// Burn an NFT
    pub fn burn_nft(ctx: Context<BurnNft>) -> Result<()> {
        instructions::burn_nft::handler(ctx)
    }

    /// Transfer NFT ownership with royalty enforcement
    pub fn transfer_with_royalties(
        ctx: Context<TransferWithRoyalties>,
        sale_price: u64,
    ) -> Result<()> {
        instructions::transfer_with_royalties::handler(ctx, sale_price)
    }

    /// Create candy machine for automated minting
    pub fn create_candy_machine(
        ctx: Context<CreateCandyMachine>,
        price: u64,
        go_live_date: i64,
        end_settings: Option<EndSettings>,
        whitelist_mint_settings: Option<WhitelistMintSettings>,
    ) -> Result<()> {
        instructions::create_candy_machine::handler(ctx, price, go_live_date, end_settings, whitelist_mint_settings)
    }

    /// Mint from candy machine
    pub fn mint_from_candy_machine(ctx: Context<MintFromCandyMachine>) -> Result<()> {
        instructions::mint_from_candy_machine::handler(ctx)
    }
}