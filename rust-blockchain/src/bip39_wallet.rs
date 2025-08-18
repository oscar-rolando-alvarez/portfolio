use crate::crypto::KeyPair;
use crate::error::{BlockchainError, Result};
use crate::wallet::Wallet;
use bip39::{Language, Mnemonic, MnemonicType, Seed};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BIP39Wallet {
    pub wallet: Wallet,
    pub mnemonic: Option<String>, // Encrypted in real implementation
    pub seed: Option<Vec<u8>>,    // Encrypted in real implementation
    pub derivation_path: String,
    pub account_index: u32,
    pub address_index: u32,
}

impl BIP39Wallet {
    pub fn new(name: String, word_count: MnemonicType) -> Result<Self> {
        let mnemonic = Mnemonic::new(word_count, Language::English);
        let mnemonic_phrase = mnemonic.phrase().to_string();
        
        let seed = Seed::new(&mnemonic, "").as_bytes().to_vec();
        let mut wallet = Wallet::new(name)?;
        
        // Generate the first address from the seed
        let keypair = Self::derive_keypair_from_seed(&seed, 0, 0)?;
        let address = wallet.import_private_key(&keypair.private_key)?;
        
        Ok(Self {
            wallet,
            mnemonic: Some(mnemonic_phrase),
            seed: Some(seed),
            derivation_path: "m/44'/0'/0'".to_string(), // Standard BIP44 path
            account_index: 0,
            address_index: 0,
        })
    }

    pub fn from_mnemonic(name: String, mnemonic_phrase: &str, passphrase: &str) -> Result<Self> {
        let mnemonic = Mnemonic::from_phrase(mnemonic_phrase, Language::English)
            .map_err(|e| BlockchainError::WalletError(format!("Invalid mnemonic: {}", e)))?;
        
        let seed = Seed::new(&mnemonic, passphrase).as_bytes().to_vec();
        let mut wallet = Wallet::new(name)?;
        
        // Generate the first address from the seed
        let keypair = Self::derive_keypair_from_seed(&seed, 0, 0)?;
        let address = wallet.import_private_key(&keypair.private_key)?;
        
        Ok(Self {
            wallet,
            mnemonic: Some(mnemonic_phrase.to_string()),
            seed: Some(seed),
            derivation_path: "m/44'/0'/0'".to_string(),
            account_index: 0,
            address_index: 0,
        })
    }

    pub fn from_existing_wallet(wallet: Wallet) -> Self {
        Self {
            wallet,
            mnemonic: None,
            seed: None,
            derivation_path: "m/44'/0'/0'".to_string(),
            account_index: 0,
            address_index: 0,
        }
    }

    pub fn generate_next_address(&mut self) -> Result<String> {
        if let Some(seed) = &self.seed {
            self.address_index += 1;
            let keypair = Self::derive_keypair_from_seed(seed, self.account_index, self.address_index)?;
            let address = self.wallet.import_private_key(&keypair.private_key)?;
            Ok(address)
        } else {
            // Fallback to regular address generation
            self.wallet.generate_new_address()
        }
    }

    pub fn generate_address_at_index(&mut self, index: u32) -> Result<String> {
        if let Some(seed) = &self.seed {
            let keypair = Self::derive_keypair_from_seed(seed, self.account_index, index)?;
            let address = self.wallet.import_private_key(&keypair.private_key)?;
            
            if index > self.address_index {
                self.address_index = index;
            }
            
            Ok(address)
        } else {
            Err(BlockchainError::WalletError(
                "Cannot derive address without seed".to_string()
            ))
        }
    }

    pub fn restore_addresses(&mut self, count: u32) -> Result<Vec<String>> {
        let mut addresses = Vec::new();
        
        if let Some(seed) = &self.seed {
            for i in 0..count {
                let keypair = Self::derive_keypair_from_seed(seed, self.account_index, i)?;
                let address = self.wallet.import_private_key(&keypair.private_key)?;
                addresses.push(address);
            }
            
            self.address_index = count.saturating_sub(1);
        }
        
        Ok(addresses)
    }

    pub fn get_mnemonic(&self) -> Option<&String> {
        self.mnemonic.as_ref()
    }

