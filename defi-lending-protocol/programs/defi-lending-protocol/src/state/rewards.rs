use anchor_lang::prelude::*;

/// Rewards distribution configuration
#[account]
#[derive(Debug)]
pub struct RewardsConfig {
    /// Rewards token mint
    pub rewards_token_mint: Pubkey,
    /// Rewards vault
    pub rewards_vault: Pubkey,
    /// Total rewards per second distributed
    pub total_rewards_per_second: u64,
    /// Emission start time
    pub emission_start_time: i64,
    /// Emission end time
    pub emission_end_time: i64,
    /// Last rewards distribution time
    pub last_distribution_time: i64,
    /// Total rewards distributed
    pub total_rewards_distributed: u64,
    /// Admin (can update rewards configuration)
    pub admin: Pubkey,
    /// Configuration bump seed
    pub bump: u8,
}

impl RewardsConfig {
    pub const LEN: usize = 8 + 32 * 3 + 8 * 5 + 1;

    pub fn is_active(&self, current_timestamp: i64) -> bool {
        current_timestamp >= self.emission_start_time && current_timestamp <= self.emission_end_time
    }

    pub fn calculate_pending_rewards(&self, current_timestamp: i64) -> u64 {
        if !self.is_active(current_timestamp) {
            return 0;
        }

        let time_elapsed = current_timestamp
            .saturating_sub(self.last_distribution_time);
        
        self.total_rewards_per_second
            .checked_mul(time_elapsed as u64)
            .unwrap_or(0)
    }
}

/// Pool rewards state
#[account]
#[derive(Debug)]
pub struct PoolRewards {
    /// Pool public key
    pub pool: Pubkey,
    /// Rewards per second for this pool
    pub rewards_per_second: u64,
    /// Total supply points (staked amounts * multipliers)
    pub total_supply_points: u128,
    /// Total borrow points (borrowed amounts * multipliers)
    pub total_borrow_points: u128,
    /// Supply rewards per point stored
    pub supply_rewards_per_point_stored: u128,
    /// Borrow rewards per point stored
    pub borrow_rewards_per_point_stored: u128,
    /// Last update timestamp
    pub last_update_time: i64,
    /// Pool allocation points
    pub allocation_points: u64,
    /// Pool rewards bump seed
    pub bump: u8,
}

impl PoolRewards {
    pub const LEN: usize = 8 + 32 + 8 + 16 * 4 + 8 + 8 + 1;

    pub fn update_rewards_per_point(&mut self, current_timestamp: i64, rewards_per_second: u64) {
        let time_elapsed = current_timestamp
            .saturating_sub(self.last_update_time);
        
        if time_elapsed > 0 && rewards_per_second > 0 {
            let total_rewards = rewards_per_second
                .checked_mul(time_elapsed as u64)
                .unwrap_or(0) as u128;

            // Update supply rewards per point
            if self.total_supply_points > 0 {
                let supply_rewards_increment = total_rewards
                    .checked_mul(crate::constants::RAY)
                    .unwrap_or(0)
                    .checked_div(self.total_supply_points)
                    .unwrap_or(0)
                    .checked_div(2) // 50% to suppliers
                    .unwrap_or(0);
                
                self.supply_rewards_per_point_stored = self.supply_rewards_per_point_stored
                    .checked_add(supply_rewards_increment)
                    .unwrap_or(self.supply_rewards_per_point_stored);
            }

            // Update borrow rewards per point
            if self.total_borrow_points > 0 {
                let borrow_rewards_increment = total_rewards
                    .checked_mul(crate::constants::RAY)
                    .unwrap_or(0)
                    .checked_div(self.total_borrow_points)
                    .unwrap_or(0)
                    .checked_div(2) // 50% to borrowers
                    .unwrap_or(0);
                
                self.borrow_rewards_per_point_stored = self.borrow_rewards_per_point_stored
                    .checked_add(borrow_rewards_increment)
                    .unwrap_or(self.borrow_rewards_per_point_stored);
            }

            self.last_update_time = current_timestamp;
        }
    }
}

/// User rewards state
#[account]
#[derive(Debug)]
pub struct UserRewards {
    /// User wallet
    pub user: Pubkey,
    /// Pool public key
    pub pool: Pubkey,
    /// User supply points
    pub user_supply_points: u128,
    /// User borrow points
    pub user_borrow_points: u128,
    /// Supply rewards per point paid
    pub supply_rewards_per_point_paid: u128,
    /// Borrow rewards per point paid
    pub borrow_rewards_per_point_paid: u128,
    /// Accrued supply rewards
    pub accrued_supply_rewards: u64,
    /// Accrued borrow rewards
    pub accrued_borrow_rewards: u64,
    /// Total rewards claimed
    pub total_rewards_claimed: u64,
    /// Last claim timestamp
    pub last_claim_timestamp: i64,
    /// User rewards bump seed
    pub bump: u8,
}

