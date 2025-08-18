use anchor_lang::prelude::*;

#[derive(Accounts)]
pub struct PauseMarketplace<'info> {
    pub placeholder: Signer<'info>,
}

pub fn handler(_ctx: Context<PauseMarketplace>) -> Result<()> {
    Ok(())
}