use anchor_lang::prelude::*;

#[error_code]
pub enum MarketplaceError {
    #[msg("Marketplace is paused")]
    Paused,
    #[msg("Fee exceeds the maximum allowed")]
    FeeTooHigh,
    #[msg("Price must be greater than zero")]
    ZeroPrice,
    #[msg("Mint is not a non-fungible token (decimals 0, supply 1)")]
    NotAnNft,
    #[msg("Expiry must be in the future")]
    InvalidExpiry,
    #[msg("Listing has expired")]
    ListingExpired,
    #[msg("Offer has expired")]
    OfferExpired,
    #[msg("Listing price is above the buyer's maximum")]
    PriceAboveMaximum,
}
