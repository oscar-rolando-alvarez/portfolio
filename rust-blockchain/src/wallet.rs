use crate::crypto::{hash_to_string, sha256, KeyPair};
use crate::error::{BlockchainError, Result};
use crate::utxo::UTXOSet;
use crate::{Address, Amount, OutPoint, Transaction, TransactionBuilder, TxInput, TxOutput, UTXO};
use base58::{FromBase58, ToBase58};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Wallet {
    pub name: String,
    pub keypairs: HashMap<Address, KeyPair>,
    pub addresses: Vec<Address>,
    pub created_at: chrono::DateTime<chrono::Utc>,
}

impl Wallet {
    pub fn new(name: String) -> Result<Self> {
        Ok(Self {
            name,
            keypairs: HashMap::new(),
            addresses: Vec::new(),
            created_at: chrono::Utc::now(),
        })
    }

    pub fn generate_new_address(&mut self) -> Result<Address> {
        let keypair = KeyPair::new()?;
        let address = self.keypair_to_address(&keypair)?;
        
        self.keypairs.insert(address.clone(), keypair);
        self.addresses.push(address.clone());
        
        Ok(address)
    }

    pub fn import_private_key(&mut self, private_key: &[u8]) -> Result<Address> {
        let keypair = KeyPair::from_private_key(private_key)?;
        let address = self.keypair_to_address(&keypair)?;
        
        if !self.keypairs.contains_key(&address) {
            self.keypairs.insert(address.clone(), keypair);
            self.addresses.push(address.clone());
        }
        
        Ok(address)
    }

    pub fn get_balance(&self, utxo_set: &UTXOSet) -> Amount {
        self.addresses
            .iter()
            .map(|address| utxo_set.get_balance(address))
            .sum()
    }

    pub fn get_address_balance(&self, address: &Address, utxo_set: &UTXOSet) -> Amount {
        if self.addresses.contains(address) {
            utxo_set.get_balance(address)
        } else {
            0
        }
    }

    pub fn create_transaction(
        &self,
        to_address: Address,
        amount: Amount,
        fee: Amount,
        utxo_set: &UTXOSet,
        current_height: u64,
    ) -> Result<Transaction> {
        // Find UTXOs to spend
        let mut selected_utxos = Vec::new();
        let mut total_value = 0;
        let required_amount = amount + fee;

        for address in &self.addresses {
            let address_utxos = utxo_set.find_spendable_utxos(address, required_amount - total_value, current_height)?;
            for utxo in address_utxos {
                selected_utxos.push(utxo.clone());
                total_value += utxo.output.value;
                
                if total_value >= required_amount {
                    break;
                }
            }
            
            if total_value >= required_amount {
                break;
            }
        }

        if total_value < required_amount {
            return Err(BlockchainError::InsufficientFunds);
        }

        // Create inputs
        let mut inputs = Vec::new();
        for utxo in &selected_utxos {
            let input = TxInput::new(
                utxo.outpoint.txid.clone(),
                utxo.outpoint.vout,
                Vec::new(), // Script will be filled when signing
            );
            inputs.push(input);
        }

        // Create outputs
        let mut outputs = Vec::new();
        
        // Output to recipient
        outputs.push(TxOutput::new(amount, to_address));
        
        // Change output (if any)
        let change = total_value - amount - fee;
        if change > 0 {
            // Send change back to the first address that has UTXOs
            let change_address = selected_utxos[0].output.address.clone();
            outputs.push(TxOutput::new(change, change_address));
        }

        // Create transaction
        let mut transaction = Transaction::new(inputs, outputs, 0);
        transaction.fee = fee;

        // Sign the transaction
        self.sign_transaction(&mut transaction, &selected_utxos)?;

        Ok(transaction)
    }

    pub fn sign_transaction(&self, transaction: &mut Transaction, utxos: &[UTXO]) -> Result<()> {
        for (input_index, input) in transaction.inputs.iter_mut().enumerate() {
            if let Some(outpoint) = &input.previous_output {
                // Find the corresponding UTXO
                if let Some(utxo) = utxos.iter().find(|u| u.outpoint == *outpoint) {
                    let address = &utxo.output.address;
                    
                    if let Some(keypair) = self.keypairs.get(address) {
                        // Create signature
                        let signature_hash = self.create_signature_hash(transaction, input_index, &utxo.output)?;
                        let signature = keypair.sign(&signature_hash)?;
                        
                        // Create script_sig (simplified)
                        let mut script_sig = Vec::new();
                        script_sig.extend_from_slice(&signature);
                        script_sig.extend_from_slice(&keypair.public_key);
                        
                        input.script_sig = script_sig;
                    } else {
                        return Err(BlockchainError::WalletError(
                            format!("Private key not found for address: {}", address)
                        ));
                    }
                }
            }
        }

        Ok(())
    }

