use crate::crypto::{KeyPair, sha256};
use crate::error::{BlockchainError, Result};
use crate::wallet::Wallet;
use bip39::{Language, Mnemonic};
use rand::RngCore;
use serde::{Deserialize, Serialize};

pub use bip39::WordCount;

const DEFAULT_DERIVATION_PATH: &str = "m/44'/0'/0'";

/// Wallet whose keys are deterministically derived from a BIP39 mnemonic.
///
/// The mnemonic and seed follow BIP39 exactly; key derivation from the seed
/// is a simplified, domain-separated SHA-256 scheme rather than full BIP32.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BIP39Wallet {
    pub wallet: Wallet,
    pub mnemonic: Option<String>,
    pub seed: Option<Vec<u8>>,
    pub derivation_path: String,
    pub account_index: u32,
    pub address_index: u32,
}

impl BIP39Wallet {
    /// Create a wallet with a freshly generated mnemonic of `word_count` words.
    pub fn new(name: String, word_count: WordCount) -> Result<Self> {
        let words = usize::from(word_count);
        let mut entropy = vec![0u8; words / 3 * 4];
        rand::rng().fill_bytes(&mut entropy);

        let mnemonic = Mnemonic::from_entropy_in(Language::English, &entropy).map_err(|e| {
            BlockchainError::WalletError(format!("Mnemonic generation failed: {e}"))
        })?;

        Self::from_parsed_mnemonic(name, &mnemonic, "")
    }

    /// Restore a wallet from an English mnemonic phrase and optional passphrase.
    pub fn from_mnemonic(name: String, mnemonic_phrase: &str, passphrase: &str) -> Result<Self> {
        let mnemonic = Mnemonic::parse_in(Language::English, mnemonic_phrase)
            .map_err(|e| BlockchainError::WalletError(format!("Invalid mnemonic: {e}")))?;
        Self::from_parsed_mnemonic(name, &mnemonic, passphrase)
    }

    fn from_parsed_mnemonic(name: String, mnemonic: &Mnemonic, passphrase: &str) -> Result<Self> {
        let seed = mnemonic.to_seed(passphrase).to_vec();
        let mut wallet = Wallet::new(name)?;

        let keypair = Self::derive_keypair_from_seed(&seed, 0, 0)?;
        wallet.import_private_key(&keypair.private_key)?;

        Ok(Self {
            wallet,
            mnemonic: Some(mnemonic.to_string()),
            seed: Some(seed),
            derivation_path: DEFAULT_DERIVATION_PATH.to_string(),
            account_index: 0,
            address_index: 0,
        })
    }

    pub fn from_existing_wallet(wallet: Wallet) -> Self {
        Self {
            wallet,
            mnemonic: None,
            seed: None,
            derivation_path: DEFAULT_DERIVATION_PATH.to_string(),
            account_index: 0,
            address_index: 0,
        }
    }

    pub fn generate_next_address(&mut self) -> Result<String> {
        match &self.seed {
            Some(seed) => {
                let next_index = self.address_index + 1;
                let keypair = Self::derive_keypair_from_seed(seed, self.account_index, next_index)?;
                let address = self.wallet.import_private_key(&keypair.private_key)?;
                self.address_index = next_index;
                Ok(address)
            }
            None => self.wallet.generate_new_address(),
        }
    }

    pub fn generate_address_at_index(&mut self, index: u32) -> Result<String> {
        let seed = self.seed.as_ref().ok_or_else(|| {
            BlockchainError::WalletError("Cannot derive address without seed".to_string())
        })?;
        let keypair = Self::derive_keypair_from_seed(seed, self.account_index, index)?;
        let address = self.wallet.import_private_key(&keypair.private_key)?;
        self.address_index = self.address_index.max(index);
        Ok(address)
    }

