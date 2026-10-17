use anchor_lang::prelude::*;

#[event]
pub struct CollectionCreated {
    pub collection: Pubkey,
    pub authority: Pubkey,
    pub name: String,
    pub symbol: String,
    pub uri: String,
    pub royalty_bps: u16,
    pub max_supply: u64,
    pub timestamp: i64,
}

#[event]
pub struct NftMinted {
    pub collection: Pubkey,
    pub mint: Pubkey,
    pub recipient: Pubkey,
    pub index: u64,
    pub name: String,
    pub uri: String,
    pub timestamp: i64,
}

#[event]
pub struct MetadataUpdated {
    pub collection: Pubkey,
    pub mint: Pubkey,
    pub uri: String,
    pub timestamp: i64,
}
