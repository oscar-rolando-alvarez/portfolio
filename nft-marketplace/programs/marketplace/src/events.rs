use anchor_lang::prelude::*;

#[event]
pub struct Listed {
    pub mint: Pubkey,
    pub seller: Pubkey,
    pub price: u64,
    pub expires_at: i64,
}

#[event]
pub struct Delisted {
    pub mint: Pubkey,
    pub seller: Pubkey,
}

#[event]
pub struct Sold {
    pub mint: Pubkey,
    pub seller: Pubkey,
    pub buyer: Pubkey,
    pub price: u64,
    pub fee: u64,
    pub via_offer: bool,
}

#[event]
pub struct OfferMade {
    pub mint: Pubkey,
    pub buyer: Pubkey,
    pub amount: u64,
    pub expires_at: i64,
}

#[event]
pub struct OfferCancelled {
    pub mint: Pubkey,
    pub buyer: Pubkey,
}
