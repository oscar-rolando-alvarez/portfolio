use crate::error::{BlockchainError, Result};
use crate::{Address, Amount, OutPoint, Transaction, TxOutput, UTXO};
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UTXOSet {
    utxos: HashMap<OutPoint, UTXO>,
    address_index: HashMap<Address, HashSet<OutPoint>>,
}

impl UTXOSet {
    pub fn new() -> Self {
        Self {
            utxos: HashMap::new(),
            address_index: HashMap::new(),
        }
    }

    pub fn add_utxo(&mut self, utxo: UTXO) {
        let address = utxo.output.address.clone();
        let outpoint = utxo.outpoint.clone();
        
        self.utxos.insert(outpoint.clone(), utxo);
        
        self.address_index
            .entry(address)
            .or_insert_with(HashSet::new)
            .insert(outpoint);
    }

    pub fn remove_utxo(&mut self, outpoint: &OutPoint) -> Option<UTXO> {
        if let Some(utxo) = self.utxos.remove(outpoint) {
            let address = &utxo.output.address;
            if let Some(address_utxos) = self.address_index.get_mut(address) {
                address_utxos.remove(outpoint);
                if address_utxos.is_empty() {
                    self.address_index.remove(address);
                }
            }
            Some(utxo)
        } else {
            None
        }
    }

    pub fn get_utxo(&self, outpoint: &OutPoint) -> Option<&UTXO> {
        self.utxos.get(outpoint)
    }

    pub fn get_utxos_for_address(&self, address: &Address) -> Vec<&UTXO> {
        if let Some(outpoints) = self.address_index.get(address) {
            outpoints
                .iter()
                .filter_map(|outpoint| self.utxos.get(outpoint))
                .collect()
        } else {
            Vec::new()
        }
    }

    pub fn get_balance(&self, address: &Address) -> Amount {
        self.get_utxos_for_address(address)
            .iter()
            .map(|utxo| utxo.output.value)
            .sum()
    }

    pub fn apply_transaction(&mut self, transaction: &Transaction, height: u64) -> Result<()> {
        // Remove spent UTXOs (inputs)
        if !transaction.is_coinbase() {
            for input in &transaction.inputs {
                if let Some(outpoint) = &input.previous_output {
                    if self.remove_utxo(outpoint).is_none() {
                        return Err(BlockchainError::ValidationError(
                            format!("Attempting to spend non-existent UTXO: {}:{}", 
                                   outpoint.txid, outpoint.vout)
                        ));
                    }
                }
            }
        }

        // Add new UTXOs (outputs)
        for (vout, output) in transaction.outputs.iter().enumerate() {
            let utxo = UTXO {
                outpoint: OutPoint {
                    txid: transaction.id.clone(),
                    vout: vout as u32,
                },
                output: output.clone(),
                height,
                is_coinbase: transaction.is_coinbase(),
            };
            self.add_utxo(utxo);
        }

        Ok(())
    }

    pub fn revert_transaction(&mut self, transaction: &Transaction) -> Result<()> {
        // Remove UTXOs created by this transaction
        for vout in 0..transaction.outputs.len() {
            let outpoint = OutPoint {
                txid: transaction.id.clone(),
                vout: vout as u32,
            };
            self.remove_utxo(&outpoint);
        }

        // This is more complex for reverting as we'd need to restore spent UTXOs
        // In a real implementation, you'd need to track the UTXOs that were spent
        // For now, we'll just remove the created UTXOs
        
        Ok(())
    }

    pub fn find_spendable_utxos(
        &self,
        address: &Address,
        amount: Amount,
        current_height: u64,
    ) -> Result<Vec<&UTXO>> {
        let mut selected_utxos = Vec::new();
        let mut total_value = 0;

        let mut candidate_utxos: Vec<&UTXO> = self
            .get_utxos_for_address(address)
            .into_iter()
            .filter(|utxo| {
                // Check coinbase maturity
                !utxo.is_coinbase || (current_height - utxo.height) >= crate::COINBASE_MATURITY
            })
            .collect();

        // Sort by value (largest first for efficiency)
        candidate_utxos.sort_by(|a, b| b.output.value.cmp(&a.output.value));

        for utxo in candidate_utxos {
            selected_utxos.push(utxo);
            total_value += utxo.output.value;
            
            if total_value >= amount {
                break;
            }
        }

        if total_value < amount {
            return Err(BlockchainError::InsufficientFunds);
        }

        Ok(selected_utxos)
    }