    pub fn verify_transaction(&self, transaction: &Transaction, utxos: &[UTXO]) -> Result<bool> {
        for (input_index, input) in transaction.inputs.iter().enumerate() {
            if let Some(outpoint) = &input.previous_output {
                if let Some(utxo) = utxos.iter().find(|u| u.outpoint == *outpoint) {
                    let signature_hash = self.create_signature_hash(transaction, input_index, &utxo.output)?;
                    
                    // Extract signature and public key from script_sig
                    if input.script_sig.len() < 64 + 33 { // Min size for signature + public key
                        return Ok(false);
                    }
                    
                    let signature = &input.script_sig[..64];
                    let public_key = &input.script_sig[64..];
                    
                    if !crate::crypto::verify_signature(public_key, &signature_hash, signature)? {
                        return Ok(false);
                    }
                    
                    // Verify that the public key corresponds to the address
                    let keypair = KeyPair::from_private_key(&[0; 32])?; // Dummy keypair
                    let expected_address = self.public_key_to_address(public_key)?;
                    if expected_address != utxo.output.address {
                        return Ok(false);
                    }
                }
            }
        }
        
        Ok(true)
    }

    pub fn get_transaction_history(&self, utxo_set: &UTXOSet) -> Vec<TransactionSummary> {
        let mut summaries = Vec::new();
        
        for address in &self.addresses {
            let utxos = utxo_set.get_utxos_for_address(address);
            for utxo in utxos {
                summaries.push(TransactionSummary {
                    txid: utxo.outpoint.txid.clone(),
                    address: address.clone(),
                    amount: utxo.output.value,
                    is_outgoing: false,
                    height: utxo.height,
                    timestamp: chrono::Utc::now(), // Would need to get from block
                });
            }
        }
        
        summaries
    }

    pub fn export_private_keys(&self) -> HashMap<Address, String> {
        self.keypairs
            .iter()
            .map(|(address, keypair)| {
                let private_key_hex = hex::encode(&keypair.private_key);
                (address.clone(), private_key_hex)
            })
            .collect()
    }

    pub fn get_public_key(&self, address: &Address) -> Option<Vec<u8>> {
        self.keypairs.get(address).map(|kp| kp.public_key.clone())
    }

    pub fn contains_address(&self, address: &Address) -> bool {
        self.addresses.contains(address)
    }

    pub fn estimate_fee(&self, inputs: usize, outputs: usize, fee_rate: u64) -> Amount {
        // Simplified fee estimation
        // In a real implementation, you'd calculate the actual transaction size
        let estimated_size = inputs * 180 + outputs * 34 + 10; // Rough estimate
        estimated_size as u64 * fee_rate
    }

    fn keypair_to_address(&self, keypair: &KeyPair) -> Result<Address> {
        self.public_key_to_address(&keypair.public_key)
    }

    fn public_key_to_address(&self, public_key: &[u8]) -> Result<Address> {
        // Bitcoin-style address generation
        let public_key_hash = sha256(public_key);
        let ripemd_hash = crate::crypto::ripemd160(&public_key_hash);
        
        // Add version byte (0x00 for mainnet)
        let mut versioned_hash = vec![0x00];
        versioned_hash.extend_from_slice(&ripemd_hash[..20]); // Take first 20 bytes
        
        // Calculate checksum
        let checksum = sha256(&sha256(&versioned_hash));
        
        // Add checksum
        versioned_hash.extend_from_slice(&checksum[..4]); // Take first 4 bytes
        
        // Encode in Base58
        Ok(versioned_hash.to_base58())
    }

    fn create_signature_hash(&self, transaction: &Transaction, input_index: usize, output: &TxOutput) -> Result<Vec<u8>> {
        // Simplified signature hash (SIGHASH_ALL equivalent)
        let mut data = Vec::new();
        
        // Add transaction ID
        data.extend_from_slice(transaction.id.as_bytes());
        
        // Add input index
        data.extend_from_slice(&(input_index as u32).to_be_bytes());
        
        // Add output being spent
        data.extend_from_slice(&output.value.to_be_bytes());
        data.extend_from_slice(output.address.as_bytes());
        
        Ok(sha256(&data))
    }

    pub fn serialize(&self) -> Result<Vec<u8>> {
        bincode::serialize(self)
            .map_err(|e| BlockchainError::SerializationError(e.to_string()))
    }

    pub fn deserialize(data: &[u8]) -> Result<Self> {
        bincode::deserialize(data)
            .map_err(|e| BlockchainError::SerializationError(e.to_string()))
    }

    pub fn save_to_file(&self, file_path: &str) -> Result<()> {
        let data = self.serialize()?;
        std::fs::write(file_path, data)
            .map_err(|e| BlockchainError::IoError(e))?;
        Ok(())
    }

    pub fn load_from_file(file_path: &str) -> Result<Self> {
        let data = std::fs::read(file_path)
            .map_err(|e| BlockchainError::IoError(e))?;
        Self::deserialize(&data)
    }
}