impl UserRewards {
    pub const LEN: usize = 8 + 32 * 2 + 16 * 4 + 8 * 4 + 1;

    pub fn calculate_pending_supply_rewards(&self, current_rewards_per_point: u128) -> u64 {
        if self.user_supply_points == 0 {
            return 0;
        }

        let rewards_per_point_diff = current_rewards_per_point
            .saturating_sub(self.supply_rewards_per_point_paid);
        
        self.user_supply_points
            .checked_mul(rewards_per_point_diff)
            .unwrap_or(0)
            .checked_div(crate::constants::RAY)
            .unwrap_or(0) as u64
    }

    pub fn calculate_pending_borrow_rewards(&self, current_rewards_per_point: u128) -> u64 {
        if self.user_borrow_points == 0 {
            return 0;
        }

        let rewards_per_point_diff = current_rewards_per_point
            .saturating_sub(self.borrow_rewards_per_point_paid);
        
        self.user_borrow_points
            .checked_mul(rewards_per_point_diff)
            .unwrap_or(0)
            .checked_div(crate::constants::RAY)
            .unwrap_or(0) as u64
    }

    pub fn get_total_pending_rewards(&self, supply_rewards_per_point: u128, borrow_rewards_per_point: u128) -> u64 {
        let pending_supply = self.calculate_pending_supply_rewards(supply_rewards_per_point);
        let pending_borrow = self.calculate_pending_borrow_rewards(borrow_rewards_per_point);
        
        self.accrued_supply_rewards
            .checked_add(self.accrued_borrow_rewards)
            .unwrap_or(0)
            .checked_add(pending_supply)
            .unwrap_or(0)
            .checked_add(pending_borrow)
            .unwrap_or(0)
    }

    pub fn update_user_rewards(
        &mut self,
        new_supply_points: u128,
        new_borrow_points: u128,
        current_supply_rewards_per_point: u128,
        current_borrow_rewards_per_point: u128,
    ) {
        // Accrue pending rewards
        let pending_supply = self.calculate_pending_supply_rewards(current_supply_rewards_per_point);
        let pending_borrow = self.calculate_pending_borrow_rewards(current_borrow_rewards_per_point);

        self.accrued_supply_rewards = self.accrued_supply_rewards
            .checked_add(pending_supply)
            .unwrap_or(self.accrued_supply_rewards);
        
        self.accrued_borrow_rewards = self.accrued_borrow_rewards
            .checked_add(pending_borrow)
            .unwrap_or(self.accrued_borrow_rewards);

        // Update user points and rewards per point paid
        self.user_supply_points = new_supply_points;
        self.user_borrow_points = new_borrow_points;
        self.supply_rewards_per_point_paid = current_supply_rewards_per_point;
        self.borrow_rewards_per_point_paid = current_borrow_rewards_per_point;
    }

    pub fn claim_rewards(&mut self, amount: u64) -> Result<()> {
        let total_available = self.accrued_supply_rewards
            .checked_add(self.accrued_borrow_rewards)
            .ok_or(crate::errors::LendingError::MathOverflow)?;

        if amount > total_available {
            return Err(crate::errors::LendingError::InsufficientLiquidity.into());
        }

        // Deduct from accrued rewards (prioritize supply rewards first)
        let mut remaining = amount;
        
        if remaining > 0 && self.accrued_supply_rewards > 0 {
            let from_supply = remaining.min(self.accrued_supply_rewards);
            self.accrued_supply_rewards = self.accrued_supply_rewards
                .checked_sub(from_supply)
                .unwrap_or(0);
            remaining = remaining.checked_sub(from_supply).unwrap_or(0);
        }

        if remaining > 0 && self.accrued_borrow_rewards > 0 {
            let from_borrow = remaining.min(self.accrued_borrow_rewards);
            self.accrued_borrow_rewards = self.accrued_borrow_rewards
                .checked_sub(from_borrow)
                .unwrap_or(0);
        }

        self.total_rewards_claimed = self.total_rewards_claimed
            .checked_add(amount)
            .unwrap_or(self.total_rewards_claimed);
        
        self.last_claim_timestamp = Clock::get()?.unix_timestamp;

        Ok(())
    }
}