    pub fn total_supply(&self) -> Amount {
        self.utxos.values().map(|utxo| utxo.output.value).sum()
    }

    pub fn size(&self) -> usize {
        self.utxos.len()
    }

    pub fn is_empty(&self) -> bool {
        self.utxos.is_empty()
    }

    pub fn contains(&self, outpoint: &OutPoint) -> bool {
        self.utxos.contains_key(outpoint)
    }

    pub fn get_all_utxos(&self) -> &HashMap<OutPoint, UTXO> {
        &self.utxos
    }

    pub fn get_addresses(&self) -> Vec<Address> {
        self.address_index.keys().cloned().collect()
    }

    pub fn validate_transaction_inputs(
        &self,
        transaction: &Transaction,
        current_height: u64,
    ) -> Result<Amount> {
        if transaction.is_coinbase() {
            return Ok(0);
        }

        let mut total_input_value = 0;

        for input in &transaction.inputs {
            if let Some(outpoint) = &input.previous_output {
                if let Some(utxo) = self.get_utxo(outpoint) {
                    // Check coinbase maturity
                    if utxo.is_coinbase && (current_height - utxo.height) < crate::COINBASE_MATURITY {
                        return Err(BlockchainError::ValidationError(
                            "Coinbase output not mature enough to spend".to_string()
                        ));
                    }
                    total_input_value += utxo.output.value;
                } else {
                    return Err(BlockchainError::ValidationError(
                        format!("Referenced UTXO not found: {}:{}", outpoint.txid, outpoint.vout)
                    ));
                }
            }
        }

        Ok(total_input_value)
    }

    pub fn serialize(&self) -> Result<Vec<u8>> {
        bincode::serialize(self)
            .map_err(|e| BlockchainError::SerializationError(e.to_string()))
    }

    pub fn deserialize(data: &[u8]) -> Result<Self> {
        bincode::deserialize(data)
            .map_err(|e| BlockchainError::SerializationError(e.to_string()))
    }
}

