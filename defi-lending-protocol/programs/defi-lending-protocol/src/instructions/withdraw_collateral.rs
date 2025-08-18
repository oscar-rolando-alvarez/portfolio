use anchor_lang::prelude::*;
use crate::instructions::withdraw;

// Collateral withdrawal is essentially the same as withdraw
pub use withdraw::*;

pub fn withdraw_collateral(ctx: Context<Withdraw>, amount: u64) -> Result<()> {
    withdraw::withdraw(ctx, amount)
}