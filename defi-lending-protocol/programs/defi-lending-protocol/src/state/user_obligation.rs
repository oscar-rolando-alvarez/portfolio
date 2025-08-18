use anchor_lang::prelude::*;
use crate::state::{InterestRateMode, UserYieldState};

/// Maximum number of deposits per user
pub const MAX_DEPOSITS: usize = 10;
/// Maximum number of borrows per user
pub const MAX_BORROWS: usize = 10;

/// User deposit position
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug)]
pub struct DepositPosition {
    /// Pool public key
    pub pool: Pubkey,
    /// Amount of aTokens deposited
    pub amount: u64,
    /// Last update timestamp
    pub last_update_timestamp: i64,
}

/// User borrow position
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug)]
pub struct BorrowPosition {
    /// Pool public key
    pub pool: Pubkey,
    /// Principal amount borrowed
    pub principal_amount: u64,
    /// Normalized debt amount
    pub normalized_debt: u64,
    /// Interest rate mode
    pub interest_rate_mode: InterestRateMode,
    /// Stable rate (if stable mode)
    pub stable_rate: u64,
    /// Last update timestamp
    pub last_update_timestamp: i64,
}

/// User obligation account
#[account]
#[derive(Debug)]
pub struct UserObligation {
    /// User wallet address
    pub user: Pubkey,
    /// Protocol account
    pub protocol: Pubkey,
    /// User deposit positions
    pub deposits: [DepositPosition; MAX_DEPOSITS],
    /// Number of active deposits
    pub deposits_len: u32,
    /// User borrow positions
    pub borrows: [BorrowPosition; MAX_BORROWS],
    /// Number of active borrows
    pub borrows_len: u32,
    /// Total collateral value in USD
    pub total_collateral_value: u64,
    /// Total debt value in USD
    pub total_debt_value: u64,
    /// User yield farming states for each pool
    pub yield_states: [UserYieldState; MAX_DEPOSITS],
    /// Last health factor calculation
    pub health_factor: u64,
    /// Last update timestamp
    pub last_update_timestamp: i64,
    /// Obligation bump seed
    pub bump: u8,
}

impl UserObligation {
    pub const LEN: usize = 8 + 32 * 2 + 
        std::mem::size_of::<[DepositPosition; MAX_DEPOSITS]>() + 4 +
        std::mem::size_of::<[BorrowPosition; MAX_BORROWS]>() + 4 +
        8 * 3 + 
        std::mem::size_of::<[UserYieldState; MAX_DEPOSITS]>() +
        8 * 2 + 1;

    pub fn add_deposit(&mut self, pool: Pubkey, amount: u64) -> Result<()> {
        if self.deposits_len as usize >= MAX_DEPOSITS {
            return Err(crate::errors::LendingError::MaxPositionsReached.into());
        }

        // Check if deposit already exists for this pool
        for i in 0..self.deposits_len as usize {
            if self.deposits[i].pool == pool {
                self.deposits[i].amount = self.deposits[i].amount
                    .checked_add(amount)
                    .ok_or(crate::errors::LendingError::MathOverflow)?;
                self.deposits[i].last_update_timestamp = Clock::get()?.unix_timestamp;
                return Ok(());
            }
        }

        // Add new deposit
        let index = self.deposits_len as usize;
        self.deposits[index] = DepositPosition {
            pool,
            amount,
            last_update_timestamp: Clock::get()?.unix_timestamp,
        };
        self.deposits_len += 1;

        Ok(())
    }

    pub fn remove_deposit(&mut self, pool: Pubkey, amount: u64) -> Result<()> {
        for i in 0..self.deposits_len as usize {
            if self.deposits[i].pool == pool {
                if self.deposits[i].amount < amount {
                    return Err(crate::errors::LendingError::InsufficientLiquidity.into());
                }

                self.deposits[i].amount = self.deposits[i].amount
                    .checked_sub(amount)
                    .ok_or(crate::errors::LendingError::MathOverflow)?;
                
                self.deposits[i].last_update_timestamp = Clock::get()?.unix_timestamp;

                // Remove position if amount is zero
                if self.deposits[i].amount == 0 {
                    // Shift remaining deposits
                    for j in i..self.deposits_len as usize - 1 {
                        self.deposits[j] = self.deposits[j + 1];
                    }
                    self.deposits_len -= 1;
                }
                return Ok(());
            }
        }

        Err(crate::errors::LendingError::PoolNotFound.into())
    }

