use anchor_lang::prelude::*;
use crate::state::*;

#[event]
pub struct CollectionCreated {
    pub collection: Pubkey,
    pub authority: Pubkey,
    pub collection_mint: Pubkey,
    pub name: String,
    pub symbol: String,
    pub uri: String,
    pub royalty_percentage: u16,
    pub max_supply: Option<u64>,
    pub timestamp: i64,
}

#[event]
pub struct CollectionUpdated {
    pub collection: Pubkey,
    pub authority: Pubkey,
    pub name: Option<String>,
    pub symbol: Option<String>,
    pub uri: Option<String>,
    pub royalty_percentage: Option<u16>,
    pub timestamp: i64,
}

#[event]
pub struct NftMinted {
    pub mint: Pubkey,
    pub metadata: Pubkey,
    pub collection: Option<Pubkey>,
    pub creator: Pubkey,
    pub recipient: Pubkey,
    pub name: String,
    pub symbol: String,
    pub uri: String,
    pub rarity_score: u16,
    pub mint_number: u64,
    pub timestamp: i64,
}

#[event]
pub struct NftBurned {
    pub mint: Pubkey,
    pub metadata: Pubkey,
    pub collection: Option<Pubkey>,
    pub owner: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct MetadataUpdated {
    pub mint: Pubkey,
    pub metadata: Pubkey,
    pub authority: Pubkey,
    pub name: Option<String>,
    pub symbol: Option<String>,
    pub uri: Option<String>,
    pub timestamp: i64,
}

#[event]
pub struct CollectionVerified {
    pub collection: Pubkey,
    pub nft_mint: Pubkey,
    pub authority: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct BatchMintCompleted {
    pub collection: Pubkey,
    pub authority: Pubkey,
    pub mints_created: Vec<Pubkey>,
    pub batch_size: u32,
    pub timestamp: i64,
}

#[event]
pub struct CandyMachineCreated {
    pub candy_machine: Pubkey,
    pub authority: Pubkey,
    pub collection: Pubkey,
    pub price: u64,
    pub items_available: u64,
    pub go_live_date: i64,
    pub timestamp: i64,
}

#[event]
pub struct CandyMachineMint {
    pub candy_machine: Pubkey,
    pub mint: Pubkey,
    pub buyer: Pubkey,
    pub price: u64,
    pub items_redeemed: u64,
    pub timestamp: i64,
}

#[event]
pub struct RoyaltyPaid {
    pub nft_mint: Pubkey,
    pub collection: Pubkey,
    pub sale_price: u64,
    pub royalty_amount: u64,
    pub recipient: Pubkey,
    pub seller: Pubkey,
    pub buyer: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct TraitsUpdated {
    pub nft_mint: Pubkey,
    pub metadata: Pubkey,
    pub authority: Pubkey,
    pub new_traits: Vec<TraitAttribute>,
    pub old_rarity_score: u16,
    pub new_rarity_score: u16,
    pub timestamp: i64,
}

#[event]
pub struct RarityRankUpdated {
    pub nft_mint: Pubkey,
    pub collection: Pubkey,
    pub old_rank: Option<u32>,
    pub new_rank: u32,
    pub rarity_score: u16,
    pub total_supply: u64,
    pub timestamp: i64,
}