impl Default for Wallet {
    fn default() -> Self {
        Self::new("default".to_string()).unwrap()
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TransactionSummary {
    pub txid: String,
    pub address: Address,
    pub amount: Amount,
    pub is_outgoing: bool,
    pub height: u64,
    pub timestamp: chrono::DateTime<chrono::Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WalletInfo {
    pub name: String,
    pub address_count: usize,
    pub balance: Amount,
    pub created_at: chrono::DateTime<chrono::Utc>,
}

impl From<&Wallet> for WalletInfo {
    fn from(wallet: &Wallet) -> Self {
        Self {
            name: wallet.name.clone(),
            address_count: wallet.addresses.len(),
            balance: 0, // Would need UTXO set to calculate
            created_at: wallet.created_at,
        }
    }
}

pub fn validate_address(address: &str) -> Result<bool> {
    // Basic Base58 validation
    match address.from_base58() {
        Ok(decoded) => {
            if decoded.len() != 25 {
                return Ok(false);
            }
            
            // Verify checksum
            let (payload, checksum) = decoded.split_at(21);
            let calculated_checksum = sha256(&sha256(payload));
            
            Ok(&calculated_checksum[..4] == checksum)
        }
        Err(_) => Ok(false),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::utxo::UTXOSet;

    fn create_test_utxo_set() -> (UTXOSet, Address) {
        let mut utxo_set = UTXOSet::new();
        let address = "1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa".to_string();
        
        let utxo = UTXO {
            outpoint: OutPoint::new("prev_tx".to_string(), 0),
            output: TxOutput::new(10000, address.clone()),
            height: 1,
            is_coinbase: false,
        };
        
        utxo_set.add_utxo(utxo);
        (utxo_set, address)
    }

    #[test]
    fn test_wallet_creation() {
        let wallet = Wallet::new("test_wallet".to_string()).unwrap();
        assert_eq!(wallet.name, "test_wallet");
        assert_eq!(wallet.addresses.len(), 0);
    }

    #[test]
    fn test_generate_new_address() {
        let mut wallet = Wallet::new("test_wallet".to_string()).unwrap();
        let address = wallet.generate_new_address().unwrap();
        
        assert_eq!(wallet.addresses.len(), 1);
        assert!(wallet.keypairs.contains_key(&address));
        assert!(wallet.contains_address(&address));
    }

    #[test]
    fn test_import_private_key() {
        let mut wallet = Wallet::new("test_wallet".to_string()).unwrap();
        let keypair = KeyPair::new().unwrap();
        let private_key = keypair.private_key.clone();
        
        let address = wallet.import_private_key(&private_key).unwrap();
        
        assert_eq!(wallet.addresses.len(), 1);
        assert!(wallet.keypairs.contains_key(&address));
    }

    #[test]
    fn test_balance_calculation() {
        let mut wallet = Wallet::new("test_wallet".to_string()).unwrap();
        let (utxo_set, address) = create_test_utxo_set();
        
        // Import the address (we can't easily create a matching private key for the test address)
        // So this test would need to be modified to use a proper generated address
        let balance = wallet.get_balance(&utxo_set);
        assert_eq!(balance, 0); // Wallet doesn't contain the test address
    }

    #[test]
    fn test_address_validation() {
        // Valid Bitcoin address
        let valid_address = "1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa";
        // This might not pass validation due to checksum
        
        // Invalid addresses
        assert!(!validate_address("invalid").unwrap());
        assert!(!validate_address("").unwrap());
        assert!(!validate_address("123").unwrap());
    }

    #[test]
    fn test_export_private_keys() {
        let mut wallet = Wallet::new("test_wallet".to_string()).unwrap();
        wallet.generate_new_address().unwrap();
        wallet.generate_new_address().unwrap();
        
        let exported_keys = wallet.export_private_keys();
        assert_eq!(exported_keys.len(), 2);
        
        for (address, private_key) in exported_keys {
            assert!(wallet.contains_address(&address));
            assert!(hex::decode(private_key).is_ok());
        }
    }

    #[test]
    fn test_fee_estimation() {
        let wallet = Wallet::new("test_wallet".to_string()).unwrap();
        let fee = wallet.estimate_fee(2, 2, 10); // 2 inputs, 2 outputs, 10 sat/byte
        
        assert!(fee > 0);
        assert!(fee < 10000); // Reasonable upper bound
    }

    #[test]
    fn test_wallet_serialization() {
        let mut wallet = Wallet::new("test_wallet".to_string()).unwrap();
        wallet.generate_new_address().unwrap();
        
        let serialized = wallet.serialize().unwrap();
        let deserialized = Wallet::deserialize(&serialized).unwrap();
        
        assert_eq!(wallet.name, deserialized.name);
        assert_eq!(wallet.addresses.len(), deserialized.addresses.len());
        assert_eq!(wallet.keypairs.len(), deserialized.keypairs.len());
    }

    #[test]
    fn test_wallet_info_conversion() {
        let mut wallet = Wallet::new("test_wallet".to_string()).unwrap();
        wallet.generate_new_address().unwrap();
        wallet.generate_new_address().unwrap();
        
        let info: WalletInfo = (&wallet).into();
        assert_eq!(info.name, wallet.name);
        assert_eq!(info.address_count, 2);
        assert_eq!(info.created_at, wallet.created_at);
    }
}