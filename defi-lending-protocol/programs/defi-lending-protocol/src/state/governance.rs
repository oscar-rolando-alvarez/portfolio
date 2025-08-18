use anchor_lang::prelude::*;

/// Proposal state
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, PartialEq)]
pub enum ProposalState {
    /// Proposal is pending (not yet active)
    Pending,
    /// Proposal is active and can be voted on
    Active,
    /// Proposal has been canceled
    Canceled,
    /// Proposal has been defeated
    Defeated,
    /// Proposal has succeeded and is queued for execution
    Succeeded,
    /// Proposal is queued in timelock
    Queued,
    /// Proposal has expired
    Expired,
    /// Proposal has been executed
    Executed,
}

/// Vote choice
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, PartialEq)]
pub enum VoteChoice {
    Against = 0,
    For = 1,
    Abstain = 2,
}

/// Governance configuration
#[account]
#[derive(Debug)]
pub struct GovernanceConfig {
    /// Governance token mint
    pub governance_token_mint: Pubkey,
    /// Voting delay (in slots)
    pub voting_delay: u64,
    /// Voting period (in slots)
    pub voting_period: u64,
    /// Proposal threshold (minimum tokens to create proposal)
    pub proposal_threshold: u64,
    /// Quorum votes (minimum votes for valid proposal)
    pub quorum_votes: u64,
    /// Timelock delay (in seconds)
    pub timelock_delay: i64,
    /// Guardian (can cancel proposals)
    pub guardian: Pubkey,
    /// Total proposals created
    pub proposal_count: u64,
    /// Configuration bump seed
    pub bump: u8,
}

impl GovernanceConfig {
    pub const LEN: usize = 8 + 32 + 8 * 5 + 8 + 32 + 8 + 1;
}

/// Governance proposal
#[account]
#[derive(Debug)]
pub struct Proposal {
    /// Proposal ID
    pub id: u64,
    /// Proposer
    pub proposer: Pubkey,
    /// Proposal title
    pub title: String,
    /// Proposal description
    pub description: String,
    /// Target program for execution
    pub target: Pubkey,
    /// Instruction data for execution
    pub data: Vec<u8>,
    /// Value to transfer (usually 0 for Solana)
    pub value: u64,
    /// Proposal state
    pub state: ProposalState,
    /// Start block
    pub start_block: u64,
    /// End block
    pub end_block: u64,
    /// For votes
    pub for_votes: u64,
    /// Against votes
    pub against_votes: u64,
    /// Abstain votes
    pub abstain_votes: u64,
    /// Execution time (when queued)
    pub eta: i64,
    /// Creation timestamp
    pub created_at: i64,
    /// Executed flag
    pub executed: bool,
    /// Canceled flag
    pub canceled: bool,
    /// Proposal bump seed
    pub bump: u8,
}

impl Proposal {
    pub const MAX_TITLE_LEN: usize = 128;
    pub const MAX_DESCRIPTION_LEN: usize = 1024;
    pub const MAX_DATA_LEN: usize = 1024;
    
    pub const LEN: usize = 8 + 8 + 32 + 
        4 + Self::MAX_TITLE_LEN +
        4 + Self::MAX_DESCRIPTION_LEN +
        32 + 
        4 + Self::MAX_DATA_LEN +
        8 + 1 + 8 * 6 + 8 + 1 + 1 + 1;

    pub fn get_state(&self, current_block: u64, current_timestamp: i64, quorum_votes: u64) -> ProposalState {
        if self.canceled {
            return ProposalState::Canceled;
        }

        if self.executed {
            return ProposalState::Executed;
        }

        if current_block <= self.start_block {
            return ProposalState::Pending;
        }

        if current_block <= self.end_block {
            return ProposalState::Active;
        }

        // Check if proposal succeeded
        let total_votes = self.for_votes + self.against_votes + self.abstain_votes;
        if total_votes >= quorum_votes && self.for_votes > self.against_votes {
            if self.eta > 0 {
                if current_timestamp >= self.eta {
                    return ProposalState::Queued;
                } else {
                    return ProposalState::Succeeded;
                }
            } else {
                return ProposalState::Succeeded;
            }
        }

        ProposalState::Defeated
    }

    pub fn is_active(&self, current_block: u64) -> bool {
        current_block > self.start_block && current_block <= self.end_block && !self.canceled
    }

    pub fn can_execute(&self, current_timestamp: i64) -> bool {
        !self.executed && !self.canceled && self.eta > 0 && current_timestamp >= self.eta
    }
}

/// User vote record
#[account]
#[derive(Debug)]
pub struct VoteRecord {
    /// Proposal ID
    pub proposal_id: u64,
    /// Voter
    pub voter: Pubkey,
    /// Vote choice
    pub choice: VoteChoice,
    /// Voting power used
    pub voting_power: u64,
    /// Vote timestamp
    pub timestamp: i64,
    /// Vote record bump seed
    pub bump: u8,
}

impl VoteRecord {
    pub const LEN: usize = 8 + 8 + 32 + 1 + 8 + 8 + 1;
}

/// User governance stake
#[account]
#[derive(Debug)]
pub struct GovernanceStake {
    /// User wallet
    pub user: Pubkey,
    /// Staked amount
    pub staked_amount: u64,
    /// Stake timestamp
    pub stake_timestamp: i64,
    /// Lock period end
    pub lock_end: i64,
    /// Voting power multiplier (based on lock period)
    pub voting_power_multiplier: u64,
    /// Rewards earned
    pub rewards_earned: u64,
    /// Last reward claim timestamp
    pub last_reward_claim: i64,
    /// Stake bump seed
    pub bump: u8,
}

impl GovernanceStake {
    pub const LEN: usize = 8 + 32 + 8 * 6 + 1;

    pub fn get_voting_power(&self) -> u64 {
        self.staked_amount
            .checked_mul(self.voting_power_multiplier)
            .unwrap_or(0)
            .checked_div(100)
            .unwrap_or(0)
    }

    pub fn can_unstake(&self, current_timestamp: i64) -> bool {
        current_timestamp >= self.lock_end
    }

    pub fn calculate_rewards(&self, current_timestamp: i64, reward_rate: u64) -> u64 {
        let time_elapsed = current_timestamp
            .saturating_sub(self.last_reward_claim);
        
        self.staked_amount
            .checked_mul(reward_rate as u64)
            .unwrap_or(0)
            .checked_mul(time_elapsed as u64)
            .unwrap_or(0)
            .checked_div(crate::constants::SECONDS_PER_YEAR)
            .unwrap_or(0)
    }
}