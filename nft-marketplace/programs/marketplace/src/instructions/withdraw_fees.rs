use anchor_lang::prelude::*;

#[derive(Accounts)]
pub struct WithdrawFees<'info> {
    pub placeholder: Signer<'info>,
}

pub fn handler(_ctx: Context<WithdrawFees>, _amount: u64) -> Result<()> {
    Ok(())
}