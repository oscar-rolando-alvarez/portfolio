use anchor_lang::prelude::*;
use crate::constants::*;
use crate::errors::LendingError;
use crate::state::Protocol;

#[derive(Accounts)]
pub struct InitializeProtocol<'info> {
    #[account(
        init,
        payer = admin,
        space = Protocol::LEN,
        seeds = [PROTOCOL_SEED],
        bump
    )]
    pub protocol: Account<'info, Protocol>,
    
    #[account(mut)]
    pub admin: Signer<'info>,
    
    /// Treasury account for protocol fees
    /// CHECK: Can be any account
    pub treasury: UncheckedAccount<'info>,
    
    /// Emergency admin (can pause protocol)
    /// CHECK: Can be any account
    pub emergency_admin: UncheckedAccount<'info>,
    
    pub system_program: Program<'info, System>,
}

pub fn initialize_protocol(
    ctx: Context<InitializeProtocol>,
    admin: Pubkey,
    fee_rate: u64,
) -> Result<()> {
    // Validate fee rate
    if fee_rate > MAX_FEE_RATE {
        return Err(LendingError::InvalidFeeRate.into());
    }

    let protocol = &mut ctx.accounts.protocol;
    let clock = Clock::get()?;

    protocol.admin = admin;
    protocol.fee_rate = fee_rate;
    protocol.total_pools = 0;
    protocol.emergency_admin = ctx.accounts.emergency_admin.key();
    protocol.treasury = ctx.accounts.treasury.key();
    protocol.total_value_locked = 0;
    protocol.total_borrowed = 0;
    protocol.paused = false;
    protocol.emergency_mode = false;
    protocol.last_update_time = clock.unix_timestamp;
    protocol.bump = ctx.bumps.protocol;

    msg!(
        "Protocol initialized with admin: {}, fee_rate: {} bps, treasury: {}",
        admin,
        fee_rate,
        ctx.accounts.treasury.key()
    );

    Ok(())
}