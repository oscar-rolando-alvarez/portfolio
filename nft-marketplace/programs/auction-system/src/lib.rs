//! English auctions for NFTs.
//!
//! The seller escrows the NFT in the auction PDA's token account. Each bid
//! escrows SOL in the auction account and atomically refunds the previous
//! highest bidder. Bids in the final minutes extend the auction
//! (anti-sniping). Anyone can settle after the end: the NFT goes to the
//! winner and the winning bid to the seller.

use anchor_lang::prelude::*;
use anchor_lang::system_program::{self, Transfer};
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token_interface::{
    self, CloseAccount, Mint, TokenAccount, TokenInterface, TransferChecked,
};

declare_id!("5YeC15ieZAhKmeDeVHR1xDzC6patSL68yQTtgqEio7Sh");

pub const AUCTION_SEED: &[u8] = b"auction";
pub const MIN_DURATION_SECS: i64 = 60;
pub const MAX_DURATION_SECS: i64 = 30 * 24 * 60 * 60;
/// Bids placed within this window before the end extend the auction to now + window.
pub const ANTI_SNIPING_WINDOW_SECS: i64 = 5 * 60;
pub const MAX_INCREMENT_BPS: u16 = 5_000;

#[program]
pub mod auction_system {
    use super::*;

    pub fn create_auction(
        ctx: Context<CreateAuction>,
        min_bid: u64,
        min_increment_bps: u16,
        duration_secs: i64,
    ) -> Result<()> {
        require!(min_bid > 0, AuctionError::InvalidParams);
        require!(
            min_increment_bps <= MAX_INCREMENT_BPS
                && (MIN_DURATION_SECS..=MAX_DURATION_SECS).contains(&duration_secs),
            AuctionError::InvalidParams
        );
        let now = Clock::get()?.unix_timestamp;

        token_interface::transfer_checked(
            CpiContext::new(
                ctx.accounts.token_program.key(),
                TransferChecked {
                    from: ctx.accounts.seller_token_account.to_account_info(),
                    mint: ctx.accounts.mint.to_account_info(),
                    to: ctx.accounts.vault.to_account_info(),
                    authority: ctx.accounts.seller.to_account_info(),
                },
            ),
            1,
            0,
        )?;

        let auction = &mut ctx.accounts.auction;
        auction.seller = ctx.accounts.seller.key();
        auction.mint = ctx.accounts.mint.key();
        auction.min_bid = min_bid;
        auction.min_increment_bps = min_increment_bps;
        auction.highest_bid = 0;
        auction.highest_bidder = Pubkey::default();
        auction.starts_at = now;
        auction.ends_at = now + duration_secs;
        auction.bump = ctx.bumps.auction;

        emit!(AuctionCreated {
            auction: auction.key(),
            mint: auction.mint,
            seller: auction.seller,
            min_bid,
            ends_at: auction.ends_at,
        });
        Ok(())
    }

    pub fn place_bid(ctx: Context<PlaceBid>, amount: u64) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;
        let auction = &mut ctx.accounts.auction;
        require!(now < auction.ends_at, AuctionError::AuctionEnded);
        require!(amount >= auction.next_min_bid(), AuctionError::BidTooLow);
        require_keys_neq!(
            ctx.accounts.bidder.key(),
            auction.seller,
            AuctionError::SellerCannotBid
        );

        // Escrow the new bid in the auction account.
        system_program::transfer(
            CpiContext::new(
                ctx.accounts.system_program.key(),
                Transfer {
                    from: ctx.accounts.bidder.to_account_info(),
                    to: auction.to_account_info(),
                },
            ),
            amount,
        )?;

        // Refund the previous highest bidder.
        if auction.highest_bid > 0 {
            require_keys_eq!(
                ctx.accounts.previous_bidder.key(),
                auction.highest_bidder,
                AuctionError::WrongPreviousBidder
            );
            auction.sub_lamports(auction.highest_bid)?;
            ctx.accounts
                .previous_bidder
                .add_lamports(auction.highest_bid)?;
        }

        auction.highest_bid = amount;
        auction.highest_bidder = ctx.accounts.bidder.key();
        if auction.ends_at - now < ANTI_SNIPING_WINDOW_SECS {
            auction.ends_at = now + ANTI_SNIPING_WINDOW_SECS;
        }

