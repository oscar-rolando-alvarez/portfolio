use anchor_lang::prelude::*;

pub const CONFIG_SEED: &[u8] = b"config";
pub const MINT_SEED: &[u8] = b"mint";
pub const VAULT_SEED: &[u8] = b"vault";
pub const STAKE_SEED: &[u8] = b"stake";
pub const PROPOSAL_SEED: &[u8] = b"proposal";
pub const VOTE_SEED: &[u8] = b"vote";

pub const MAX_TITLE_LEN: usize = 64;
pub const MAX_URI_LEN: usize = 200;
pub const MIN_VOTING_PERIOD_SECS: i64 = 60;
pub const MAX_VOTING_PERIOD_SECS: i64 = 30 * 24 * 60 * 60;

#[account]
#[derive(InitSpace)]
pub struct GovernanceConfig {
    /// Can mint new governance tokens (e.g. a multisig or the DAO itself).
    pub authority: Pubkey,
    pub mint: Pubkey,
    pub vault: Pubkey,
    pub voting_period_secs: i64,
    /// Minimum total participation (in token base units) for a valid vote.
    pub quorum_votes: u64,
    /// Minimum stake required to create a proposal.
    pub proposal_threshold: u64,
    pub proposal_count: u64,
    pub total_staked: u64,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct StakeAccount {
    pub owner: Pubkey,
    pub amount: u64,
    /// Tokens cannot be unstaked before this timestamp. Voting extends it to the
    /// end of the proposal, which prevents re-using the same tokens to vote twice.
    pub locked_until: i64,
    pub bump: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, PartialEq, Eq, InitSpace)]
pub enum ProposalStatus {
    Voting,
    Succeeded,
    Defeated,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, PartialEq, Eq, InitSpace)]
pub enum VoteChoice {
    For,
    Against,
    Abstain,
}

#[account]
#[derive(InitSpace)]
pub struct Proposal {
    pub id: u64,
    pub proposer: Pubkey,
    #[max_len(MAX_TITLE_LEN)]
    pub title: String,
    /// Off-chain description (IPFS/Arweave/HTTPS).
    #[max_len(MAX_URI_LEN)]
    pub description_uri: String,
    pub votes_for: u64,
    pub votes_against: u64,
    pub votes_abstain: u64,
    pub voting_starts_at: i64,
    pub voting_ends_at: i64,
    pub status: ProposalStatus,
    pub bump: u8,
}

impl Proposal {
    pub fn total_votes(&self) -> u64 {
        self.votes_for
            .saturating_add(self.votes_against)
            .saturating_add(self.votes_abstain)
    }

    /// Outcome once voting has ended.
    pub fn outcome(&self, quorum_votes: u64) -> ProposalStatus {
        if self.total_votes() >= quorum_votes && self.votes_for > self.votes_against {
            ProposalStatus::Succeeded
        } else {
            ProposalStatus::Defeated
        }
    }
}

#[account]
#[derive(InitSpace)]
pub struct VoteRecord {
    pub proposal: Pubkey,
    pub voter: Pubkey,
    pub choice: VoteChoice,
    pub weight: u64,
    pub bump: u8,
}

#[cfg(test)]
mod tests {
    use super::*;

    fn proposal(f: u64, a: u64, ab: u64) -> Proposal {
        Proposal {
            id: 0,
            proposer: Pubkey::default(),
            title: String::new(),
            description_uri: String::new(),
            votes_for: f,
            votes_against: a,
            votes_abstain: ab,
            voting_starts_at: 0,
            voting_ends_at: 0,
            status: ProposalStatus::Voting,
            bump: 0,
        }
    }

    #[test]
    fn requires_quorum_and_majority() {
        assert_eq!(proposal(60, 40, 0).outcome(100), ProposalStatus::Succeeded);
        assert_eq!(proposal(60, 30, 0).outcome(100), ProposalStatus::Defeated);
        assert_eq!(proposal(50, 50, 10).outcome(100), ProposalStatus::Defeated);
        assert_eq!(proposal(10, 0, 90).outcome(100), ProposalStatus::Succeeded);
    }
}
