use anchor_lang::prelude::*;

#[error_code]
pub enum MintingError {
    #[msg("Collection max supply has been reached")]
    MaxSupplyReached,
    
    #[msg("Only the collection authority can perform this action")]
    NotCollectionAuthority,
    
    #[msg("Only the NFT creator can perform this action")]
    NotCreator,
    
    #[msg("Collection name is too long")]
    NameTooLong,
    
    #[msg("Collection symbol is too long")]
    SymbolTooLong,
    
    #[msg("URI is too long")]
    UriTooLong,
    
    #[msg("Invalid royalty percentage (max 50%)")]
    InvalidRoyaltyPercentage,
    
    #[msg("Too many traits specified")]
    TooManyTraits,
    
    #[msg("Trait type name is too long")]
    TraitTypeTooLong,
    
    #[msg("Trait value is too long")]
    TraitValueTooLong,
    
    #[msg("Invalid rarity score")]
    InvalidRarityScore,
    
    #[msg("Collection is not verified")]
    CollectionNotVerified,
    
    #[msg("NFT has already been burned")]
    NftAlreadyBurned,
    
    #[msg("Cannot mint to immutable collection")]
    CollectionImmutable,
    
    #[msg("Candy machine is not active")]
    CandyMachineNotActive,
    
    #[msg("Candy machine sale has not started")]
    SaleNotStarted,
    
    #[msg("Candy machine sale has ended")]
    SaleEnded,
    
    #[msg("Candy machine is empty")]
    CandyMachineEmpty,
    
    #[msg("Insufficient funds for minting")]
    InsufficientFunds,
    
    #[msg("Whitelist token required")]
    WhitelistTokenRequired,
    
    #[msg("Invalid whitelist token")]
    InvalidWhitelistToken,
    
    #[msg("Batch size too large")]
    BatchSizeTooLarge,
    
    #[msg("Invalid metadata")]
    InvalidMetadata,
    
    #[msg("Collection verification failed")]
    VerificationFailed,
    
    #[msg("Arithmetic overflow")]
    ArithmeticOverflow,
    
    #[msg("Invalid collection mint")]
    InvalidCollectionMint,
    
    #[msg("Collection already exists")]
    CollectionAlreadyExists,
    
    #[msg("Invalid creator address")]
    InvalidCreator,
    
    #[msg("Metadata update not allowed")]
    MetadataUpdateNotAllowed,
    
    #[msg("Invalid master edition")]
    InvalidMasterEdition,
    
    #[msg("Token transfer failed")]
    TokenTransferFailed,
    
    #[msg("Invalid token account")]
    InvalidTokenAccount,
    
    #[msg("Collection limit exceeded")]
    CollectionLimitExceeded,
    
    #[msg("Invalid treasury account")]
    InvalidTreasuryAccount,
    
    #[msg("End settings validation failed")]
    InvalidEndSettings,
    
    #[msg("Whitelist settings validation failed")]
    InvalidWhitelistSettings,
}