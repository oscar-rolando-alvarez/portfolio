use anchor_lang::prelude::*;

#[derive(Accounts)]
pub struct UpdateListing<'info> {
    pub placeholder: Signer<'info>,
}

pub fn handler(_ctx: Context<UpdateListing>, _new_price: Option<u64>, _new_expiry: Option<i64>, _new_allow_offers: Option<bool>) -> Result<()> {
    Ok(())
}