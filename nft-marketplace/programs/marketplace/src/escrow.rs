//! Moves the escrowed NFT out of a listing vault and closes the vault.

use crate::state::LISTING_SEED;
use anchor_lang::prelude::*;
use anchor_lang::system_program::{self, Transfer};
use anchor_spl::token_interface::{self, CloseAccount, TransferChecked};

pub struct Escrow<'a, 'info> {
    pub token_program: &'a AccountInfo<'info>,
    pub mint: &'a AccountInfo<'info>,
    pub vault: &'a AccountInfo<'info>,
    pub listing: &'a AccountInfo<'info>,
    pub listing_bump: u8,
}

impl<'info> Escrow<'_, 'info> {
    /// Sends the NFT to `to` and returns the vault rent to `rent_receiver`.
    pub fn release(
        &self,
        to: &AccountInfo<'info>,
        rent_receiver: &AccountInfo<'info>,
    ) -> Result<()> {
        let mint_key = self.mint.key();
        let bump = [self.listing_bump];
        let seeds: &[&[u8]] = &[LISTING_SEED, mint_key.as_ref(), &bump];
        let signer = [seeds];

        token_interface::transfer_checked(
            CpiContext::new_with_signer(
                self.token_program.key(),
                TransferChecked {
                    from: self.vault.clone(),
                    mint: self.mint.clone(),
                    to: to.clone(),
                    authority: self.listing.clone(),
                },
                &signer,
            ),
            1,
            0,
        )?;
        token_interface::close_account(CpiContext::new_with_signer(
            self.token_program.key(),
            CloseAccount {
                account: self.vault.clone(),
                destination: rent_receiver.clone(),
                authority: self.listing.clone(),
            },
            &signer,
        ))
    }
}

/// Plain SOL transfer from a signer through the system program.
pub fn pay<'info>(
    system_program: &AccountInfo<'info>,
    from: &AccountInfo<'info>,
    to: &AccountInfo<'info>,
    lamports: u64,
) -> Result<()> {
    if lamports == 0 {
        return Ok(());
    }
    system_program::transfer(
        CpiContext::new(
            system_program.key(),
            Transfer {
                from: from.clone(),
                to: to.clone(),
            },
        ),
        lamports,
    )
}
