use anchor_lang::prelude::*;

#[error_code]
pub enum LendingError {
    #[msg("Arithmetic overflow")]
    MathOverflow,
    #[msg("Amount must be greater than zero")]
    ZeroAmount,
    #[msg("Protocol or market is paused")]
    Paused,
    #[msg("Invalid market configuration")]
    InvalidConfig,
    #[msg("Collateral and loan mints must differ")]
    SameMint,
    #[msg("Both mints must be owned by the supplied token program")]
    TokenProgramMismatch,
    #[msg("Not enough liquidity in the market")]
    InsufficientLiquidity,
    #[msg("Not enough collateral in the position")]
    InsufficientCollateral,
    #[msg("Operation would exceed the loan-to-value limit")]
    LtvExceeded,
    #[msg("Position is healthy and cannot be liquidated")]
    PositionHealthy,
    #[msg("Position has no debt")]
    NoDebt,
    #[msg("Oracle price is stale, unverified or for the wrong feed")]
    InvalidOraclePrice,
    #[msg("Oracle price is non-positive")]
    NonPositivePrice,
    #[msg("Oracle confidence interval too wide")]
    OracleConfidenceTooWide,
    #[msg("A flash loan is already in progress for this market")]
    FlashLoanInProgress,
    #[msg("No flash loan in progress")]
    NoFlashLoan,
    #[msg("Flash loan must be repaid by a matching flash_repay later in the same transaction")]
    FlashRepayMissing,
    #[msg("Flash loan instructions must be called directly, not via CPI")]
    FlashLoanViaCpi,
    #[msg("Flash repay amount does not match the borrowed amount")]
    FlashRepayMismatch,
    #[msg("Not enough protocol reserves")]
    InsufficientReserves,
}
