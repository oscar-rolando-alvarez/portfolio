use anchor_lang::prelude::*;

#[event]
pub struct MarketCreated {
    pub market: Pubkey,
    pub collateral_mint: Pubkey,
    pub loan_mint: Pubkey,
}

#[event]
pub struct Supplied {
    pub market: Pubkey,
    pub user: Pubkey,
    pub amount: u64,
    pub shares: u64,
}

#[event]
pub struct Withdrawn {
    pub market: Pubkey,
    pub user: Pubkey,
    pub amount: u64,
    pub shares: u64,
}

#[event]
pub struct CollateralChanged {
    pub market: Pubkey,
    pub owner: Pubkey,
    pub delta: i128,
    pub collateral_amount: u64,
}

#[event]
pub struct Borrowed {
    pub market: Pubkey,
    pub owner: Pubkey,
    pub amount: u64,
    pub debt: u64,
}

#[event]
pub struct Repaid {
    pub market: Pubkey,
    pub owner: Pubkey,
    pub amount: u64,
    pub remaining_debt: u64,
}

#[event]
pub struct Liquidated {
    pub market: Pubkey,
    pub owner: Pubkey,
    pub liquidator: Pubkey,
    pub repaid: u64,
    pub collateral_seized: u64,
}

#[event]
pub struct FlashLoan {
    pub market: Pubkey,
    pub receiver: Pubkey,
    pub amount: u64,
    pub fee: u64,
}
