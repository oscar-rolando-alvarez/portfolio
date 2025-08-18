use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer, MintTo, Burn};

declare_id!("GovToknAbCdEfGhIjKlMnOpQrStUvWxYz123456789");

pub mod constants;
pub mod errors;
pub mod instructions;
pub mod state;

use instructions::*;

#[program]
pub mod governance_token {
    use super::*;

    /// Initialize the governance token
    pub fn initialize_governance_token(
        ctx: Context<InitializeGovernanceToken>,
        initial_supply: u64,
        governance_authority: Pubkey,
    ) -> Result<()> {
        instructions::initialize_governance_token(ctx, initial_supply, governance_authority)
    }

    /// Mint governance tokens (only by authority)
    pub fn mint_governance_tokens(
        ctx: Context<MintGovernanceTokens>,
        amount: u64,
    ) -> Result<()> {
        instructions::mint_governance_tokens(ctx, amount)
    }

    /// Stake governance tokens for voting power
    pub fn stake_tokens(
        ctx: Context<StakeTokens>,
        amount: u64,
        lock_period: i64,
    ) -> Result<()> {
        instructions::stake_tokens(ctx, amount, lock_period)
    }

    /// Unstake governance tokens
    pub fn unstake_tokens(
        ctx: Context<UnstakeTokens>,
        amount: u64,
    ) -> Result<()> {
        instructions::unstake_tokens(ctx, amount)
    }

    /// Create a governance proposal
    pub fn create_proposal(
        ctx: Context<CreateProposal>,
        title: String,
        description: String,
        target: Pubkey,
        data: Vec<u8>,
        value: u64,
    ) -> Result<()> {
        instructions::create_proposal(ctx, title, description, target, data, value)
    }

    /// Vote on a proposal
    pub fn vote_on_proposal(
        ctx: Context<VoteOnProposal>,
        choice: VoteChoice,
    ) -> Result<()> {
        instructions::vote_on_proposal(ctx, choice)
    }

    /// Queue a proposal for execution
    pub fn queue_proposal(ctx: Context<QueueProposal>) -> Result<()> {
        instructions::queue_proposal(ctx)
    }

    /// Execute a proposal
    pub fn execute_proposal(ctx: Context<ExecuteProposal>) -> Result<()> {
        instructions::execute_proposal(ctx)
    }

    /// Cancel a proposal
    pub fn cancel_proposal(ctx: Context<CancelProposal>) -> Result<()> {
        instructions::cancel_proposal(ctx)
    }

    /// Claim staking rewards
    pub fn claim_staking_rewards(ctx: Context<ClaimStakingRewards>) -> Result<()> {
        instructions::claim_staking_rewards(ctx)
    }
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, PartialEq)]
pub enum VoteChoice {
    Against = 0,
    For = 1,
    Abstain = 2,
}