    /// Derive the first `count` addresses of the current account.
    pub fn restore_addresses(&mut self, count: u32) -> Result<Vec<String>> {
        let Some(seed) = self.seed.clone() else {
            return Ok(Vec::new());
        };

        let addresses = (0..count)
            .map(|i| {
                let keypair = Self::derive_keypair_from_seed(&seed, self.account_index, i)?;
                self.wallet.import_private_key(&keypair.private_key)
            })
            .collect::<Result<Vec<_>>>()?;

        self.address_index = count.saturating_sub(1);
        Ok(addresses)
    }

    pub fn get_mnemonic(&self) -> Option<&String> {
        self.mnemonic.as_ref()
    }

    pub fn validate_mnemonic(mnemonic_phrase: &str) -> bool {
        Mnemonic::parse_in(Language::English, mnemonic_phrase).is_ok()
    }

    pub fn get_seed_hex(&self) -> Option<String> {
        self.seed.as_ref().map(hex::encode)
    }

    pub fn backup_to_json(&self) -> Result<String> {
        let backup = WalletBackup {
            name: self.wallet.name.clone(),
            mnemonic: self.mnemonic.clone(),
            derivation_path: self.derivation_path.clone(),
            account_index: self.account_index,
            address_index: self.address_index,
            addresses: self.wallet.addresses.clone(),
            created_at: self.wallet.created_at,
        };

        Ok(serde_json::to_string_pretty(&backup)?)
    }

    /// Restore from a JSON backup (wallets created without a passphrase).
    pub fn restore_from_json(json: &str) -> Result<Self> {
        let backup: WalletBackup = serde_json::from_str(json)?;

        let mnemonic = backup.mnemonic.ok_or_else(|| {
            BlockchainError::WalletError("Cannot restore wallet without mnemonic".to_string())
        })?;

        let mut bip39_wallet = Self::from_mnemonic(backup.name, &mnemonic, "")?;
        bip39_wallet.account_index = backup.account_index;
        bip39_wallet.derivation_path = backup.derivation_path;
        bip39_wallet.restore_addresses(backup.address_index + 1)?;
        bip39_wallet.wallet.created_at = backup.created_at;

        Ok(bip39_wallet)
    }

    /// Switch to another account and derive its first address.
    pub fn change_account(&mut self, account_index: u32) -> Result<()> {
        if self.seed.is_none() {
            return Err(BlockchainError::WalletError(
                "Cannot change account without seed".to_string(),
            ));
        }
        self.account_index = account_index;
        self.address_index = 0;
        self.generate_address_at_index(0)?;
        Ok(())
    }

    /// Public identifier for the current account (account index plus the
    /// compressed public key of the account-level key). Never exposes the seed.
    pub fn get_extended_public_key(&self) -> Result<String> {
        let seed = self.seed.as_ref().ok_or_else(|| {
            BlockchainError::WalletError("Cannot generate xpub without seed".to_string())
        })?;
        let account_key = Self::derive_keypair_from_seed(seed, self.account_index, u32::MAX)?;
        Ok(format!(
            "xpub_{}_{}",
            self.account_index,
            hex::encode(&account_key.public_key)
        ))
    }

    fn derive_keypair_from_seed(seed: &[u8], account: u32, index: u32) -> Result<KeyPair> {
        let mut counter: u32 = 0;
        loop {
            let mut data = Vec::with_capacity(seed.len() + 24);
            data.extend_from_slice(b"rust-blockchain/derive");
            data.extend_from_slice(seed);
            data.extend_from_slice(&account.to_be_bytes());
            data.extend_from_slice(&index.to_be_bytes());
            data.extend_from_slice(&counter.to_be_bytes());

            // A digest outside the curve order is astronomically unlikely; retry if it happens.
            match KeyPair::from_private_key(&sha256(&data)) {
                Ok(keypair) => return Ok(keypair),
                Err(_) if counter < 16 => counter += 1,
                Err(e) => return Err(e),
            }
        }
    }