        emit!(BidPlaced {
            auction: auction.key(),
            bidder: auction.highest_bidder,
            amount,
            ends_at: auction.ends_at,
        });
        Ok(())
    }

    /// Permissionless settlement after the auction has ended.
    pub fn settle_auction(ctx: Context<SettleAuction>) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;
        let auction = &ctx.accounts.auction;
        require!(now >= auction.ends_at, AuctionError::AuctionActive);

        let has_winner = auction.highest_bid > 0;
        let expected_receiver = if has_winner {
            auction.highest_bidder
        } else {
            auction.seller
        };
        require_keys_eq!(
            ctx.accounts.receiver.key(),
            expected_receiver,
            AuctionError::WrongReceiver
        );

        release_nft(
            &ctx.accounts.token_program,
            &ctx.accounts.mint,
            &ctx.accounts.vault,
            auction,
            &ctx.accounts.receiver_token_account.to_account_info(),
            &ctx.accounts.seller.to_account_info(),
        )?;

        // Direct lamport moves must come after CPIs so the runtime balance checks pass.
        if has_winner {
            auction.sub_lamports(auction.highest_bid)?;
            ctx.accounts.seller.add_lamports(auction.highest_bid)?;
        }

        emit!(AuctionSettled {
            auction: auction.key(),
            winner: has_winner.then_some(auction.highest_bidder),
            amount: auction.highest_bid,
        });
        Ok(())
    }

    /// The seller may cancel only while there are no bids.
    pub fn cancel_auction(ctx: Context<CancelAuction>) -> Result<()> {
        let auction = &ctx.accounts.auction;
        require!(auction.highest_bid == 0, AuctionError::HasBids);
        release_nft(
            &ctx.accounts.token_program,
            &ctx.accounts.mint,
            &ctx.accounts.vault,
            auction,
            &ctx.accounts.seller_token_account.to_account_info(),
            &ctx.accounts.seller.to_account_info(),
        )
    }
}

fn release_nft<'info>(
    token_program: &Interface<'info, TokenInterface>,
    mint: &InterfaceAccount<'info, Mint>,
    vault: &InterfaceAccount<'info, TokenAccount>,
    auction: &Account<'info, Auction>,
    to: &AccountInfo<'info>,
    rent_receiver: &AccountInfo<'info>,
) -> Result<()> {
    let mint_key = mint.key();
    let bump = [auction.bump];
    let seeds: &[&[u8]] = &[AUCTION_SEED, mint_key.as_ref(), &bump];
    let signer = [seeds];
    token_interface::transfer_checked(
        CpiContext::new_with_signer(
            token_program.key(),
            TransferChecked {
                from: vault.to_account_info(),
                mint: mint.to_account_info(),
                to: to.clone(),
                authority: auction.to_account_info(),
            },
            &signer,
        ),
        1,
        0,
    )?;
    token_interface::close_account(CpiContext::new_with_signer(
        token_program.key(),
        CloseAccount {
            account: vault.to_account_info(),
            destination: rent_receiver.clone(),
            authority: auction.to_account_info(),
        },
        &signer,
    ))
}

#[account]
#[derive(InitSpace)]
pub struct Auction {
    pub seller: Pubkey,
    pub mint: Pubkey,
    pub min_bid: u64,
    pub min_increment_bps: u16,
    pub highest_bid: u64,
    pub highest_bidder: Pubkey,
    pub starts_at: i64,
    pub ends_at: i64,
    pub bump: u8,
}

impl Auction {
    /// Smallest acceptable next bid (increment rounded up).
    pub fn next_min_bid(&self) -> u64 {
        if self.highest_bid == 0 {
            return self.min_bid;
        }
        let increment =
            (self.highest_bid as u128 * self.min_increment_bps as u128).div_ceil(10_000);
        let next = (self.highest_bid as u128 + increment.max(1)).min(u64::MAX as u128) as u64;
        next.max(self.min_bid)
    }
}

