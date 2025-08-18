use anchor_lang::prelude::*;
use crate::instructions::supply;

// Collateral deposit is essentially the same as supply
pub use supply::*;

pub fn deposit_collateral(ctx: Context<Supply>, amount: u64) -> Result<()> {
    supply::supply(ctx, amount)
}