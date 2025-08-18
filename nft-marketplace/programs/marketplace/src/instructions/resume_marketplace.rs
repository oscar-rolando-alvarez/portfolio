use anchor_lang::prelude::*;

#[derive(Accounts)]
pub struct ResumeMarketplace<'info> {
    pub placeholder: Signer<'info>,
}

pub fn handler(_ctx: Context<ResumeMarketplace>) -> Result<()> {
    Ok(())
}