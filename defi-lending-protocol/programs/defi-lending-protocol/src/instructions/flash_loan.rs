use anchor_lang::prelude::*;
use anchor_lang::solana_program::{
    instruction::Instruction,
    program::invoke,
};
use anchor_spl::token::{Token, TokenAccount, Transfer};
use crate::constants::*;
use crate::errors::LendingError;
use crate::state::{Protocol, Pool};
use crate::utils::{TokenUtils, calculate_flash_loan_fee};

#[derive(Accounts)]
pub struct FlashLoan<'info> {
    #[account(
        seeds = [PROTOCOL_SEED],
        bump = protocol.bump,
        constraint = !protocol.is_paused() @ LendingError::PoolPaused
    )]
    pub protocol: Account<'info, Protocol>,
    
    #[account(
        mut,
        seeds = [POOL_SEED, pool.asset_mint.as_ref()],
        bump = pool.bump,
        constraint = pool.is_active() @ LendingError::PoolPaused
    )]
    pub pool: Account<'info, Pool>,
    
    #[account(
        mut,
        address = pool.asset_token_account
    )]
    pub pool_asset_account: Account<'info, TokenAccount>,
    
    #[account(
        mut,
        token::mint = pool.asset_mint
    )]
    pub receiver_asset_account: Account<'info, TokenAccount>,
    
    /// CHECK: PDA authority for the pool
    #[account(
        seeds = [POOL_SEED, pool.asset_mint.as_ref(), b"authority"],
        bump
    )]
    pub pool_authority: UncheckedAccount<'info>,
    
    /// The program that will receive the flash loan
    /// CHECK: Any program can be a flash loan receiver
    pub receiver_program: UncheckedAccount<'info>,
    
    /// Protocol treasury for flash loan fees
    #[account(
        mut,
        token::mint = pool.asset_mint,
        address = protocol.treasury
    )]
    pub treasury_account: Account<'info, TokenAccount>,
    
    pub user: Signer<'info>,
    pub token_program: Program<'info, Token>,
}

pub fn flash_loan(
    ctx: Context<FlashLoan>,
    amount: u64,
    params: Vec<u8>,
) -> Result<()> {
    if amount == 0 {
        return Err(LendingError::InvalidAmount.into());
    }

    let pool = &mut ctx.accounts.pool;
    
    // Check available liquidity
    if pool.available_liquidity < amount {
        return Err(LendingError::InsufficientLiquidity.into());
    }
    
    // Calculate flash loan fee
    let fee = calculate_flash_loan_fee(amount)?;
    let total_owed = amount
        .checked_add(fee)
        .ok_or(LendingError::MathOverflow)?;
    
    // Store initial balance for verification later
    let initial_balance = ctx.accounts.pool_asset_account.amount;
    
    // Transfer tokens to receiver
    let pool_seeds = &[
        POOL_SEED,
        pool.asset_mint.as_ref(),
        b"authority",
        &[ctx.bumps.pool_authority],
    ];
    let signer_seeds = &[&pool_seeds[..]];
    
    TokenUtils::transfer_tokens(
        &ctx.accounts.token_program,
        &ctx.accounts.pool_asset_account,
        &ctx.accounts.receiver_asset_account,
        &ctx.accounts.pool_authority.to_account_info(),
        amount,
        signer_seeds,
    )?;
    
    // Create flash loan callback instruction
    let flash_loan_callback = Instruction {
        program_id: ctx.accounts.receiver_program.key(),
        accounts: vec![
            // The receiver program should expect these accounts
            AccountMeta::new(ctx.accounts.receiver_asset_account.key(), false),
            AccountMeta::new(ctx.accounts.pool_asset_account.key(), false),
            AccountMeta::new_readonly(ctx.accounts.pool_authority.key(), false),
            AccountMeta::new_readonly(ctx.accounts.token_program.key(), false),
        ],
        data: [
            // Flash loan callback discriminator (first 8 bytes)
            &[0x1a, 0x69, 0x8a, 0x5e, 0x1a, 0x69, 0x8a, 0x5e],
            &amount.to_le_bytes(),
            &fee.to_le_bytes(),
            &params,
        ].concat(),
    };
    
    // Invoke the receiver program
    invoke(
        &flash_loan_callback,
        &[
            ctx.accounts.receiver_asset_account.to_account_info(),
            ctx.accounts.pool_asset_account.to_account_info(),
            ctx.accounts.pool_authority.to_account_info(),
            ctx.accounts.token_program.to_account_info(),
        ],
    )?;
    
    // Reload the pool asset account to check repayment
    ctx.accounts.pool_asset_account.reload()?;
    
    let final_balance = ctx.accounts.pool_asset_account.amount;
    let expected_balance = initial_balance
        .checked_add(fee)
        .ok_or(LendingError::MathOverflow)?;
    
    // Verify that the loan was repaid with fee
    if final_balance < expected_balance {
        if final_balance < initial_balance {
            return Err(LendingError::FlashLoanNotRepaid.into());
        } else {
            return Err(LendingError::FlashLoanFeeNotPaid.into());
        }
    }
    
    // Transfer fee to treasury
    if fee > 0 {
        TokenUtils::transfer_tokens(
            &ctx.accounts.token_program,
            &ctx.accounts.pool_asset_account,
            &ctx.accounts.treasury_account,
            &ctx.accounts.pool_authority.to_account_info(),
            fee,
            signer_seeds,
        )?;
    }
    
    // Update pool state - available liquidity stays the same, but we collected fees
    pool.available_liquidity = ctx.accounts.pool_asset_account.amount
        .checked_sub(pool.get_total_debt())
        .unwrap_or(0);
    
    msg!(
        "Flash loan executed: amount={}, fee={}, receiver={}",
        amount,
        fee,
        ctx.accounts.receiver_program.key()
    );

    Ok(())
}

// Flash loan receiver interface
#[derive(Accounts)]
pub struct FlashLoanReceiver<'info> {
    #[account(mut)]
    pub asset_account: Account<'info, TokenAccount>,
    
    #[account(mut)]
    pub pool_asset_account: Account<'info, TokenAccount>,
    
    /// CHECK: Pool authority
    pub pool_authority: UncheckedAccount<'info>,
    
    pub token_program: Program<'info, Token>,
}

// This would be implemented by flash loan receiver programs
pub trait FlashLoanReceiverInterface {
    fn execute_operation(
        ctx: Context<FlashLoanReceiver>,
        amount: u64,
        fee: u64,
        params: Vec<u8>,
    ) -> Result<()>;
}