    pub fn add_borrow(
        &mut self,
        pool: Pubkey,
        amount: u64,
        interest_rate_mode: InterestRateMode,
        stable_rate: u64,
    ) -> Result<()> {
        if self.borrows_len as usize >= MAX_BORROWS {
            return Err(crate::errors::LendingError::MaxPositionsReached.into());
        }

        // Check if borrow already exists for this pool and rate mode
        for i in 0..self.borrows_len as usize {
            if self.borrows[i].pool == pool && self.borrows[i].interest_rate_mode == interest_rate_mode {
                self.borrows[i].principal_amount = self.borrows[i].principal_amount
                    .checked_add(amount)
                    .ok_or(crate::errors::LendingError::MathOverflow)?;
                self.borrows[i].last_update_timestamp = Clock::get()?.unix_timestamp;
                return Ok(());
            }
        }

        // Add new borrow
        let index = self.borrows_len as usize;
        self.borrows[index] = BorrowPosition {
            pool,
            principal_amount: amount,
            normalized_debt: amount, // Will be updated with proper calculation
            interest_rate_mode,
            stable_rate,
            last_update_timestamp: Clock::get()?.unix_timestamp,
        };
        self.borrows_len += 1;

        Ok(())
    }

    pub fn remove_borrow(&mut self, pool: Pubkey, amount: u64, interest_rate_mode: InterestRateMode) -> Result<()> {
        for i in 0..self.borrows_len as usize {
            if self.borrows[i].pool == pool && self.borrows[i].interest_rate_mode == interest_rate_mode {
                if self.borrows[i].principal_amount < amount {
                    return Err(crate::errors::LendingError::InsufficientLiquidity.into());
                }

                self.borrows[i].principal_amount = self.borrows[i].principal_amount
                    .checked_sub(amount)
                    .ok_or(crate::errors::LendingError::MathOverflow)?;
                
                self.borrows[i].last_update_timestamp = Clock::get()?.unix_timestamp;

                // Remove position if amount is zero
                if self.borrows[i].principal_amount == 0 {
                    // Shift remaining borrows
                    for j in i..self.borrows_len as usize - 1 {
                        self.borrows[j] = self.borrows[j + 1];
                    }
                    self.borrows_len -= 1;
                }
                return Ok(());
            }
        }

        Err(crate::errors::LendingError::PoolNotFound.into())
    }

    pub fn calculate_health_factor(&self, collateral_prices: &[u64], debt_prices: &[u64]) -> Result<u64> {
        let mut total_collateral_usd = 0u64;
        let mut total_debt_usd = 0u64;

        // Calculate total collateral value
        for i in 0..self.deposits_len as usize {
            let deposit = &self.deposits[i];
            // This is simplified - in practice, you'd need to fetch pool data and apply LTV
            total_collateral_usd = total_collateral_usd
                .checked_add(deposit.amount)
                .ok_or(crate::errors::LendingError::MathOverflow)?;
        }

        // Calculate total debt value
        for i in 0..self.borrows_len as usize {
            let borrow = &self.borrows[i];
            total_debt_usd = total_debt_usd
                .checked_add(borrow.principal_amount)
                .ok_or(crate::errors::LendingError::MathOverflow)?;
        }

        if total_debt_usd == 0 {
            return Ok(u64::MAX); // No debt means healthy
        }

        // Health factor = total_collateral * liquidation_threshold / total_debt
        // Using basis points (10000 = 100%)
        let health_factor = total_collateral_usd
            .checked_mul(crate::constants::BASIS_POINTS)
            .ok_or(crate::errors::LendingError::MathOverflow)?
            .checked_div(total_debt_usd)
            .ok_or(crate::errors::LendingError::MathOverflow)?;

        Ok(health_factor)
    }

    pub fn is_liquidatable(&self) -> bool {
        // Health factor below 100% (10000 basis points) means liquidatable
        self.health_factor < crate::constants::BASIS_POINTS
    }

    pub fn update_totals(&mut self, total_collateral_value: u64, total_debt_value: u64) {
        self.total_collateral_value = total_collateral_value;
        self.total_debt_value = total_debt_value;
        self.last_update_timestamp = Clock::get().unwrap().unix_timestamp;
    }
}