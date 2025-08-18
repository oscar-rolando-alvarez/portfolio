use anchor_lang::prelude::*;

#[account]
#[derive(Default)]
pub struct Marketplace {
    /// Authority that can update marketplace settings
    pub admin: Pubkey,
    
    /// Fee taken by marketplace (in basis points, e.g., 250 = 2.5%)
    pub marketplace_fee: u16,
    
    /// Maximum duration a listing can be active (in seconds)
    pub max_listing_duration: i64,
    
    /// Whether the marketplace is currently paused
    pub is_paused: bool,
    
    /// Treasury account for collecting fees
    pub treasury: Pubkey,
    
    /// Total volume traded on the marketplace
    pub total_volume: u64,
    
    /// Total number of listings created
    pub total_listings: u64,
    
    /// Total number of successful sales
    pub total_sales: u64,
    
    /// Version for future upgrades
    pub version: u8,
    
    /// Reserved space for future fields
    pub _reserved: [u8; 64],
}

impl Marketplace {
    pub const LEN: usize = 8 + // discriminator
        32 + // admin
        2 +  // marketplace_fee
        8 +  // max_listing_duration
        1 +  // is_paused
        32 + // treasury
        8 +  // total_volume
        8 +  // total_listings
        8 +  // total_sales
        1 +  // version
        64;  // _reserved

    pub fn validate_fee(&self, fee: u16) -> Result<()> {
        require!(fee <= 1000, crate::errors::MarketplaceError::FeeTooHigh);
        Ok(())
    }

    pub fn is_admin(&self, pubkey: &Pubkey) -> bool {
        self.admin == *pubkey
    }
}

#[account]
#[derive(Default)]
pub struct Listing {
    /// The seller's public key
    pub seller: Pubkey,
    
    /// The NFT mint address
    pub nft_mint: Pubkey,
    
    /// The NFT token account
    pub nft_token_account: Pubkey,
    
    /// Price in SOL (lamports)
    pub price: u64,
    
    /// When the listing expires (Unix timestamp)
    pub expiry: i64,
    
    /// Whether offers are allowed on this listing
    pub allow_offers: bool,
    
    /// Current highest offer amount
    pub highest_offer: u64,
    
    /// Address of the highest bidder
    pub highest_bidder: Pubkey,
    
    /// When this listing was created
    pub created_at: i64,
    
    /// Status of the listing
    pub status: ListingStatus,
    
    /// Collection this NFT belongs to (if any)
    pub collection: Option<Pubkey>,
    
    /// Category for filtering
    pub category: u8,
    
    /// Reserved space for future fields
    pub _reserved: [u8; 32],
}

impl Listing {
    pub const LEN: usize = 8 + // discriminator
        32 + // seller
        32 + // nft_mint
        32 + // nft_token_account
        8 +  // price
        8 +  // expiry
        1 +  // allow_offers
        8 +  // highest_offer
        32 + // highest_bidder
        8 +  // created_at
        1 +  // status
        33 + // collection (Option<Pubkey>)
        1 +  // category
        32;  // _reserved

    pub fn is_expired(&self) -> bool {
        Clock::get().unwrap().unix_timestamp > self.expiry
    }

    pub fn is_active(&self) -> bool {
        matches!(self.status, ListingStatus::Active) && !self.is_expired()
    }

    pub fn is_seller(&self, pubkey: &Pubkey) -> bool {
        self.seller == *pubkey
    }
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq)]
pub enum ListingStatus {
    Active,
    Sold,
    Cancelled,
    Expired,
}

impl Default for ListingStatus {
    fn default() -> Self {
        ListingStatus::Active
    }
}

#[account]
#[derive(Default)]
pub struct Offer {
    /// The person making the offer
    pub bidder: Pubkey,
    
    /// The listing this offer is for
    pub listing: Pubkey,
    
    /// Amount of the offer in lamports
    pub amount: u64,
    
    /// When this offer expires
    pub expiry: i64,
    
    /// When the offer was created
    pub created_at: i64,
    
    /// Token account holding the escrowed funds
    pub escrow_account: Pubkey,
    
    /// Status of the offer
    pub status: OfferStatus,
    
    /// Reserved space for future fields
    pub _reserved: [u8; 32],
}

impl Offer {
    pub const LEN: usize = 8 + // discriminator
        32 + // bidder
        32 + // listing
        8 +  // amount
        8 +  // expiry
        8 +  // created_at
        32 + // escrow_account
        1 +  // status
        32;  // _reserved

    pub fn is_expired(&self) -> bool {
        Clock::get().unwrap().unix_timestamp > self.expiry
    }

    pub fn is_active(&self) -> bool {
        matches!(self.status, OfferStatus::Active) && !self.is_expired()
    }

    pub fn is_bidder(&self, pubkey: &Pubkey) -> bool {
        self.bidder == *pubkey
    }
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq)]
pub enum OfferStatus {
    Active,
    Accepted,
    Cancelled,
    Expired,
}

impl Default for OfferStatus {
    fn default() -> Self {
        OfferStatus::Active
    }
}

#[account]
#[derive(Default)]
pub struct UserProfile {
    /// User's wallet address
    pub user: Pubkey,
    
    /// Total number of NFTs sold
    pub total_sold: u64,
    
    /// Total number of NFTs bought
    pub total_bought: u64,
    
    /// Total volume sold in lamports
    pub volume_sold: u64,
    
    /// Total volume bought in lamports
    pub volume_bought: u64,
    
    /// User's reputation score (0-1000)
    pub reputation: u16,
    
    /// Whether user is verified
    pub is_verified: bool,
    
    /// Profile creation timestamp
    pub created_at: i64,
    
    /// Last activity timestamp
    pub last_activity: i64,
    
    /// Reserved space for future fields
    pub _reserved: [u8; 64],
}

impl UserProfile {
    pub const LEN: usize = 8 + // discriminator
        32 + // user
        8 +  // total_sold
        8 +  // total_bought
        8 +  // volume_sold
        8 +  // volume_bought
        2 +  // reputation
        1 +  // is_verified
        8 +  // created_at
        8 +  // last_activity
        64;  // _reserved

    pub fn update_activity(&mut self) {
        self.last_activity = Clock::get().unwrap().unix_timestamp;
    }

    pub fn update_sale_stats(&mut self, volume: u64) {
        self.total_sold += 1;
        self.volume_sold += volume;
        self.update_activity();
    }

    pub fn update_purchase_stats(&mut self, volume: u64) {
        self.total_bought += 1;
        self.volume_bought += volume;
        self.update_activity();
    }
}