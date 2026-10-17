use anchor_lang::prelude::*;

#[account]
#[derive(Default)]
pub struct Collection {
    /// Collection authority (creator)
    pub authority: Pubkey,
    
    /// Collection metadata
    pub name: String,
    pub symbol: String,
    pub uri: String,
    
    /// Royalty settings
    pub royalty_percentage: u16, // basis points (e.g., 500 = 5%)
    pub royalty_recipient: Pubkey,
    
    /// Supply settings
    pub max_supply: Option<u64>,
    pub current_supply: u64,
    
    /// Collection mint address
    pub collection_mint: Pubkey,
    
    /// Verification settings
    pub is_verified: bool,
    pub verified_at: Option<i64>,
    
    /// Collection creation timestamp
    pub created_at: i64,
    
    /// Collection statistics
    pub total_volume: u64,
    pub floor_price: u64,
    
    /// Collection features
    pub is_mutable: bool,
    pub has_candy_machine: bool,
    
    /// Reserved space for future fields
    pub _reserved: [u8; 64],
}

impl Collection {
    pub const MAX_NAME_LENGTH: usize = 32;
    pub const MAX_SYMBOL_LENGTH: usize = 10;
    pub const MAX_URI_LENGTH: usize = 200;
    
    pub const LEN: usize = 8 + // discriminator
        32 + // authority
        4 + Self::MAX_NAME_LENGTH + // name
        4 + Self::MAX_SYMBOL_LENGTH + // symbol
        4 + Self::MAX_URI_LENGTH + // uri
        2 + // royalty_percentage
        32 + // royalty_recipient
        9 + // max_supply (Option<u64>)
        8 + // current_supply
        32 + // collection_mint
        1 + // is_verified
        9 + // verified_at (Option<i64>)
        8 + // created_at
        8 + // total_volume
        8 + // floor_price
        1 + // is_mutable
        1 + // has_candy_machine
        64; // _reserved

    pub fn is_authority(&self, pubkey: &Pubkey) -> bool {
        self.authority == *pubkey
    }

    pub fn can_mint(&self) -> bool {
        if let Some(max_supply) = self.max_supply {
            self.current_supply < max_supply
        } else {
            true
        }
    }

    pub fn increment_supply(&mut self) -> Result<()> {
        if !self.can_mint() {
            return Err(crate::errors::MintingError::MaxSupplyReached.into());
        }
        self.current_supply += 1;
        Ok(())
    }
}

#[account]
#[derive(Default)]
pub struct NftMetadata {
    /// NFT mint address
    pub mint: Pubkey,
    
    /// Collection this NFT belongs to (if any)
    pub collection: Option<Pubkey>,
    
    /// Creator/minter address
    pub creator: Pubkey,
    
    /// Basic metadata
    pub name: String,
    pub symbol: String,
    pub uri: String,
    
    /// Traits and attributes
    pub traits: Vec<TraitAttribute>,
    
    /// Rarity scoring
    pub rarity_score: u16,
    pub rarity_rank: Option<u32>,
    
    /// Minting information
    pub minted_at: i64,
    pub mint_number: u64,
    
    /// Trading information
    pub last_sale_price: u64,
    pub total_trades: u32,
    
    /// Status
    pub is_burned: bool,
    pub burned_at: Option<i64>,
    
    /// Reserved space for future fields
    pub _reserved: [u8; 32],
}

impl NftMetadata {
    pub const MAX_NAME_LENGTH: usize = 32;
    pub const MAX_SYMBOL_LENGTH: usize = 10;
    pub const MAX_URI_LENGTH: usize = 200;
    pub const MAX_TRAITS: usize = 20;
    
    pub const LEN: usize = 8 + // discriminator
        32 + // mint
        33 + // collection (Option<Pubkey>)
        32 + // creator
        4 + Self::MAX_NAME_LENGTH + // name
        4 + Self::MAX_SYMBOL_LENGTH + // symbol
        4 + Self::MAX_URI_LENGTH + // uri
        4 + (Self::MAX_TRAITS * TraitAttribute::LEN) + // traits
        2 + // rarity_score
        5 + // rarity_rank (Option<u32>)
        8 + // minted_at
        8 + // mint_number
        8 + // last_sale_price
        4 + // total_trades
        1 + // is_burned
        9 + // burned_at (Option<i64>)
        32; // _reserved

    pub fn is_creator(&self, pubkey: &Pubkey) -> bool {
        self.creator == *pubkey
    }

