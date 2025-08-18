use anchor_lang::prelude::*;

#[derive(Accounts)]
pub struct CancelOffer<'info> {
    pub placeholder: Signer<'info>,
}

pub fn handler(_ctx: Context<CancelOffer>) -> Result<()> {
    Ok(())
}