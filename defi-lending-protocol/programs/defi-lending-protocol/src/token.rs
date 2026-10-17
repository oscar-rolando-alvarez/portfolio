//! Thin wrappers over SPL Token / Token-2022 CPIs via the token interface.

use anchor_lang::prelude::*;
use anchor_spl::token_interface::{self, Burn, MintTo, TransferChecked};

pub struct TransferArgs<'a, 'info> {
    pub token_program: &'a AccountInfo<'info>,
    pub from: &'a AccountInfo<'info>,
    pub to: &'a AccountInfo<'info>,
    pub mint: &'a AccountInfo<'info>,
    pub authority: &'a AccountInfo<'info>,
    pub decimals: u8,
}

pub fn transfer(args: TransferArgs<'_, '_>, amount: u64, signer: &[&[&[u8]]]) -> Result<()> {
    if amount == 0 {
        return Ok(());
    }
    let accounts = TransferChecked {
        from: args.from.clone(),
        mint: args.mint.clone(),
        to: args.to.clone(),
        authority: args.authority.clone(),
    };
    let ctx = CpiContext::new_with_signer(args.token_program.key(), accounts, signer);
    token_interface::transfer_checked(ctx, amount, args.decimals)
}

pub fn mint_to<'info>(
    token_program: &AccountInfo<'info>,
    mint: &AccountInfo<'info>,
    to: &AccountInfo<'info>,
    authority: &AccountInfo<'info>,
    amount: u64,
    signer: &[&[&[u8]]],
) -> Result<()> {
    let accounts = MintTo {
        mint: mint.clone(),
        to: to.clone(),
        authority: authority.clone(),
    };
    let ctx = CpiContext::new_with_signer(token_program.key(), accounts, signer);
    token_interface::mint_to(ctx, amount)
}

pub fn burn<'info>(
    token_program: &AccountInfo<'info>,
    mint: &AccountInfo<'info>,
    from: &AccountInfo<'info>,
    authority: &AccountInfo<'info>,
    amount: u64,
) -> Result<()> {
    let accounts = Burn {
        mint: mint.clone(),
        from: from.clone(),
        authority: authority.clone(),
    };
    let ctx = CpiContext::new(token_program.key(), accounts);
    token_interface::burn(ctx, amount)
}
