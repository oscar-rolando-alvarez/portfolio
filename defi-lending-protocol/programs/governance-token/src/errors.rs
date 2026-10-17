use anchor_lang::prelude::*;

#[error_code]
pub enum GovernanceError {
    #[msg("Amount must be greater than zero")]
    ZeroAmount,
    #[msg("Arithmetic overflow")]
    MathOverflow,
    #[msg("Invalid governance parameters")]
    InvalidParams,
    #[msg("Stake is still locked")]
    StakeLocked,
    #[msg("Not enough staked tokens")]
    InsufficientStake,
    #[msg("Stake below the proposal threshold")]
    BelowProposalThreshold,
    #[msg("Title or description URI too long")]
    TextTooLong,
    #[msg("Voting period has ended")]
    VotingClosed,
    #[msg("Voting period has not ended yet")]
    VotingOpen,
    #[msg("Proposal already finalized")]
    AlreadyFinalized,
    #[msg("No voting power")]
    NoVotingPower,
}
