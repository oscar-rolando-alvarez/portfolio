use crate::errors::MintingError;
use anchor_lang::prelude::*;

pub const COLLECTION_SEED: &[u8] = b"collection";
pub const NFT_RECORD_SEED: &[u8] = b"nft";

pub const MAX_NAME_LEN: usize = 32;
pub const MAX_SYMBOL_LEN: usize = 10;
pub const MAX_URI_LEN: usize = 200;
pub const MAX_ROYALTY_BPS: u16 = 5_000;

/// Additional metadata keys written to every NFT's Token-2022 metadata.
pub const COLLECTION_KEY: &str = "collection";
pub const ROYALTY_KEY: &str = "royalty_bps";

/// A collection owned by an authority. The collection PDA is the mint
/// authority and metadata update authority of every NFT minted into it.
#[account]
#[derive(InitSpace)]
pub struct Collection {
    pub authority: Pubkey,
    #[max_len(MAX_NAME_LEN)]
    pub name: String,
    #[max_len(MAX_SYMBOL_LEN)]
    pub symbol: String,
    #[max_len(MAX_URI_LEN)]
    pub uri: String,
    /// Secondary-sale royalty advertised to marketplaces, in basis points.
    pub royalty_bps: u16,
    /// 0 means unlimited.
    pub max_supply: u64,
    pub minted: u64,
    pub created_at: i64,
    pub bump: u8,
}

impl Collection {
    pub fn can_mint(&self) -> bool {
        self.max_supply == 0 || self.minted < self.max_supply
    }
}

/// Per-NFT provenance record, keyed by mint.
#[account]
#[derive(InitSpace)]
pub struct NftRecord {
    pub collection: Pubkey,
    pub mint: Pubkey,
    pub index: u64,
    pub minted_at: i64,
    pub bump: u8,
}

pub fn validate_metadata(name: &str, symbol: &str, uri: &str) -> Result<()> {
    require!(
        !name.is_empty() && name.len() <= MAX_NAME_LEN,
        MintingError::InvalidName
    );
    require!(
        !symbol.is_empty() && symbol.len() <= MAX_SYMBOL_LEN,
        MintingError::InvalidSymbol
    );
    require!(uri.len() <= MAX_URI_LEN, MintingError::UriTooLong);
    Ok(())
}

/// Bytes the Token-2022 `TokenMetadata` extension occupies inside the mint
/// account (TLV header + borsh body), used to pre-fund rent before the
/// token program reallocates the account.
pub fn token_metadata_space(name: &str, symbol: &str, uri: &str, extra: &[(&str, &str)]) -> usize {
    const TLV_HEADER: usize = 2 + 2; // extension type (u16) + length (u16)
    const AUTHORITIES: usize = 32 + 32; // update authority + mint
    let string = |s: &str| 4 + s.len();
    let additional: usize = 4 + extra
        .iter()
        .map(|(k, v)| string(k) + string(v))
        .sum::<usize>();
    TLV_HEADER + AUTHORITIES + string(name) + string(symbol) + string(uri) + additional
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn metadata_space_matches_borsh_layout() {
        // 4 + 64 + (4+3) + (4+1) + (4+0) + (4 + (4+1) + (4+2))
        assert_eq!(token_metadata_space("abc", "X", "", &[("k", "vv")]), 99);
    }

    #[test]
    fn supply_limits() {
        let mut c = Collection {
            authority: Pubkey::default(),
            name: String::new(),
            symbol: String::new(),
            uri: String::new(),
            royalty_bps: 0,
            max_supply: 0,
            minted: 10,
            created_at: 0,
            bump: 0,
        };
        assert!(c.can_mint());
        c.max_supply = 10;
        assert!(!c.can_mint());
    }

    #[test]
    fn metadata_validation() {
        assert!(validate_metadata("Name", "SYM", "https://x").is_ok());
        assert!(validate_metadata("", "SYM", "").is_err());
        assert!(validate_metadata("Name", "TOO-LONG-SYMBOL", "").is_err());
        assert!(validate_metadata("Name", "S", &"u".repeat(201)).is_err());
    }
}
