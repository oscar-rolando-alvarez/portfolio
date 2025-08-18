use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer, MintTo, Burn};
use crate::errors::LendingError;

pub struct TokenUtils;

impl TokenUtils {
    /// Transfer tokens from one account to another
    pub fn transfer_tokens<'info>(
        token_program: &Program<'info, Token>,
        from: &Account<'info, TokenAccount>,
        to: &Account<'info, TokenAccount>,
        authority: &AccountInfo<'info>,
        amount: u64,
        signer_seeds: &[&[&[u8]]],
    ) -> Result<()> {
        let cpi_accounts = Transfer {
            from: from.to_account_info(),
            to: to.to_account_info(),
            authority: authority.clone(),
        };

        let cpi_context = if signer_seeds.is_empty() {
            CpiContext::new(token_program.to_account_info(), cpi_accounts)
        } else {
            CpiContext::new_with_signer(
                token_program.to_account_info(),
                cpi_accounts,
                signer_seeds,
            )
        };

        token::transfer(cpi_context, amount)
    }

    /// Mint tokens to an account
    pub fn mint_tokens<'info>(
        token_program: &Program<'info, Token>,
        mint: &Account<'info, Mint>,
        to: &Account<'info, TokenAccount>,
        authority: &AccountInfo<'info>,
        amount: u64,
        signer_seeds: &[&[&[u8]]],
    ) -> Result<()> {
        let cpi_accounts = MintTo {
            mint: mint.to_account_info(),
            to: to.to_account_info(),
            authority: authority.clone(),
        };

        let cpi_context = if signer_seeds.is_empty() {
            CpiContext::new(token_program.to_account_info(), cpi_accounts)
        } else {
            CpiContext::new_with_signer(
                token_program.to_account_info(),
                cpi_accounts,
                signer_seeds,
            )
        };

        token::mint_to(cpi_context, amount)
    }

    /// Burn tokens from an account
    pub fn burn_tokens<'info>(
        token_program: &Program<'info, Token>,
        mint: &Account<'info, Mint>,
        from: &Account<'info, TokenAccount>,
        authority: &AccountInfo<'info>,
        amount: u64,
        signer_seeds: &[&[&[u8]]],
    ) -> Result<()> {
        let cpi_accounts = Burn {
            mint: mint.to_account_info(),
            from: from.to_account_info(),
            authority: authority.clone(),
        };

        let cpi_context = if signer_seeds.is_empty() {
            CpiContext::new(token_program.to_account_info(), cpi_accounts)
        } else {
            CpiContext::new_with_signer(
                token_program.to_account_info(),
                cpi_accounts,
                signer_seeds,
            )
        };

        token::burn(cpi_context, amount)
    }

    /// Validate token account ownership and mint
    pub fn validate_token_account(
        token_account: &Account<TokenAccount>,
        expected_mint: &Pubkey,
        expected_owner: Option<&Pubkey>,
    ) -> Result<()> {
        // Check mint
        if token_account.mint != *expected_mint {
            return Err(LendingError::InvalidTokenMint.into());
        }

        // Check owner if specified
        if let Some(owner) = expected_owner {
            if token_account.owner != *owner {
                return Err(LendingError::Unauthorized.into());
            }
        }

        Ok(())
    }

    /// Validate mint account
    pub fn validate_mint(
        mint: &Account<Mint>,
        expected_decimals: Option<u8>,
        expected_authority: Option<&Pubkey>,
    ) -> Result<()> {
        // Check decimals if specified
        if let Some(decimals) = expected_decimals {
            if mint.decimals != decimals {
                return Err(LendingError::InvalidTokenMint.into());
            }
        }

        // Check mint authority if specified
        if let Some(authority) = expected_authority {
            if mint.mint_authority.as_ref() != Some(authority) {
                return Err(LendingError::Unauthorized.into());
            }
        }

        Ok(())
    }

    /// Calculate aToken amount based on liquidity index
    pub fn calculate_a_token_amount(
        underlying_amount: u64,
        liquidity_index: u128,
    ) -> Result<u64> {
        let normalized_amount = (underlying_amount as u128)
            .checked_mul(crate::constants::RAY)
            .ok_or(LendingError::MathOverflow)?;

        normalized_amount
            .checked_div(liquidity_index)
            .ok_or(LendingError::MathOverflow)?
            .try_into()
            .map_err(|_| LendingError::MathOverflow.into())
    }

    /// Calculate underlying amount from aToken amount
    pub fn calculate_underlying_amount(
        a_token_amount: u64,
        liquidity_index: u128,
    ) -> Result<u64> {
        let normalized_amount = (a_token_amount as u128)
            .checked_mul(liquidity_index)
            .ok_or(LendingError::MathOverflow)?;

        normalized_amount
            .checked_div(crate::constants::RAY)
            .ok_or(LendingError::MathOverflow)?
            .try_into()
            .map_err(|_| LendingError::MathOverflow.into())
    }

    /// Calculate debt token amount based on borrow index
    pub fn calculate_debt_token_amount(
        borrow_amount: u64,
        borrow_index: u128,
    ) -> Result<u64> {
        let normalized_amount = (borrow_amount as u128)
            .checked_mul(crate::constants::RAY)
            .ok_or(LendingError::MathOverflow)?;

        normalized_amount
            .checked_div(borrow_index)
            .ok_or(LendingError::MathOverflow)?
            .try_into()
            .map_err(|_| LendingError::MathOverflow.into())
    }

    /// Calculate current debt from debt tokens
    pub fn calculate_current_debt(
        debt_token_amount: u64,
        borrow_index: u128,
    ) -> Result<u64> {
        let normalized_amount = (debt_token_amount as u128)
            .checked_mul(borrow_index)
            .ok_or(LendingError::MathOverflow)?;

        normalized_amount
            .checked_div(crate::constants::RAY)
            .ok_or(LendingError::MathOverflow)?
            .try_into()
            .map_err(|_| LendingError::MathOverflow.into())
    }

    /// Check if account has sufficient balance
    pub fn check_sufficient_balance(
        token_account: &Account<TokenAccount>,
        required_amount: u64,
    ) -> Result<()> {
        if token_account.amount < required_amount {
            return Err(LendingError::InsufficientLiquidity.into());
        }
        Ok(())
    }

    /// Get scaled balance for cross-token calculations
    pub fn get_scaled_balance(
        balance: u64,
        from_decimals: u8,
        to_decimals: u8,
    ) -> Result<u64> {
        if from_decimals == to_decimals {
            return Ok(balance);
        }

        if from_decimals > to_decimals {
            let scale_down = 10_u64.pow((from_decimals - to_decimals) as u32);
            balance
                .checked_div(scale_down)
                .ok_or(LendingError::MathOverflow.into())
        } else {
            let scale_up = 10_u64.pow((to_decimals - from_decimals) as u32);
            balance
                .checked_mul(scale_up)
                .ok_or(LendingError::MathOverflow.into())
        }
    }

    /// Calculate interest accrued since last update
    pub fn calculate_accrued_interest(
        principal: u64,
        rate: u64,               // Annual rate in basis points
        time_elapsed: i64,       // Time in seconds
    ) -> Result<u64> {
        if time_elapsed <= 0 {
            return Ok(0);
        }

        let annual_rate_decimal = (rate as u128)
            .checked_div(crate::constants::BASIS_POINTS as u128)
            .ok_or(LendingError::MathOverflow)?;

        let rate_per_second = annual_rate_decimal
            .checked_div(crate::constants::SECONDS_PER_YEAR as u128)
            .ok_or(LendingError::MathOverflow)?;

        let interest = (principal as u128)
            .checked_mul(rate_per_second)
            .ok_or(LendingError::MathOverflow)?
            .checked_mul(time_elapsed as u128)
            .ok_or(LendingError::MathOverflow)?;

        interest
            .try_into()
            .map_err(|_| LendingError::MathOverflow.into())
    }

    /// Validate token program account
    pub fn validate_token_program(token_program: &AccountInfo) -> Result<()> {
        if token_program.key != &spl_token::ID {
            return Err(LendingError::InvalidProgramOwner.into());
        }
        Ok(())
    }

    /// Create token account seeds for PDA
    pub fn create_token_account_seeds<'a>(
        base_seed: &'a [u8],
        mint: &'a Pubkey,
        bump: &'a [u8],
    ) -> [&'a [u8]; 3] {
        [base_seed, mint.as_ref(), bump]
    }

    /// Calculate token value in USD
    pub fn calculate_usd_value(
        token_amount: u64,
        token_price: u64,        // Price with 8 decimals
        token_decimals: u8,
    ) -> Result<u64> {
        // Normalize token amount to 8 decimals
        let normalized_amount = if token_decimals > 8 {
            let scale_down = 10_u64.pow((token_decimals - 8) as u32);
            token_amount
                .checked_div(scale_down)
                .ok_or(LendingError::MathOverflow)?
        } else {
            let scale_up = 10_u64.pow((8 - token_decimals) as u32);
            token_amount
                .checked_mul(scale_up)
                .ok_or(LendingError::MathOverflow)?
        };

        // Calculate USD value
        normalized_amount
            .checked_mul(token_price)
            .ok_or(LendingError::MathOverflow)?
            .checked_div(100_000_000) // Divide by 10^8 to get whole USD
            .ok_or(LendingError::MathOverflow.into())
    }

    /// Calculate minimum transfer amount to avoid dust
    pub fn calculate_min_transfer_amount(decimals: u8) -> u64 {
        // Minimum transfer is 0.000001 tokens
        10_u64.pow(decimals.saturating_sub(6) as u32)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_a_token_calculations() {
        let underlying = 1000;
        let index = crate::constants::RAY * 110 / 100; // 1.1 index
        
        let a_tokens = TokenUtils::calculate_a_token_amount(underlying, index).unwrap();
        let back_to_underlying = TokenUtils::calculate_underlying_amount(a_tokens, index).unwrap();
        
        assert_eq!(back_to_underlying, underlying);
    }

    #[test]
    fn test_usd_value_calculation() {
        let amount = 1_000_000; // 1 USDC (6 decimals)
        let price = 100_000_000; // $1.00 (8 decimals)
        let usd_value = TokenUtils::calculate_usd_value(amount, price, 6).unwrap();
        assert_eq!(usd_value, 1); // $1
    }

    #[test]
    fn test_scaled_balance() {
        let balance = 1_000_000; // 1 token with 6 decimals
        let scaled = TokenUtils::get_scaled_balance(balance, 6, 18).unwrap();
        assert_eq!(scaled, 1_000_000_000_000_000_000); // 1 token with 18 decimals
    }
}