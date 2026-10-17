use anchor_lang::prelude::*;

#[error_code]
pub enum MintingError {
    #[msg("Collection max supply has been reached")]
    MaxSupplyReached,
    #[msg("Name is empty or too long")]
    InvalidName,
    #[msg("Symbol is empty or too long")]
    InvalidSymbol,
    #[msg("URI is too long")]
    UriTooLong,
    #[msg("Royalty must be at most 50% (5000 bps)")]
    InvalidRoyalty,
    #[msg("Arithmetic overflow")]
    MathOverflow,
}