#[derive(Accounts)]
pub struct CreateAuction<'info> {
    #[account(mut)]
    pub seller: Signer<'info>,
    #[account(
        mint::token_program = token_program,
        constraint = mint.decimals == 0 && mint.supply == 1 @ AuctionError::NotAnNft
    )]
    pub mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(mut, token::mint = mint, token::authority = seller)]
    pub seller_token_account: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(
        init,
        payer = seller,
        space = 8 + Auction::INIT_SPACE,
        seeds = [AUCTION_SEED, mint.key().as_ref()],
        bump
    )]
    pub auction: Account<'info, Auction>,
    #[account(
        init,
        payer = seller,
        associated_token::mint = mint,
        associated_token::authority = auction,
        associated_token::token_program = token_program
    )]
    pub vault: Box<InterfaceAccount<'info, TokenAccount>>,
    pub token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct PlaceBid<'info> {
    #[account(mut)]
    pub bidder: Signer<'info>,
    #[account(mut, seeds = [AUCTION_SEED, auction.mint.as_ref()], bump = auction.bump)]
    pub auction: Account<'info, Auction>,
    /// Receives the refund of the outbid amount; must equal `auction.highest_bidder`
    /// when a bid exists (checked in the handler). Ignored for the first bid.
    #[account(mut)]
    pub previous_bidder: SystemAccount<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct SettleAuction<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(mut, address = auction.seller)]
    pub seller: SystemAccount<'info>,
    /// Winner, or the seller when there were no bids (checked in the handler).
    pub receiver: SystemAccount<'info>,
    #[account(
        mut,
        close = seller,
        seeds = [AUCTION_SEED, mint.key().as_ref()],
        bump = auction.bump,
        has_one = mint
    )]
    pub auction: Account<'info, Auction>,
    #[account(mint::token_program = token_program)]
    pub mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = auction,
        associated_token::token_program = token_program
    )]
    pub vault: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(
        init_if_needed,
        payer = payer,
        associated_token::mint = mint,
        associated_token::authority = receiver,
        associated_token::token_program = token_program
    )]
    pub receiver_token_account: Box<InterfaceAccount<'info, TokenAccount>>,
    pub token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct CancelAuction<'info> {
    #[account(mut)]
    pub seller: Signer<'info>,
    #[account(
        mut,
        close = seller,
        seeds = [AUCTION_SEED, mint.key().as_ref()],
        bump = auction.bump,
        has_one = seller,
        has_one = mint
    )]
    pub auction: Account<'info, Auction>,
    #[account(mint::token_program = token_program)]
    pub mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = auction,
        associated_token::token_program = token_program
    )]
    pub vault: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(mut, token::mint = mint, token::authority = seller)]
    pub seller_token_account: Box<InterfaceAccount<'info, TokenAccount>>,
    pub token_program: Interface<'info, TokenInterface>,
}

#[event]
pub struct AuctionCreated {
    pub auction: Pubkey,
    pub mint: Pubkey,
    pub seller: Pubkey,
    pub min_bid: u64,
    pub ends_at: i64,
}

#[event]
pub struct BidPlaced {
    pub auction: Pubkey,
    pub bidder: Pubkey,
    pub amount: u64,
    pub ends_at: i64,
}

#[event]
pub struct AuctionSettled {
    pub auction: Pubkey,
    pub winner: Option<Pubkey>,
    pub amount: u64,
}

#[error_code]
pub enum AuctionError {
    #[msg("Invalid auction parameters")]
    InvalidParams,
    #[msg("Mint is not a non-fungible token (decimals 0, supply 1)")]
    NotAnNft,
    #[msg("Auction has ended")]
    AuctionEnded,
    #[msg("Auction is still active")]
    AuctionActive,
    #[msg("Bid is below the minimum next bid")]
    BidTooLow,
    #[msg("The seller cannot bid on their own auction")]
    SellerCannotBid,
    #[msg("previous_bidder does not match the current highest bidder")]
    WrongPreviousBidder,
    #[msg("receiver must be the winner, or the seller when there were no bids")]
    WrongReceiver,
    #[msg("Auction already has bids")]
    HasBids,
}

#[cfg(test)]
mod tests {
    use super::*;

    fn auction(min_bid: u64, inc: u16, highest: u64) -> Auction {
        Auction {
            seller: Pubkey::default(),
            mint: Pubkey::default(),
            min_bid,
            min_increment_bps: inc,
            highest_bid: highest,
            highest_bidder: Pubkey::default(),
            starts_at: 0,
            ends_at: 0,
            bump: 0,
        }
    }

    #[test]
    fn next_min_bid_rules() {
        assert_eq!(auction(100, 500, 0).next_min_bid(), 100);
        assert_eq!(auction(100, 500, 1_000).next_min_bid(), 1_050);
        assert_eq!(auction(100, 500, 101).next_min_bid(), 107); // 5.05 rounds up to 6
        assert_eq!(auction(100, 0, 1_000).next_min_bid(), 1_001); // strictly higher
        assert_eq!(auction(u64::MAX, 500, u64::MAX).next_min_bid(), u64::MAX);
    }
}
