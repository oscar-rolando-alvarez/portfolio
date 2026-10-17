use crate::codec;
use crate::crypto::{KeyPair, double_sha256, public_key_to_address};
use crate::error::{BlockchainError, Result};
use crate::utxo::UTXOSet;
use crate::{Address, Amount, Transaction, TxInput, TxOutput, UTXO};
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::path::Path;

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
        Ok(self.insert_keypair(keypair))
    }

    pub fn import_private_key(&mut self, private_key: &[u8]) -> Result<Address> {
        let keypair = KeyPair::from_private_key(private_key)?;
        Ok(self.insert_keypair(keypair))
    }

    fn insert_keypair(&mut self, keypair: KeyPair) -> Address {
        let address = keypair.address();
        if !self.keypairs.contains_key(&address) {
            self.keypairs.insert(address.clone(), keypair);
            self.addresses.push(address.clone());
        }
        address
    }

    pub fn get_balance(&self, utxo_set: &UTXOSet) -> Amount {
        self.addresses
            .iter()
            .map(|address| utxo_set.get_balance(address))
            .sum()
    }

    pub fn get_address_balance(&self, address: &str, utxo_set: &UTXOSet) -> Amount {
        if self.contains_address(address) {
            utxo_set.get_balance(address)
        } else {
            0
        }
    }

    /// Build and sign a transaction paying `amount` to `to_address` plus `fee`.
    ///
    /// Change is returned to the first address that contributed an input.
    /// `current_height` is the chain tip and is used for coinbase maturity.
    pub fn create_transaction(
        &self,
        to_address: Address,
        amount: Amount,
        fee: Amount,
        utxo_set: &UTXOSet,
        current_height: u64,
    ) -> Result<Transaction> {
        if amount == 0 {
            return Err(BlockchainError::WalletError(
                "Amount must be greater than zero".to_string(),
            ));
        }
        let required_amount = amount
            .checked_add(fee)
            .ok_or_else(|| BlockchainError::WalletError("Amount overflow".to_string()))?;

        let mut selected_utxos: Vec<UTXO> = Vec::new();
        let mut total_value: Amount = 0;

        for address in &self.addresses {
            if total_value >= required_amount {
                break;
            }
            let available: Amount = utxo_set.get_balance(address);
            if available == 0 {
                continue;
            }
            let wanted = (required_amount - total_value).min(available);
            let address_utxos = match utxo_set.find_spendable_utxos(address, wanted, current_height)
            {
                Ok(utxos) => utxos,
                Err(BlockchainError::InsufficientFunds) => continue,
                Err(e) => return Err(e),
            };
            for utxo in address_utxos {
                selected_utxos.push(utxo.clone());
                total_value += utxo.output.value;
                if total_value >= required_amount {
                    break;
                }
            }
        }

        if total_value < required_amount {
            return Err(BlockchainError::InsufficientFunds);
        }

        let inputs: Vec<TxInput> = selected_utxos
            .iter()
            .map(|utxo| TxInput::new(utxo.outpoint.txid.clone(), utxo.outpoint.vout, Vec::new()))
            .collect();

        let mut outputs = vec![TxOutput::new(amount, to_address)];
        let change = total_value - required_amount;
        if change > 0 {
            outputs.push(TxOutput::new(
                change,
                selected_utxos[0].output.address.clone(),
            ));
        }

        let mut transaction = Transaction::new(inputs, outputs, 0);
        transaction.fee = fee;

        self.sign_transaction(&mut transaction, &selected_utxos)?;

        Ok(transaction)
    }

    /// Sign every input of `transaction` whose spent output is in `utxos`.
    pub fn sign_transaction(&self, transaction: &mut Transaction, utxos: &[UTXO]) -> Result<()> {
        for input_index in 0..transaction.inputs.len() {
            let Some(outpoint) = transaction.inputs[input_index].previous_output.clone() else {
                continue;
            };
            let Some(utxo) = utxos.iter().find(|u| u.outpoint == outpoint) else {
                continue;
            };
            let keypair = self.keypairs.get(&utxo.output.address).ok_or_else(|| {
                BlockchainError::WalletError(format!(
                    "Private key not found for address: {}",
                    utxo.output.address
                ))
            })?;
            transaction.sign_input(input_index, keypair, &utxo.output)?;
        }

        Ok(())
    }

    /// Verify the input signatures of `transaction` against the given spent outputs.
    pub fn verify_transaction(&self, transaction: &Transaction, utxos: &[UTXO]) -> Result<bool> {
        let utxo_map = utxos
            .iter()
            .map(|u| (u.outpoint.clone(), u.clone()))
            .collect();
        match transaction.verify_input_signatures(&utxo_map) {
            Ok(()) => Ok(true),
            Err(BlockchainError::InvalidSignature) => Ok(false),
            Err(e) => Err(e),
        }
    }

    pub fn get_transaction_history(&self, utxo_set: &UTXOSet) -> Vec<TransactionSummary> {
        let mut summaries: Vec<TransactionSummary> = self
            .addresses
            .iter()
            .flat_map(|address| {
                utxo_set
                    .get_utxos_for_address(address)
                    .into_iter()
                    .map(move |utxo| TransactionSummary {
                        txid: utxo.outpoint.txid.clone(),
                        address: address.clone(),
                        amount: utxo.output.value,
                        is_outgoing: false,
                        height: utxo.height,
                    })
            })
            .collect();
        summaries.sort_by(|a, b| a.height.cmp(&b.height).then_with(|| a.txid.cmp(&b.txid)));
        summaries
    }

    pub fn export_private_keys(&self) -> HashMap<Address, String> {
        self.keypairs
            .iter()
            .map(|(address, keypair)| (address.clone(), hex::encode(&keypair.private_key)))
            .collect()
    }

    pub fn get_public_key(&self, address: &str) -> Option<Vec<u8>> {
        self.keypairs.get(address).map(|kp| kp.public_key.clone())
    }

    pub fn contains_address(&self, address: &str) -> bool {
        self.keypairs.contains_key(address)
    }

    /// Rough fee estimate from the expected serialized size.
    pub fn estimate_fee(&self, inputs: usize, outputs: usize, fee_rate: u64) -> Amount {
        let estimated_size = inputs * 180 + outputs * 34 + 10;
        estimated_size as u64 * fee_rate
    }

    pub fn public_key_to_address(&self, public_key: &[u8]) -> Address {
        public_key_to_address(public_key)
    }

    /// Addresses that hold at least one UTXO.
    pub fn funded_addresses(&self, utxo_set: &UTXOSet) -> HashSet<Address> {
        self.addresses
            .iter()
            .filter(|a| utxo_set.get_balance(a) > 0)
            .cloned()
            .collect()
    }

    pub fn serialize(&self) -> Result<Vec<u8>> {
        codec::encode(self)
    }

    pub fn deserialize(data: &[u8]) -> Result<Self> {
        codec::decode(data)
    }

    pub fn save_to_file(&self, file_path: impl AsRef<Path>) -> Result<()> {
        std::fs::write(file_path, self.serialize()?)?;
        Ok(())
    }

    pub fn load_from_file(file_path: impl AsRef<Path>) -> Result<Self> {
        let data = std::fs::read(file_path)?;
        Self::deserialize(&data)
    }
}

