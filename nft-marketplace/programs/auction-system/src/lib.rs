use anchor_lang::prelude::*;

declare_id!("BPFLoaderUpgradeab1e11111111111111111111111");

#[program]
pub mod auction_system {
    use super::*;

    pub fn create_auction(ctx: Context<CreateAuction>, starting_bid: u64, duration: i64) -> Result<()> {
        msg!("Creating auction with starting bid: {}, duration: {}", starting_bid, duration);
        Ok(())
    }

    pub fn place_bid(ctx: Context<PlaceBid>, amount: u64) -> Result<()> {
        msg!("Placing bid of amount: {}", amount);
        Ok(())
    }

    pub fn end_auction(ctx: Context<EndAuction>) -> Result<()> {
        msg!("Ending auction");
        Ok(())
    }
}

#[derive(Accounts)]
pub struct CreateAuction<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct PlaceBid<'info> {
    #[account(mut)]
    pub bidder: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct EndAuction<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}