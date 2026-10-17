use anchor_lang::prelude::*;

pub const MARKETPLACE_SEED: &[u8] = b"marketplace";
pub const LISTING_SEED: &[u8] = b"listing";
pub const OFFER_SEED: &[u8] = b"offer";

pub const BPS: u64 = 10_000;
pub const MAX_FEE_BPS: u16 = 1_000;

#[account]
#[derive(InitSpace)]
pub struct Marketplace {
    pub admin: Pubkey,
    /// Receives the marketplace fee on every sale.
    pub treasury: Pubkey,
    pub fee_bps: u16,
    pub paused: bool,
    pub total_volume: u64,
    pub total_sales: u64,
    pub bump: u8,
}

impl Marketplace {
    pub fn fee_for(&self, price: u64) -> u64 {
        // fee_bps <= 1_000, so this cannot overflow u128 or exceed `price`.
        ((price as u128) * (self.fee_bps as u128) / (BPS as u128)) as u64
    }

    pub fn record_sale(&mut self, price: u64) {
        self.total_volume = self.total_volume.saturating_add(price);
        self.total_sales = self.total_sales.saturating_add(1);
    }
}

/// A fixed-price listing. The NFT is escrowed in the listing's associated
/// token account until it is sold, the offer is accepted or it is delisted.
#[account]
#[derive(InitSpace)]
pub struct Listing {
    pub seller: Pubkey,
    pub mint: Pubkey,
    /// Price in lamports.
    pub price: u64,
    /// Unix timestamp after which the listing cannot be bought (0 = never).
    pub expires_at: i64,
    pub created_at: i64,
    pub bump: u8,
}

impl Listing {
    pub fn is_expired(&self, now: i64) -> bool {
        self.expires_at != 0 && now >= self.expires_at
    }
}

/// A SOL offer for an NFT. The offered lamports are held by this account.
#[account]
#[derive(InitSpace)]
pub struct Offer {
    pub buyer: Pubkey,
    pub mint: Pubkey,
    pub amount: u64,
    pub expires_at: i64,
    pub bump: u8,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn fee_is_proportional_and_rounds_down() {
        let m = Marketplace {
            admin: Pubkey::default(),
            treasury: Pubkey::default(),
            fee_bps: 250,
            paused: false,
            total_volume: 0,
            total_sales: 0,
            bump: 0,
        };
        assert_eq!(m.fee_for(1_000_000_000), 25_000_000);
        assert_eq!(m.fee_for(39), 0);
        assert_eq!(m.fee_for(u64::MAX), u64::MAX / 40);
    }

    #[test]
    fn listing_expiry() {
        let mut l = Listing {
            seller: Pubkey::default(),
            mint: Pubkey::default(),
            price: 1,
            expires_at: 0,
            created_at: 0,
            bump: 0,
        };
        assert!(!l.is_expired(i64::MAX));
        l.expires_at = 100;
        assert!(!l.is_expired(99));
        assert!(l.is_expired(100));
    }
}
