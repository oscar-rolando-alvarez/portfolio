//! Governance token for the lending protocol.
//!
//! Holders stake tokens into a program vault to obtain voting power, create
//! proposals (above a stake threshold) and vote. Voting locks the stake until
//! the proposal closes, so the same tokens cannot be moved to vote twice.
//! Execution of passed proposals is intentionally left to an off-chain or
//! multisig executor; the program records the binding on-chain outcome.

use anchor_lang::prelude::*;

pub mod errors;
pub mod instructions;
pub mod state;

use instructions::*;
use state::VoteChoice;

declare_id!("JCFC4bviKZmiVdsDkvzXjRCzE9Yc7P1VumkgkiBvQ43c");

#[program]
pub mod governance_token {
    use super::*;

    pub fn initialize(
        ctx: Context<InitializeGovernance>,
        decimals: u8,
        params: GovernanceParams,
    ) -> Result<()> {
        handle_initialize(ctx, decimals, params)
    }

    pub fn mint_tokens(ctx: Context<MintTokens>, amount: u64) -> Result<()> {
        handle_mint_tokens(ctx, amount)
    }

    pub fn create_stake_account(ctx: Context<CreateStakeAccount>) -> Result<()> {
        handle_create_stake_account(ctx)
    }

    pub fn stake(ctx: Context<Stake>, amount: u64) -> Result<()> {
        handle_stake(ctx, amount)
    }

    pub fn unstake(ctx: Context<Stake>, amount: u64) -> Result<()> {
        handle_unstake(ctx, amount)
    }

    pub fn create_proposal(
        ctx: Context<CreateProposal>,
        title: String,
        description_uri: String,
    ) -> Result<()> {
        handle_create_proposal(ctx, title, description_uri)
    }

    pub fn cast_vote(ctx: Context<CastVote>, choice: VoteChoice) -> Result<()> {
        handle_cast_vote(ctx, choice)
    }

    pub fn finalize_proposal(ctx: Context<FinalizeProposal>) -> Result<()> {
        handle_finalize_proposal(ctx)
    }
}