impl Default for UTXOSet {
    fn default() -> Self {
        Self::new()
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UTXOSnapshot {
    pub height: u64,
    pub utxo_set: UTXOSet,
    pub total_supply: Amount,
    pub timestamp: chrono::DateTime<chrono::Utc>,
}

impl UTXOSnapshot {
    pub fn new(utxo_set: UTXOSet, height: u64) -> Self {
        let total_supply = utxo_set.total_supply();
        Self {
            height,
            utxo_set,
            total_supply,
            timestamp: chrono::Utc::now(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{TxInput, TxOutput};
    use chrono::Utc;

    fn create_test_utxo(txid: &str, vout: u32, value: Amount, address: &str) -> UTXO {
        UTXO {
            outpoint: OutPoint {
                txid: txid.to_string(),
                vout,
            },
            output: TxOutput {
                value,
                script_pubkey: Vec::new(),
                address: address.to_string(),
            },
            height: 1,
            is_coinbase: false,
        }
    }

    #[test]
    fn test_utxo_set_basic_operations() {
        let mut utxo_set = UTXOSet::new();
        let utxo = create_test_utxo("tx1", 0, 1000, "address1");
        let outpoint = utxo.outpoint.clone();

        utxo_set.add_utxo(utxo);

        assert_eq!(utxo_set.size(), 1);
        assert!(utxo_set.contains(&outpoint));
        assert_eq!(utxo_set.get_balance("address1"), 1000);

        let removed = utxo_set.remove_utxo(&outpoint);
        assert!(removed.is_some());
        assert_eq!(utxo_set.size(), 0);
        assert!(!utxo_set.contains(&outpoint));
    }

    #[test]
    fn test_address_balance() {
        let mut utxo_set = UTXOSet::new();
        
        utxo_set.add_utxo(create_test_utxo("tx1", 0, 1000, "address1"));
        utxo_set.add_utxo(create_test_utxo("tx2", 0, 2000, "address1"));
        utxo_set.add_utxo(create_test_utxo("tx3", 0, 500, "address2"));

        assert_eq!(utxo_set.get_balance("address1"), 3000);
        assert_eq!(utxo_set.get_balance("address2"), 500);
        assert_eq!(utxo_set.get_balance("nonexistent"), 0);
    }

    #[test]
    fn test_find_spendable_utxos() {
        let mut utxo_set = UTXOSet::new();
        
        utxo_set.add_utxo(create_test_utxo("tx1", 0, 1000, "address1"));
        utxo_set.add_utxo(create_test_utxo("tx2", 0, 2000, "address1"));
        utxo_set.add_utxo(create_test_utxo("tx3", 0, 500, "address1"));

        let utxos = utxo_set.find_spendable_utxos("address1", 2500, 100).unwrap();
        let total_value: Amount = utxos.iter().map(|utxo| utxo.output.value).sum();
        
        assert!(total_value >= 2500);
        assert!(utxos.len() >= 2); // Should need at least 2 UTXOs
    }

    #[test]
    fn test_insufficient_funds() {
        let mut utxo_set = UTXOSet::new();
        utxo_set.add_utxo(create_test_utxo("tx1", 0, 1000, "address1"));

        let result = utxo_set.find_spendable_utxos("address1", 2000, 100);
        assert!(result.is_err());
        assert!(matches!(result.unwrap_err(), BlockchainError::InsufficientFunds));
    }

    #[test]
    fn test_apply_transaction() {
        let mut utxo_set = UTXOSet::new();
        utxo_set.add_utxo(create_test_utxo("prev_tx", 0, 1000, "address1"));

        let mut transaction = Transaction {
            id: "new_tx".to_string(),
            inputs: vec![TxInput {
                previous_output: Some(OutPoint {
                    txid: "prev_tx".to_string(),
                    vout: 0,
                }),
                script_sig: Vec::new(),
                sequence: 0,
            }],
            outputs: vec![
                TxOutput::new(600, "address2".to_string()),
                TxOutput::new(300, "address1".to_string()),
            ],
            lock_time: 0,
            timestamp: Utc::now(),
            fee: 100,
            signature: None,
        };

        utxo_set.apply_transaction(&transaction, 2).unwrap();

        // Previous UTXO should be spent
        assert!(!utxo_set.contains(&OutPoint {
            txid: "prev_tx".to_string(),
            vout: 0,
        }));

        // New UTXOs should be created
        assert!(utxo_set.contains(&OutPoint {
            txid: "new_tx".to_string(),
            vout: 0,
        }));
        assert!(utxo_set.contains(&OutPoint {
            txid: "new_tx".to_string(),
            vout: 1,
        }));

        assert_eq!(utxo_set.get_balance("address1"), 300);
        assert_eq!(utxo_set.get_balance("address2"), 600);
    }

    #[test]
    fn test_coinbase_maturity() {
        let mut utxo_set = UTXOSet::new();
        let mut coinbase_utxo = create_test_utxo("coinbase_tx", 0, 5000000000, "miner");
        coinbase_utxo.is_coinbase = true;
        coinbase_utxo.height = 1;
        
        utxo_set.add_utxo(coinbase_utxo);

        // Should not be spendable before maturity
        let result = utxo_set.find_spendable_utxos("miner", 1000, 50);
        assert!(result.is_err());

        // Should be spendable after maturity
        let result = utxo_set.find_spendable_utxos("miner", 1000, 102);
        assert!(result.is_ok());
    }

    #[test]
    fn test_serialization() {
        let mut utxo_set = UTXOSet::new();
        utxo_set.add_utxo(create_test_utxo("tx1", 0, 1000, "address1"));
        utxo_set.add_utxo(create_test_utxo("tx2", 1, 2000, "address2"));

        let serialized = utxo_set.serialize().unwrap();
        let deserialized = UTXOSet::deserialize(&serialized).unwrap();

        assert_eq!(utxo_set.size(), deserialized.size());
        assert_eq!(utxo_set.total_supply(), deserialized.total_supply());
        assert_eq!(utxo_set.get_balance("address1"), deserialized.get_balance("address1"));
        assert_eq!(utxo_set.get_balance("address2"), deserialized.get_balance("address2"));
    }
}