impl Default for Wallet {
    fn default() -> Self {
        Self {
            name: "default".to_string(),
            keypairs: HashMap::new(),
            addresses: Vec::new(),
            created_at: chrono::Utc::now(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TransactionSummary {
    pub txid: String,
    pub address: Address,
    pub amount: Amount,
    pub is_outgoing: bool,
    pub height: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WalletInfo {
    pub name: String,
    pub address_count: usize,
    pub addresses: Vec<Address>,
    pub balance: Amount,
    pub created_at: chrono::DateTime<chrono::Utc>,
}

impl WalletInfo {
    pub fn with_balance(wallet: &Wallet, utxo_set: &UTXOSet) -> Self {
        Self {
            balance: wallet.get_balance(utxo_set),
            ..Self::from(wallet)
        }
    }
}

impl From<&Wallet> for WalletInfo {
    fn from(wallet: &Wallet) -> Self {
        Self {
            name: wallet.name.clone(),
            address_count: wallet.addresses.len(),
            addresses: wallet.addresses.clone(),
            balance: 0,
            created_at: wallet.created_at,
        }
    }
}

/// Check that `address` is Base58Check encoded with a valid checksum.
pub fn validate_address(address: &str) -> Result<bool> {
    match bs58::decode(address).into_vec() {
        Ok(decoded) if decoded.len() == 25 => {
            let (payload, checksum) = decoded.split_at(21);
            Ok(double_sha256(payload)[..4] == *checksum)
        }
        _ => Ok(false),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::OutPoint;

    fn fund(wallet: &Wallet, utxo_set: &mut UTXOSet, txid: &str, value: Amount) -> UTXO {
        let utxo = UTXO {
            outpoint: OutPoint::new(txid.to_string(), 0),
            output: TxOutput::new(value, wallet.addresses[0].clone()),
            height: 1,
            is_coinbase: false,
        };
        utxo_set.add_utxo(utxo.clone());
        utxo
    }

    #[test]
    fn test_wallet_creation() {
        let wallet = Wallet::new("test_wallet".to_string()).unwrap();
        assert_eq!(wallet.name, "test_wallet");
        assert!(wallet.addresses.is_empty());
    }

    #[test]
    fn test_generate_new_address() {
        let mut wallet = Wallet::new("test_wallet".to_string()).unwrap();
        let address = wallet.generate_new_address().unwrap();

        assert_eq!(wallet.addresses.len(), 1);
        assert!(wallet.keypairs.contains_key(&address));
        assert!(wallet.contains_address(&address));
        assert!(validate_address(&address).unwrap());
    }

    #[test]
    fn test_import_private_key() {
        let mut wallet = Wallet::new("test_wallet".to_string()).unwrap();
        let keypair = KeyPair::new().unwrap();

        let address = wallet.import_private_key(&keypair.private_key).unwrap();
        assert_eq!(address, keypair.address());

        // Importing the same key twice does not duplicate it.
        wallet.import_private_key(&keypair.private_key).unwrap();
        assert_eq!(wallet.addresses.len(), 1);
    }

    #[test]
    fn test_balance_calculation() {
        let mut wallet = Wallet::new("test_wallet".to_string()).unwrap();
        wallet.generate_new_address().unwrap();
        let mut utxo_set = UTXOSet::new();

        assert_eq!(wallet.get_balance(&utxo_set), 0);
        fund(&wallet, &mut utxo_set, "tx1", 10_000);
        fund(&wallet, &mut utxo_set, "tx2", 5_000);
        assert_eq!(wallet.get_balance(&utxo_set), 15_000);
        assert_eq!(
            wallet.get_address_balance(&wallet.addresses[0], &utxo_set),
            15_000
        );
        assert_eq!(wallet.get_address_balance("someone_else", &utxo_set), 0);
    }

    #[test]
    fn test_create_transaction_with_change() {
        let mut wallet = Wallet::new("sender".to_string()).unwrap();
        wallet.generate_new_address().unwrap();
        let mut utxo_set = UTXOSet::new();
        let utxo = fund(&wallet, &mut utxo_set, "tx1", 10_000);

        let tx = wallet
            .create_transaction("recipient".to_string(), 6_000, 1_000, &utxo_set, 10)
            .unwrap();

        assert_eq!(tx.outputs.len(), 2);
        assert_eq!(tx.outputs[0].value, 6_000);
        assert_eq!(tx.outputs[1].value, 3_000);
        assert_eq!(tx.outputs[1].address, wallet.addresses[0]);
        assert!(tx.validate(utxo_set.get_all_utxos(), 11).is_ok());
        assert!(wallet.verify_transaction(&tx, &[utxo]).unwrap());
    }

    #[test]
    fn test_create_transaction_insufficient_funds() {
        let mut wallet = Wallet::new("sender".to_string()).unwrap();
        wallet.generate_new_address().unwrap();
        let mut utxo_set = UTXOSet::new();
        fund(&wallet, &mut utxo_set, "tx1", 1_000);

        let result = wallet.create_transaction("r".to_string(), 1_000, 500, &utxo_set, 10);
        assert!(matches!(result, Err(BlockchainError::InsufficientFunds)));
    }

    #[test]
    fn test_create_transaction_across_addresses() {
        let mut wallet = Wallet::new("sender".to_string()).unwrap();
        let first = wallet.generate_new_address().unwrap();
        let second = wallet.generate_new_address().unwrap();
        let mut utxo_set = UTXOSet::new();
        for (txid, address) in [("a", &first), ("b", &second)] {
            utxo_set.add_utxo(UTXO {
                outpoint: OutPoint::new(txid.to_string(), 0),
                output: TxOutput::new(5_000, address.clone()),
                height: 1,
                is_coinbase: false,
            });
        }

        let tx = wallet
            .create_transaction("r".to_string(), 8_000, 1_000, &utxo_set, 10)
            .unwrap();
        assert_eq!(tx.inputs.len(), 2);
        assert!(tx.validate(utxo_set.get_all_utxos(), 11).is_ok());
    }

    #[test]
    fn test_address_validation() {
        assert!(validate_address("1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa").unwrap());
        assert!(!validate_address("1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNb").unwrap());
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
            let restored = KeyPair::from_private_key(&hex::decode(private_key).unwrap()).unwrap();
            assert_eq!(restored.address(), address);
        }
    }

    #[test]
    fn test_fee_estimation() {
        let wallet = Wallet::new("test_wallet".to_string()).unwrap();
        let fee = wallet.estimate_fee(2, 2, 10);
        assert_eq!(fee, (2 * 180 + 2 * 34 + 10) * 10);
    }

    #[test]
    fn test_wallet_serialization_and_files() {
        let mut wallet = Wallet::new("test_wallet".to_string()).unwrap();
        wallet.generate_new_address().unwrap();

        let deserialized = Wallet::deserialize(&wallet.serialize().unwrap()).unwrap();
        assert_eq!(wallet.name, deserialized.name);
        assert_eq!(wallet.addresses, deserialized.addresses);
        assert_eq!(wallet.keypairs, deserialized.keypairs);

        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("w.wallet");
        wallet.save_to_file(&path).unwrap();
        let loaded = Wallet::load_from_file(&path).unwrap();
        assert_eq!(loaded.addresses, wallet.addresses);
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

        let mut utxo_set = UTXOSet::new();
        fund(&wallet, &mut utxo_set, "tx", 42);
        assert_eq!(WalletInfo::with_balance(&wallet, &utxo_set).balance, 42);
    }
}
