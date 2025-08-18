use anchor_lang::prelude::*;

/// Protocol global state
#[account]
#[derive(Debug)]
pub struct Protocol {
    /// Protocol admin
    pub admin: Pubkey,
    /// Protocol fee rate (in basis points)
    pub fee_rate: u64,
    /// Total number of pools
    pub total_pools: u64,
    /// Emergency admin (can pause protocol)
    pub emergency_admin: Pubkey,
    /// Protocol treasury
    pub treasury: Pubkey,
    /// Total value locked in USD
    pub total_value_locked: u64,
    /// Total borrowed amount in USD
    pub total_borrowed: u64,
    /// Protocol paused state
    pub paused: bool,
    /// Emergency mode activated
    pub emergency_mode: bool,
    /// Last update timestamp
    pub last_update_time: i64,
    /// Protocol bump seed
    pub bump: u8,
}

impl Protocol {
    pub const LEN: usize = 8 + 32 + 8 + 8 + 32 + 32 + 8 + 8 + 1 + 1 + 8 + 1;

    pub fn is_paused(&self) -> bool {
        self.paused || self.emergency_mode
    }

    pub fn update_tvl(&mut self, new_tvl: u64) {
        self.total_value_locked = new_tvl;
        self.last_update_time = Clock::get().unwrap().unix_timestamp;
    }

    pub fn update_total_borrowed(&mut self, new_total: u64) {
        self.total_borrowed = new_total;
        self.last_update_time = Clock::get().unwrap().unix_timestamp;
    }

    pub fn pause(&mut self) {
        self.paused = true;
        self.last_update_time = Clock::get().unwrap().unix_timestamp;
    }

    pub fn unpause(&mut self) {
        self.paused = false;
        self.last_update_time = Clock::get().unwrap().unix_timestamp;
    }

    pub fn activate_emergency_mode(&mut self) {
        self.emergency_mode = true;
        self.last_update_time = Clock::get().unwrap().unix_timestamp;
    }

    pub fn deactivate_emergency_mode(&mut self) {
        self.emergency_mode = false;
        self.last_update_time = Clock::get().unwrap().unix_timestamp;
    }
}