    pub fn get_derivation_info(&self) -> DerivationInfo {
        DerivationInfo {
            derivation_path: self.derivation_path.clone(),
            account_index: self.account_index,
            address_index: self.address_index,
            has_mnemonic: self.mnemonic.is_some(),
            has_seed: self.seed.is_some(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WalletBackup {
    pub name: String,
    pub mnemonic: Option<String>,
    pub derivation_path: String,
    pub account_index: u32,
    pub address_index: u32,
    pub addresses: Vec<String>,
    pub created_at: chrono::DateTime<chrono::Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DerivationInfo {
    pub derivation_path: String,
    pub account_index: u32,
    pub address_index: u32,
    pub has_mnemonic: bool,
    pub has_seed: bool,
}

#[cfg(test)]
mod tests {
    use super::*;

    const TEST_MNEMONIC: &str = "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";

    #[test]
    fn test_bip39_wallet_creation() {
        let wallet = BIP39Wallet::new("test_wallet".to_string(), WordCount::Words12).unwrap();

        assert_eq!(wallet.wallet.name, "test_wallet");
        assert_eq!(wallet.mnemonic.as_ref().unwrap().split(' ').count(), 12);
        assert_eq!(wallet.seed.as_ref().unwrap().len(), 64);
        assert_eq!(wallet.wallet.addresses.len(), 1);
        assert!(BIP39Wallet::validate_mnemonic(
            wallet.get_mnemonic().unwrap()
        ));
    }

    #[test]
    fn test_24_word_wallet() {
        let wallet = BIP39Wallet::new("w".to_string(), WordCount::Words24).unwrap();
        assert_eq!(wallet.mnemonic.as_ref().unwrap().split(' ').count(), 24);
    }

    #[test]
    fn test_bip39_seed_test_vector() {
        let wallet = BIP39Wallet::from_mnemonic("t".to_string(), TEST_MNEMONIC, "TREZOR").unwrap();
        assert_eq!(
            wallet.get_seed_hex().unwrap(),
            "c55257c360c07c72029aebc1b53c05ed0362ada38ead3e3e9efa3708e53495531f09a6987599d18264c1e1c92f2cf141630c7a3c4ab7c81b2f001698e7463b04"
        );
    }

    #[test]
    fn test_mnemonic_validation() {
        assert!(BIP39Wallet::validate_mnemonic(TEST_MNEMONIC));
        assert!(!BIP39Wallet::validate_mnemonic("invalid mnemonic phrase"));
        assert!(!BIP39Wallet::validate_mnemonic(""));
        // Valid words, bad checksum.
        assert!(!BIP39Wallet::validate_mnemonic(
            "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon"
        ));
    }

    #[test]
    fn test_wallet_from_mnemonic() {
        let wallet = BIP39Wallet::from_mnemonic("test".to_string(), TEST_MNEMONIC, "").unwrap();

        assert_eq!(wallet.mnemonic.as_deref(), Some(TEST_MNEMONIC));
        assert!(wallet.seed.is_some());
        assert_eq!(wallet.wallet.addresses.len(), 1);

        assert!(BIP39Wallet::from_mnemonic("bad".to_string(), "not a mnemonic", "").is_err());
    }

    #[test]
    fn test_passphrase_changes_keys() {
        let plain = BIP39Wallet::from_mnemonic("a".to_string(), TEST_MNEMONIC, "").unwrap();
        let protected =
            BIP39Wallet::from_mnemonic("b".to_string(), TEST_MNEMONIC, "secret").unwrap();
        assert_ne!(plain.wallet.addresses[0], protected.wallet.addresses[0]);
    }

    #[test]
    fn test_address_generation() {
        let mut wallet = BIP39Wallet::new("test_wallet".to_string(), WordCount::Words12).unwrap();
        let initial_count = wallet.wallet.addresses.len();

        let new_address = wallet.generate_next_address().unwrap();
        assert_eq!(wallet.wallet.addresses.len(), initial_count + 1);
        assert!(wallet.wallet.contains_address(&new_address));
        assert_eq!(wallet.address_index, 1);
    }

    #[test]
    fn test_address_restoration() {
        let mut wallet = BIP39Wallet::new("test_wallet".to_string(), WordCount::Words12).unwrap();
        let first = wallet.wallet.addresses[0].clone();

        wallet.wallet.addresses.clear();
        wallet.wallet.keypairs.clear();
        wallet.address_index = 0;

        let addresses = wallet.restore_addresses(5).unwrap();

        assert_eq!(addresses.len(), 5);
        assert_eq!(addresses[0], first);
        assert_eq!(wallet.wallet.addresses.len(), 5);
        assert_eq!(wallet.address_index, 4);
    }

    #[test]
    fn test_deterministic_derivation() {
        let mut wallet1 =
            BIP39Wallet::from_mnemonic("test1".to_string(), TEST_MNEMONIC, "").unwrap();
        let mut wallet2 =
            BIP39Wallet::from_mnemonic("test2".to_string(), TEST_MNEMONIC, "").unwrap();

        assert_eq!(wallet1.wallet.addresses[0], wallet2.wallet.addresses[0]);
        assert_eq!(
            wallet1.generate_next_address().unwrap(),
            wallet2.generate_next_address().unwrap()
        );
    }

    #[test]
    fn test_account_change() {
        let mut wallet = BIP39Wallet::new("test_wallet".to_string(), WordCount::Words12).unwrap();
        let first_address = wallet.wallet.addresses[0].clone();

        wallet.change_account(1).unwrap();

        assert_eq!(wallet.account_index, 1);
        assert_eq!(wallet.address_index, 0);
        assert_eq!(wallet.wallet.addresses.len(), 2);
        assert_ne!(wallet.wallet.addresses.last().unwrap(), &first_address);
    }

    #[test]
    fn test_backup_and_restore() {
        let mut wallet = BIP39Wallet::new("test_wallet".to_string(), WordCount::Words12).unwrap();
        wallet.generate_next_address().unwrap();
        wallet.generate_next_address().unwrap();

        let backup_json = wallet.backup_to_json().unwrap();
        let restored_wallet = BIP39Wallet::restore_from_json(&backup_json).unwrap();

        assert_eq!(wallet.wallet.name, restored_wallet.wallet.name);
        assert_eq!(wallet.mnemonic, restored_wallet.mnemonic);
        assert_eq!(wallet.derivation_path, restored_wallet.derivation_path);
        assert_eq!(wallet.wallet.addresses, restored_wallet.wallet.addresses);
        assert_eq!(restored_wallet.address_index, 2);
    }

    #[test]
    fn test_extended_public_key_does_not_leak_seed() {
        let wallet = BIP39Wallet::new("test_wallet".to_string(), WordCount::Words12).unwrap();
        let xpub = wallet.get_extended_public_key().unwrap();

        assert!(xpub.starts_with("xpub_0_"));
        let seed_hex = wallet.get_seed_hex().unwrap();
        assert!(!xpub.contains(&seed_hex[..16]));
    }

    #[test]
    fn test_derivation_info() {
        let wallet = BIP39Wallet::new("test_wallet".to_string(), WordCount::Words12).unwrap();
        let info = wallet.get_derivation_info();

        assert_eq!(info.derivation_path, "m/44'/0'/0'");
        assert_eq!(info.account_index, 0);
        assert_eq!(info.address_index, 0);
        assert!(info.has_mnemonic);
        assert!(info.has_seed);
    }

    #[test]
    fn test_wallet_without_seed() {
        let regular_wallet = Wallet::new("regular".to_string()).unwrap();
        let mut bip39_wallet = BIP39Wallet::from_existing_wallet(regular_wallet);

        let info = bip39_wallet.get_derivation_info();
        assert!(!info.has_mnemonic);
        assert!(!info.has_seed);

        // Falls back to random key generation.
        bip39_wallet.generate_next_address().unwrap();
        assert_eq!(bip39_wallet.wallet.addresses.len(), 1);
        assert!(bip39_wallet.generate_address_at_index(3).is_err());
        assert!(bip39_wallet.change_account(1).is_err());
        assert!(bip39_wallet.get_extended_public_key().is_err());
    }
}
