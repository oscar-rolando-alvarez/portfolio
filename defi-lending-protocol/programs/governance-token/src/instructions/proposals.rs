use crate::errors::GovernanceError;
use crate::state::*;
use anchor_lang::prelude::*;

#[derive(Accounts)]
pub struct CreateProposal<'info> {
    #[account(mut)]
    pub proposer: Signer<'info>,
    #[account(mut, seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Account<'info, GovernanceConfig>,
    #[account(
        seeds = [STAKE_SEED, proposer.key().as_ref()],
        bump = stake.bump,
        constraint = stake.owner == proposer.key()
    )]
    pub stake: Account<'info, StakeAccount>,
    #[account(
        init,
        payer = proposer,
        space = 8 + Proposal::INIT_SPACE,
        seeds = [PROPOSAL_SEED, config.proposal_count.to_le_bytes().as_ref()],
        bump
    )]
    pub proposal: Account<'info, Proposal>,
    pub system_program: Program<'info, System>,
}

pub fn handle_create_proposal(
    ctx: Context<CreateProposal>,
    title: String,
    description_uri: String,
) -> Result<()> {
    require!(
        title.len() <= MAX_TITLE_LEN && description_uri.len() <= MAX_URI_LEN,
        GovernanceError::TextTooLong
    );
    let config = &mut ctx.accounts.config;
    require!(
        ctx.accounts.stake.amount >= config.proposal_threshold,
        GovernanceError::BelowProposalThreshold
    );

    let now = Clock::get()?.unix_timestamp;
    let proposal = &mut ctx.accounts.proposal;
    proposal.id = config.proposal_count;
    proposal.proposer = ctx.accounts.proposer.key();
    proposal.title = title;
    proposal.description_uri = description_uri;
    proposal.votes_for = 0;
    proposal.votes_against = 0;
    proposal.votes_abstain = 0;
    proposal.voting_starts_at = now;
    proposal.voting_ends_at = now
        .checked_add(config.voting_period_secs)
        .ok_or(GovernanceError::MathOverflow)?;
    proposal.status = ProposalStatus::Voting;
    proposal.bump = ctx.bumps.proposal;

    config.proposal_count += 1;
    Ok(())
}

#[derive(Accounts)]
pub struct CastVote<'info> {
    #[account(mut)]
    pub voter: Signer<'info>,
    #[account(mut)]
    pub proposal: Account<'info, Proposal>,
    #[account(
        mut,
        seeds = [STAKE_SEED, voter.key().as_ref()],
        bump = stake.bump,
        constraint = stake.owner == voter.key()
    )]
    pub stake: Account<'info, StakeAccount>,
    /// One vote record per (proposal, voter) — `init` rejects double voting.
    #[account(
        init,
        payer = voter,
        space = 8 + VoteRecord::INIT_SPACE,
        seeds = [VOTE_SEED, proposal.key().as_ref(), voter.key().as_ref()],
        bump
    )]
    pub vote_record: Account<'info, VoteRecord>,
    pub system_program: Program<'info, System>,
}

pub fn handle_cast_vote(ctx: Context<CastVote>, choice: VoteChoice) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let proposal = &mut ctx.accounts.proposal;
    require!(
        proposal.status == ProposalStatus::Voting && now < proposal.voting_ends_at,
        GovernanceError::VotingClosed
    );
    let stake = &mut ctx.accounts.stake;
    let weight = stake.amount;
    require!(weight > 0, GovernanceError::NoVotingPower);

    let tally = match choice {
        VoteChoice::For => &mut proposal.votes_for,
        VoteChoice::Against => &mut proposal.votes_against,
        VoteChoice::Abstain => &mut proposal.votes_abstain,
    };
    *tally = tally
        .checked_add(weight)
        .ok_or(GovernanceError::MathOverflow)?;
    stake.locked_until = stake.locked_until.max(proposal.voting_ends_at);

    let record = &mut ctx.accounts.vote_record;
    record.proposal = proposal.key();
    record.voter = ctx.accounts.voter.key();
    record.choice = choice;
    record.weight = weight;
    record.bump = ctx.bumps.vote_record;
    Ok(())
}

#[derive(Accounts)]
pub struct FinalizeProposal<'info> {
    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Account<'info, GovernanceConfig>,
    #[account(mut)]
    pub proposal: Account<'info, Proposal>,
}

/// Permissionless: anyone can settle a proposal once voting has ended.
pub fn handle_finalize_proposal(ctx: Context<FinalizeProposal>) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let proposal = &mut ctx.accounts.proposal;
    require!(
        proposal.status == ProposalStatus::Voting,
        GovernanceError::AlreadyFinalized
    );
    require!(now >= proposal.voting_ends_at, GovernanceError::VotingOpen);
    proposal.status = proposal.outcome(ctx.accounts.config.quorum_votes);
    Ok(())
}