    pub fn validate_mnemonic(mnemonic_phrase: &str) -> bool {
        Mnemonic::validate(mnemonic_phrase, Language::English).is_ok()
    }

    pub fn get_seed_hex(&self) -> Option<String> {
        self.seed.as_ref().map(|seed| hex::encode(seed))
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
        
        serde_json::to_string_pretty(&backup)
            .map_err(|e| BlockchainError::SerializationError(e.to_string()))
    }

    pub fn restore_from_json(json: &str) -> Result<Self> {
        let backup: WalletBackup = serde_json::from_str(json)
            .map_err(|e| BlockchainError::SerializationError(e.to_string()))?;
        
        if let Some(mnemonic) = backup.mnemonic {
            let mut bip39_wallet = Self::from_mnemonic(backup.name, &mnemonic, "")?;
            
            // Restore addresses up to the backed up index
            bip39_wallet.restore_addresses(backup.address_index + 1)?;
            bip39_wallet.account_index = backup.account_index;
            bip39_wallet.derivation_path = backup.derivation_path;
            
            Ok(bip39_wallet)
        } else {
            Err(BlockchainError::WalletError(
                "Cannot restore wallet without mnemonic".to_string()
            ))
        }
    }

    pub fn change_account(&mut self, account_index: u32) -> Result<()> {
        if self.seed.is_some() {
            self.account_index = account_index;
            self.address_index = 0;
            
            // Generate first address for new account
            self.generate_next_address()?;
            
            Ok(())
        } else {
            Err(BlockchainError::WalletError(
                "Cannot change account without seed".to_string()
            ))
        }
    }

    pub fn get_extended_public_key(&self) -> Result<String> {
        if let Some(seed) = &self.seed {
            // This is a simplified implementation
            // In a real implementation, you'd use proper BIP32 extended key derivation
            let xpub_data = format!("xpub_{}_{}", self.account_index, hex::encode(&seed[..32]));
            Ok(xpub_data)
        } else {
            Err(BlockchainError::WalletError(
                "Cannot generate xpub without seed".to_string()
            ))
        }
    }

    pub fn encrypt_wallet(&mut self, password: &str) -> Result<()> {
        // In a real implementation, you would encrypt the mnemonic and seed
        // For this example, we'll just mark it as encrypted (not actually encrypt)
        if self.mnemonic.is_some() {
            // Would encrypt with password here
            // self.mnemonic = Some(encrypt(&mnemonic, password));
            // self.seed = Some(encrypt(&seed, password));
        }
        Ok(())
    }

    pub fn decrypt_wallet(&mut self, password: &str) -> Result<()> {
        // In a real implementation, you would decrypt the mnemonic and seed
        // For this example, we'll just validate the password (not actually decrypt)
        if self.mnemonic.is_some() {
            // Would decrypt with password here
            // self.mnemonic = Some(decrypt(&encrypted_mnemonic, password));
            // self.seed = Some(decrypt(&encrypted_seed, password));
        }
        Ok(())
    }