    pub fn update_sale_info(&mut self, price: u64) {
        self.last_sale_price = price;
        self.total_trades += 1;
    }
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct TraitAttribute {
    pub trait_type: String,
    pub value: String,
    pub display_type: Option<String>, // "number", "date", etc.
    pub max_value: Option<u64>,       // for numeric traits
}

impl TraitAttribute {
    pub const MAX_TRAIT_TYPE_LENGTH: usize = 32;
    pub const MAX_VALUE_LENGTH: usize = 64;
    pub const MAX_DISPLAY_TYPE_LENGTH: usize = 16;
    
    pub const LEN: usize = 
        4 + Self::MAX_TRAIT_TYPE_LENGTH + // trait_type
        4 + Self::MAX_VALUE_LENGTH + // value
        5 + Self::MAX_DISPLAY_TYPE_LENGTH + // display_type (Option<String>)
        9; // max_value (Option<u64>)
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct BatchMintData {
    pub name: String,
    pub symbol: String,
    pub uri: String,
    pub traits: Vec<TraitAttribute>,
    pub rarity_score: u16,
    pub recipient: Pubkey,
}

#[account]
#[derive(Default)]
pub struct CandyMachine {
    /// Authority who can update the candy machine
    pub authority: Pubkey,
    
    /// Associated collection
    pub collection: Pubkey,
    
    /// Minting settings
    pub price: u64,
    pub items_available: u64,
    pub items_redeemed: u64,
    
    /// Timing settings
    pub go_live_date: i64,
    pub end_settings: Option<EndSettings>,
    
    /// Whitelist settings
    pub whitelist_mint_settings: Option<WhitelistMintSettings>,
    
    /// Treasury settings
    pub treasury: Pubkey,
    
    /// Status
    pub is_active: bool,
    
    /// Creation timestamp
    pub created_at: i64,
    
    /// Reserved space for future fields
    pub _reserved: [u8; 64],
}

impl CandyMachine {
    pub const LEN: usize = 8 + // discriminator
        32 + // authority
        32 + // collection
        8 + // price
        8 + // items_available
        8 + // items_redeemed
        8 + // go_live_date
        17 + // end_settings (Option<EndSettings>)
        65 + // whitelist_mint_settings (Option<WhitelistMintSettings>)
        32 + // treasury
        1 + // is_active
        8 + // created_at
        64; // _reserved

    pub fn can_mint(&self) -> bool {
        let current_time = Clock::get().unwrap().unix_timestamp;
        
        self.is_active &&
        current_time >= self.go_live_date &&
        self.items_redeemed < self.items_available &&
        self.end_settings.as_ref().map_or(true, |end| {
            end.end_setting_type == EndSettingType::Date as u8 && current_time <= end.number ||
            end.end_setting_type == EndSettingType::Amount as u8 && self.items_redeemed < end.number as u64
        })
    }

    pub fn increment_redeemed(&mut self) -> Result<()> {
        if !self.can_mint() {
            return Err(crate::errors::MintingError::CandyMachineEmpty.into());
        }
        self.items_redeemed += 1;
        Ok(())
    }
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct EndSettings {
    pub end_setting_type: u8, // 0 = Date, 1 = Amount
    pub number: i64,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct WhitelistMintSettings {
    pub mode: u8, // 0 = BurnEveryTime, 1 = NeverBurn
    pub mint: Pubkey,
    pub presale: bool,
    pub discount_price: Option<u64>,
}

#[repr(u8)]
pub enum EndSettingType {
    Date = 0,
    Amount = 1,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq)]
pub enum RarityTier {
    Common,
    Uncommon,
    Rare,
    Epic,
    Legendary,
    Mythic,
}

impl RarityTier {
    pub fn from_score(score: u16) -> Self {
        match score {
            0..=100 => RarityTier::Common,
            101..=300 => RarityTier::Uncommon,
            301..=600 => RarityTier::Rare,
            601..=850 => RarityTier::Epic,
            851..=950 => RarityTier::Legendary,
            _ => RarityTier::Mythic,
        }
    }
    
    pub fn multiplier(&self) -> f64 {
        match self {
            RarityTier::Common => 1.0,
            RarityTier::Uncommon => 1.2,
            RarityTier::Rare => 1.5,
            RarityTier::Epic => 2.0,
            RarityTier::Legendary => 3.0,
            RarityTier::Mythic => 5.0,
        }
    }
}