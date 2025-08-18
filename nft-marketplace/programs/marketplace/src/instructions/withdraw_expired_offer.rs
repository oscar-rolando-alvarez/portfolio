use anchor_lang::prelude::*;

#[derive(Accounts)]
pub struct WithdrawExpiredOffer<'info> {
    pub placeholder: Signer<'info>,
}

pub fn handler(_ctx: Context<WithdrawExpiredOffer>) -> Result<()> {
    Ok(())
}