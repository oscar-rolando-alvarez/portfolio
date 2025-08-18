use anchor_lang::prelude::*;

#[error_code]
pub enum MarketplaceError {
    #[msg("Marketplace fee cannot exceed 10%")]
    FeeTooHigh,
    
    #[msg("Listing has expired")]
    ListingExpired,
    
    #[msg("Listing is not active")]
    ListingNotActive,
    
    #[msg("Price must be greater than zero")]
    InvalidPrice,
    
    #[msg("Expiry must be in the future")]
    InvalidExpiry,
    
    #[msg("Only the seller can perform this action")]
    NotSeller,
    
    #[msg("Only the admin can perform this action")]
    NotAdmin,
    
    #[msg("Cannot purchase your own NFT")]
    CannotPurchaseOwnNft,
    
    #[msg("Insufficient funds")]
    InsufficientFunds,
    
    #[msg("Offer amount must be greater than zero")]
    InvalidOfferAmount,
    
    #[msg("Offers are not allowed on this listing")]
    OffersNotAllowed,
    
    #[msg("Offer has expired")]
    OfferExpired,
    
    #[msg("Offer is not active")]
    OfferNotActive,
    
    #[msg("Only the bidder can cancel this offer")]
    NotBidder,
    
    #[msg("Marketplace is currently paused")]
    MarketplacePaused,
    
    #[msg("Listing duration exceeds maximum allowed")]
    ListingDurationTooLong,
    
    #[msg("NFT is not properly initialized")]
    InvalidNft,
    
    #[msg("Invalid metadata account")]
    InvalidMetadata,
    
    #[msg("Arithmetic overflow")]
    ArithmeticOverflow,
    
    #[msg("Invalid token program")]
    InvalidTokenProgram,
    
    #[msg("Invalid collection")]
    InvalidCollection,
    
    #[msg("Cannot make offer on expired listing")]
    CannotOfferOnExpiredListing,
    
    #[msg("Offer amount must be higher than current highest offer")]
    OfferTooLow,
    
    #[msg("Cannot accept non-existent offer")]
    NoOfferToAccept,
    
    #[msg("User profile not found")]
    UserProfileNotFound,
    
    #[msg("Invalid escrow account")]
    InvalidEscrowAccount,
    
    #[msg("Escrow account mismatch")]
    EscrowAccountMismatch,
    
    #[msg("Cannot withdraw non-expired offer")]
    CannotWithdrawActiveOffer,
    
    #[msg("Insufficient treasury balance")]
    InsufficientTreasuryBalance,
    
    #[msg("Invalid treasury account")]
    InvalidTreasuryAccount,
    
    #[msg("Numerical conversion error")]
    NumericalOverflow,
    
    #[msg("Marketplace already paused")]
    AlreadyPaused,
    
    #[msg("Marketplace not paused")]
    NotPaused,
    
    #[msg("Invalid listing status")]
    InvalidListingStatus,
    
    #[msg("Invalid offer status")]
    InvalidOfferStatus,
}