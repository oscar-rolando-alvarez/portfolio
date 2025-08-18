use anchor_lang::prelude::*;

#[error_code]
pub enum LendingError {
    #[msg("Math operation overflow")]
    MathOverflow,
    
    #[msg("Invalid amount provided")]
    InvalidAmount,
    
    #[msg("Insufficient liquidity in the pool")]
    InsufficientLiquidity,
    
    #[msg("Insufficient collateral for borrow")]
    InsufficientCollateral,
    
    #[msg("Health factor too low")]
    HealthFactorTooLow,
    
    #[msg("Position is healthy, cannot liquidate")]
    HealthyPosition,
    
    #[msg("Invalid liquidation amount")]
    InvalidLiquidationAmount,
    
    #[msg("Oracle price too old")]
    OraclePriceTooOld,
    
    #[msg("Oracle price confidence too low")]
    OraclePriceConfidenceTooLow,
    
    #[msg("Invalid collateral factor")]
    InvalidCollateralFactor,
    
    #[msg("Invalid liquidation threshold")]
    InvalidLiquidationThreshold,
    
    #[msg("Invalid liquidation bonus")]
    InvalidLiquidationBonus,
    
    #[msg("Pool not found")]
    PoolNotFound,
    
    #[msg("User obligation not found")]
    UserObligationNotFound,
    
    #[msg("Flash loan not repaid")]
    FlashLoanNotRepaid,
    
    #[msg("Flash loan fee not paid")]
    FlashLoanFeeNotPaid,
    
    #[msg("Unauthorized action")]
    Unauthorized,
    
    #[msg("Invalid fee rate")]
    InvalidFeeRate,
    
    #[msg("Pool already initialized")]
    PoolAlreadyInitialized,
    
    #[msg("Protocol already initialized")]
    ProtocolAlreadyInitialized,
    
    #[msg("Borrow not allowed")]
    BorrowNotAllowed,
    
    #[msg("Reserve factor too high")]
    ReserveFactorTooHigh,
    
    #[msg("Interest rate calculation failed")]
    InterestRateCalculationFailed,
    
    #[msg("Invalid timestamp")]
    InvalidTimestamp,
    
    #[msg("Slippage tolerance exceeded")]
    SlippageToleranceExceeded,
    
    #[msg("Price feed not found")]
    PriceFeedNotFound,
    
    #[msg("Invalid oracle account")]
    InvalidOracleAccount,
    
    #[msg("Governance token balance insufficient")]
    InsufficientGovernanceTokens,
    
    #[msg("Voting period ended")]
    VotingPeriodEnded,
    
    #[msg("Proposal not found")]
    ProposalNotFound,
    
    #[msg("Invalid proposal state")]
    InvalidProposalState,
    
    #[msg("Timelock period not passed")]
    TimelockPeriodNotPassed,
    
    #[msg("Invalid instruction data")]
    InvalidInstructionData,
    
    #[msg("Account not rent exempt")]
    AccountNotRentExempt,
    
    #[msg("Invalid program owner")]
    InvalidProgramOwner,
    
    #[msg("Account discriminator mismatch")]
    AccountDiscriminatorMismatch,
    
    #[msg("Rewards calculation failed")]
    RewardsCalculationFailed,
    
    #[msg("Staking period not ended")]
    StakingPeriodNotEnded,
    
    #[msg("Maximum borrowing capacity reached")]
    MaxBorrowingCapacityReached,
    
    #[msg("Minimum deposit amount not met")]
    MinimumDepositNotMet,
    
    #[msg("Maximum number of positions reached")]
    MaxPositionsReached,
    
    #[msg("Invalid token mint")]
    InvalidTokenMint,
    
    #[msg("Pool is paused")]
    PoolPaused,
    
    #[msg("Emergency mode activated")]
    EmergencyModeActivated,
}