use anchor_lang::prelude::*;
use crate::constants::*;
use crate::state::{Protocol, UserObligation};

#[derive(Accounts)]
pub struct InitUserObligation<'info> {
    #[account(
        seeds = [PROTOCOL_SEED],
        bump = protocol.bump
    )]
    pub protocol: Account<'info, Protocol>,
    
    #[account(
        init,
        payer = user,
        space = UserObligation::LEN,
        seeds = [USER_OBLIGATION_SEED, user.key().as_ref(), protocol.key().as_ref()],
        bump
    )]
    pub user_obligation: Account<'info, UserObligation>,
    
    #[account(mut)]
    pub user: Signer<'info>,
    
    pub system_program: Program<'info, System>,
}

pub fn init_user_obligation(ctx: Context<InitUserObligation>) -> Result<()> {
    let user_obligation = &mut ctx.accounts.user_obligation;
    let clock = Clock::get()?;

    user_obligation.user = ctx.accounts.user.key();
    user_obligation.protocol = ctx.accounts.protocol.key();
    user_obligation.deposits = [Default::default(); crate::state::user_obligation::MAX_DEPOSITS];
    user_obligation.deposits_len = 0;
    user_obligation.borrows = [Default::default(); crate::state::user_obligation::MAX_BORROWS];
    user_obligation.borrows_len = 0;
    user_obligation.total_collateral_value = 0;
    user_obligation.total_debt_value = 0;
    user_obligation.yield_states = [Default::default(); crate::state::user_obligation::MAX_DEPOSITS];
    user_obligation.health_factor = u64::MAX;
    user_obligation.last_update_timestamp = clock.unix_timestamp;
    user_obligation.bump = ctx.bumps.user_obligation;

    msg!("User obligation initialized for user: {}", ctx.accounts.user.key());

    Ok(())
}