    // Simplified key derivation - in a real implementation, use BIP32/BIP44
    fn derive_keypair_from_seed(seed: &[u8], account: u32, index: u32) -> Result<KeyPair> {
        use crate::crypto::sha256;
        
        // Simple derivation for demo purposes
        // Real implementation would use proper BIP32 hierarchical deterministic derivation
        let mut derivation_data = Vec::new();
        derivation_data.extend_from_slice(seed);
        derivation_data.extend_from_slice(&account.to_be_bytes());
        derivation_data.extend_from_slice(&index.to_be_bytes());
        derivation_data.extend_from_slice(b"bitcoin_seed"); // Domain separator
        
        let derived_key = sha256(&derivation_data);
        KeyPair::from_private_key(&derived_key)
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
    use bip39::MnemonicType;

    #[test]
    fn test_bip39_wallet_creation() {
        let wallet = BIP39Wallet::new("test_wallet".to_string(), MnemonicType::Words12).unwrap();
        
        assert_eq!(wallet.wallet.name, "test_wallet");
        assert!(wallet.mnemonic.is_some());
        assert!(wallet.seed.is_some());
        assert_eq!(wallet.wallet.addresses.len(), 1); // First address generated
    }

    #[test]
    fn test_mnemonic_validation() {
        // Test with a valid 12-word mnemonic
        let valid_mnemonic = "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
        assert!(BIP39Wallet::validate_mnemonic(valid_mnemonic));
        
        // Test with invalid mnemonic
        assert!(!BIP39Wallet::validate_mnemonic("invalid mnemonic phrase"));
        assert!(!BIP39Wallet::validate_mnemonic(""));
    }

    #[test]
    fn test_wallet_from_mnemonic() {
        let mnemonic = "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
        let wallet = BIP39Wallet::from_mnemonic("test".to_string(), mnemonic, "").unwrap();
        
        assert_eq!(wallet.mnemonic.as_ref().unwrap(), mnemonic);
        assert!(wallet.seed.is_some());
        assert_eq!(wallet.wallet.addresses.len(), 1);
    }

    #[test]
    fn test_address_generation() {
        let mut wallet = BIP39Wallet::new("test_wallet".to_string(), MnemonicType::Words12).unwrap();
        let initial_count = wallet.wallet.addresses.len();
        
        let new_address = wallet.generate_next_address().unwrap();
        assert_eq!(wallet.wallet.addresses.len(), initial_count + 1);
        assert!(wallet.wallet.contains_address(&new_address));
        assert_eq!(wallet.address_index, 1);
    }

    #[test]
    fn test_address_restoration() {
        let mut wallet = BIP39Wallet::new("test_wallet".to_string(), MnemonicType::Words12).unwrap();
        
        // Clear existing addresses for testing
        wallet.wallet.addresses.clear();
        wallet.wallet.keypairs.clear();
        wallet.address_index = 0;
        
        let addresses = wallet.restore_addresses(5).unwrap();
        
        assert_eq!(addresses.len(), 5);
        assert_eq!(wallet.wallet.addresses.len(), 5);
        assert_eq!(wallet.address_index, 4);
    }

    #[test]
    fn test_deterministic_derivation() {
        let mnemonic = "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
        
        let wallet1 = BIP39Wallet::from_mnemonic("test1".to_string(), mnemonic, "").unwrap();
        let wallet2 = BIP39Wallet::from_mnemonic("test2".to_string(), mnemonic, "").unwrap();
        
        // Should generate the same first address
        assert_eq!(wallet1.wallet.addresses[0], wallet2.wallet.addresses[0]);
    }

    #[test]
    fn test_account_change() {
        let mut wallet = BIP39Wallet::new("test_wallet".to_string(), MnemonicType::Words12).unwrap();
        let first_address = wallet.wallet.addresses[0].clone();
        
        wallet.change_account(1).unwrap();
        
        assert_eq!(wallet.account_index, 1);
        assert_eq!(wallet.address_index, 0);
        // Should have generated a new address for account 1
        assert_ne!(wallet.wallet.addresses.last().unwrap(), &first_address);
    }

    #[test]
    fn test_backup_and_restore() {
        let wallet = BIP39Wallet::new("test_wallet".to_string(), MnemonicType::Words12).unwrap();
        
        let backup_json = wallet.backup_to_json().unwrap();
        let restored_wallet = BIP39Wallet::restore_from_json(&backup_json).unwrap();
        
        assert_eq!(wallet.wallet.name, restored_wallet.wallet.name);
        assert_eq!(wallet.mnemonic, restored_wallet.mnemonic);
        assert_eq!(wallet.derivation_path, restored_wallet.derivation_path);
    }

    #[test]
    fn test_extended_public_key() {
        let wallet = BIP39Wallet::new("test_wallet".to_string(), MnemonicType::Words12).unwrap();
        let xpub = wallet.get_extended_public_key().unwrap();
        
        assert!(xpub.starts_with("xpub_"));
        assert!(!xpub.is_empty());
    }

    #[test]
    fn test_derivation_info() {
        let wallet = BIP39Wallet::new("test_wallet".to_string(), MnemonicType::Words12).unwrap();
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
        let bip39_wallet = BIP39Wallet::from_existing_wallet(regular_wallet);
        
        let info = bip39_wallet.get_derivation_info();
        assert!(!info.has_mnemonic);
        assert!(!info.has_seed);
        
        // Should still be able to generate addresses (non-deterministically)
        // This would use the regular wallet's address generation
    }
}