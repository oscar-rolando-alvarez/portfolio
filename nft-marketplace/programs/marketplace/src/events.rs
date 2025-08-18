use anchor_lang::prelude::*;

#[event]
pub struct MarketplaceInitialized {
    pub admin: Pubkey,
    pub marketplace_fee: u16,
    pub max_listing_duration: i64,
    pub treasury: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct MarketplaceConfigUpdated {
    pub admin: Pubkey,
    pub old_fee: u16,
    pub new_fee: u16,
    pub old_max_duration: i64,
    pub new_max_duration: i64,
    pub timestamp: i64,
}

#[event]
pub struct NftListed {
    pub listing: Pubkey,
    pub seller: Pubkey,
    pub nft_mint: Pubkey,
    pub price: u64,
    pub expiry: i64,
    pub allow_offers: bool,
    pub collection: Option<Pubkey>,
    pub category: u8,
    pub timestamp: i64,
}

#[event]
pub struct ListingUpdated {
    pub listing: Pubkey,
    pub seller: Pubkey,
    pub old_price: u64,
    pub new_price: u64,
    pub old_expiry: i64,
    pub new_expiry: i64,
    pub timestamp: i64,
}

#[event]
pub struct NftDelisted {
    pub listing: Pubkey,
    pub seller: Pubkey,
    pub nft_mint: Pubkey,
    pub reason: DelistReason,
    pub timestamp: i64,
}

#[derive(AnchorSerialize, AnchorDeserialize)]
pub enum DelistReason {
    SellerCancelled,
    Expired,
    Sold,
}

#[event]
pub struct NftPurchased {
    pub listing: Pubkey,
    pub seller: Pubkey,
    pub buyer: Pubkey,
    pub nft_mint: Pubkey,
    pub price: u64,
    pub marketplace_fee: u64,
    pub seller_receives: u64,
    pub timestamp: i64,
}

#[event]
pub struct OfferMade {
    pub offer: Pubkey,
    pub listing: Pubkey,
    pub bidder: Pubkey,
    pub amount: u64,
    pub expiry: i64,
    pub timestamp: i64,
}

#[event]
pub struct OfferAccepted {
    pub offer: Pubkey,
    pub listing: Pubkey,
    pub seller: Pubkey,
    pub bidder: Pubkey,
    pub nft_mint: Pubkey,
    pub amount: u64,
    pub marketplace_fee: u64,
    pub seller_receives: u64,
    pub timestamp: i64,
}

#[event]
pub struct OfferCancelled {
    pub offer: Pubkey,
    pub listing: Pubkey,
    pub bidder: Pubkey,
    pub amount: u64,
    pub reason: OfferCancelReason,
    pub timestamp: i64,
}

#[derive(AnchorSerialize, AnchorDeserialize)]
pub enum OfferCancelReason {
    BidderCancelled,
    Expired,
    ListingChanged,
}

#[event]
pub struct MarketplacePaused {
    pub admin: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct MarketplaceResumed {
    pub admin: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct FeesWithdrawn {
    pub admin: Pubkey,
    pub amount: u64,
    pub treasury_balance: u64,
    pub timestamp: i64,
}

#[event]
pub struct UserProfileCreated {
    pub user: Pubkey,
    pub profile: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct UserProfileUpdated {
    pub user: Pubkey,
    pub profile: Pubkey,
    pub total_sold: u64,
    pub total_bought: u64,
    pub volume_sold: u64,
    pub volume_bought: u64,
    pub reputation: u16,
    pub timestamp: i64,
}

#[event]
pub struct ExpiredOfferWithdrawn {
    pub offer: Pubkey,
    pub bidder: Pubkey,
    pub amount: u64,
    pub timestamp: i64,
}