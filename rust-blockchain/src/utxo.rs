use crate::codec;
use crate::error::{BlockchainError, Result};
use crate::{Address, Amount, OutPoint, Transaction};
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};

pub use crate::UTXO;

/// Set of unspent transaction outputs with a per-address index.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(from = "UtxoSetRepr", into = "UtxoSetRepr")]
pub struct UTXOSet {
    utxos: HashMap<OutPoint, UTXO>,
    address_index: HashMap<Address, HashSet<OutPoint>>,
}

/// On-disk/on-wire representation; the address index is rebuilt on load.
#[derive(Serialize, Deserialize)]
struct UtxoSetRepr {
    utxos: Vec<UTXO>,
}

impl From<UtxoSetRepr> for UTXOSet {
    fn from(repr: UtxoSetRepr) -> Self {
        let mut set = UTXOSet::new();
        for utxo in repr.utxos {
            set.add_utxo(utxo);
        }
        set
    }
}

impl From<UTXOSet> for UtxoSetRepr {
    fn from(set: UTXOSet) -> Self {
        let mut utxos: Vec<UTXO> = set.utxos.into_values().collect();
        utxos.sort_by(|a, b| a.outpoint.cmp(&b.outpoint));
        Self { utxos }
    }
}

impl UTXOSet {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn add_utxo(&mut self, utxo: UTXO) {
        let address = utxo.output.address.clone();
        let outpoint = utxo.outpoint.clone();

        if let Some(previous) = self.utxos.insert(outpoint.clone(), utxo) {
            self.unindex(&previous.output.address, &outpoint);
        }

        self.address_index
            .entry(address)
            .or_default()
            .insert(outpoint);
    }

    fn unindex(&mut self, address: &str, outpoint: &OutPoint) {
        if let Some(address_utxos) = self.address_index.get_mut(address) {
            address_utxos.remove(outpoint);
            if address_utxos.is_empty() {
                self.address_index.remove(address);
            }
        }
    }

    pub fn remove_utxo(&mut self, outpoint: &OutPoint) -> Option<UTXO> {
        let utxo = self.utxos.remove(outpoint)?;
        self.unindex(&utxo.output.address, outpoint);
        Some(utxo)
    }

    pub fn get_utxo(&self, outpoint: &OutPoint) -> Option<&UTXO> {
        self.utxos.get(outpoint)
    }

    pub fn get_utxos_for_address(&self, address: &str) -> Vec<&UTXO> {
        self.address_index
            .get(address)
            .map(|outpoints| {
                outpoints
                    .iter()
                    .filter_map(|outpoint| self.utxos.get(outpoint))
                    .collect()
            })
            .unwrap_or_default()
    }

    pub fn get_balance(&self, address: &str) -> Amount {
        self.get_utxos_for_address(address)
            .iter()
            .map(|utxo| utxo.output.value)
            .sum()
    }

    /// Spend the inputs and create the outputs of `transaction`.
    ///
    /// The operation is atomic: if any input is missing nothing is changed.
    pub fn apply_transaction(&mut self, transaction: &Transaction, height: u64) -> Result<()> {
        if !transaction.is_coinbase() {
            for outpoint in transaction
                .inputs
                .iter()
                .filter_map(|input| input.previous_output.as_ref())
            {
                if !self.contains(outpoint) {
                    return Err(BlockchainError::ValidationError(format!(
                        "Attempting to spend non-existent UTXO: {}:{}",
                        outpoint.txid, outpoint.vout
                    )));
                }
            }
            for outpoint in transaction
                .inputs
                .iter()
                .filter_map(|input| input.previous_output.as_ref())
            {
                self.remove_utxo(outpoint);
            }
        }

        for (vout, output) in transaction.outputs.iter().enumerate() {
            self.add_utxo(UTXO {
                outpoint: OutPoint {
                    txid: transaction.id.clone(),
                    vout: vout as u32,
                },
                output: output.clone(),
                height,
                is_coinbase: transaction.is_coinbase(),
            });
        }

        Ok(())
    }

    /// Undo `transaction`: remove the outputs it created and restore the
    /// outputs it spent (which the caller must supply).
    pub fn revert_transaction(&mut self, transaction: &Transaction, spent: &[UTXO]) -> Result<()> {
        for vout in 0..transaction.outputs.len() {
            self.remove_utxo(&OutPoint {
                txid: transaction.id.clone(),
                vout: vout as u32,
            });
        }

        for utxo in spent {
            self.add_utxo(utxo.clone());
        }

        Ok(())
    }

    /// Select mature UTXOs of `address` (largest first) covering `amount`.
    pub fn find_spendable_utxos(
        &self,
        address: &str,
        amount: Amount,
        current_height: u64,
    ) -> Result<Vec<&UTXO>> {
        let mut candidates: Vec<&UTXO> = self
            .get_utxos_for_address(address)
            .into_iter()
            .filter(|utxo| {
                !utxo.is_coinbase
                    || current_height.saturating_sub(utxo.height) >= crate::COINBASE_MATURITY
            })
            .collect();

        candidates.sort_by(|a, b| {
            b.output
                .value
                .cmp(&a.output.value)
                .then_with(|| a.outpoint.cmp(&b.outpoint))
        });

        let mut selected = Vec::new();
        let mut total: Amount = 0;
        for utxo in candidates {
            if total >= amount {
                break;
            }
            total = total.saturating_add(utxo.output.value);
            selected.push(utxo);
        }

        if total < amount {
            return Err(BlockchainError::InsufficientFunds);
        }

        Ok(selected)
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

    /// Sum of the referenced outputs, checking existence and coinbase maturity.
    pub fn validate_transaction_inputs(
        &self,
        transaction: &Transaction,
        current_height: u64,
    ) -> Result<Amount> {
        if transaction.is_coinbase() {
            return Ok(0);
        }

        let mut total_input_value: Amount = 0;
        for outpoint in transaction
            .inputs
            .iter()
            .filter_map(|input| input.previous_output.as_ref())
        {
            let utxo = self.get_utxo(outpoint).ok_or_else(|| {
                BlockchainError::ValidationError(format!(
                    "Referenced UTXO not found: {}:{}",
                    outpoint.txid, outpoint.vout
                ))
            })?;
            if utxo.is_coinbase
                && current_height.saturating_sub(utxo.height) < crate::COINBASE_MATURITY
            {
                return Err(BlockchainError::ValidationError(
                    "Coinbase output not mature enough to spend".to_string(),
                ));
            }
            total_input_value = total_input_value.saturating_add(utxo.output.value);
        }

        Ok(total_input_value)
    }

    pub fn serialize(&self) -> Result<Vec<u8>> {
        codec::encode(self)
    }

    pub fn deserialize(data: &[u8]) -> Result<Self> {
        codec::decode(data)
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
            output: TxOutput::new(value, address.to_string()),
            height: 1,
            is_coinbase: false,
        }
    }

    fn spending_tx(prev: &str, outputs: Vec<TxOutput>) -> Transaction {
        Transaction {
            id: "new_tx".to_string(),
            inputs: vec![TxInput::new(prev.to_string(), 0, Vec::new())],
            outputs,
            lock_time: 0,
            timestamp: Utc::now(),
            fee: 100,
            signature: None,
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
        assert!(utxo_set.is_empty());
        assert!(utxo_set.get_addresses().is_empty());
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
        assert_eq!(utxo_set.total_supply(), 3500);
    }

    #[test]
    fn test_find_spendable_utxos() {
        let mut utxo_set = UTXOSet::new();

        utxo_set.add_utxo(create_test_utxo("tx1", 0, 1000, "address1"));
        utxo_set.add_utxo(create_test_utxo("tx2", 0, 2000, "address1"));
        utxo_set.add_utxo(create_test_utxo("tx3", 0, 500, "address1"));

        let utxos = utxo_set
            .find_spendable_utxos("address1", 2500, 100)
            .unwrap();
        let total_value: Amount = utxos.iter().map(|utxo| utxo.output.value).sum();

        assert_eq!(total_value, 3000);
        assert_eq!(utxos.len(), 2);
    }

    #[test]
    fn test_insufficient_funds() {
        let mut utxo_set = UTXOSet::new();
        utxo_set.add_utxo(create_test_utxo("tx1", 0, 1000, "address1"));

        let result = utxo_set.find_spendable_utxos("address1", 2000, 100);
        assert!(matches!(result, Err(BlockchainError::InsufficientFunds)));
    }

    #[test]
    fn test_apply_transaction() {
        let mut utxo_set = UTXOSet::new();
        utxo_set.add_utxo(create_test_utxo("prev_tx", 0, 1000, "address1"));

        let transaction = spending_tx(
            "prev_tx",
            vec![
                TxOutput::new(600, "address2".to_string()),
                TxOutput::new(300, "address1".to_string()),
            ],
        );

        utxo_set.apply_transaction(&transaction, 2).unwrap();

        assert!(!utxo_set.contains(&OutPoint::new("prev_tx".to_string(), 0)));
        assert!(utxo_set.contains(&OutPoint::new("new_tx".to_string(), 0)));
        assert!(utxo_set.contains(&OutPoint::new("new_tx".to_string(), 1)));
        assert_eq!(utxo_set.get_balance("address1"), 300);
        assert_eq!(utxo_set.get_balance("address2"), 600);
    }

    #[test]
    fn test_apply_transaction_is_atomic() {
        let mut utxo_set = UTXOSet::new();
        utxo_set.add_utxo(create_test_utxo("prev_tx", 0, 1000, "address1"));

        let mut transaction = spending_tx("prev_tx", vec![TxOutput::new(900, "a2".to_string())]);
        transaction
            .inputs
            .push(TxInput::new("missing".to_string(), 0, Vec::new()));

        assert!(utxo_set.apply_transaction(&transaction, 2).is_err());
        assert!(utxo_set.contains(&OutPoint::new("prev_tx".to_string(), 0)));
        assert_eq!(utxo_set.size(), 1);
    }

    #[test]
    fn test_revert_transaction() {
        let mut utxo_set = UTXOSet::new();
        let original = create_test_utxo("prev_tx", 0, 1000, "address1");
        utxo_set.add_utxo(original.clone());

        let transaction = spending_tx("prev_tx", vec![TxOutput::new(900, "a2".to_string())]);
        utxo_set.apply_transaction(&transaction, 2).unwrap();
        utxo_set
            .revert_transaction(&transaction, std::slice::from_ref(&original))
            .unwrap();

        assert_eq!(utxo_set.size(), 1);
        assert_eq!(utxo_set.get_balance("address1"), 1000);
        assert_eq!(utxo_set.get_balance("a2"), 0);
    }

    #[test]
    fn test_coinbase_maturity() {
        let mut utxo_set = UTXOSet::new();
        let mut coinbase_utxo = create_test_utxo("coinbase_tx", 0, 5_000_000_000, "miner");
        coinbase_utxo.is_coinbase = true;
        coinbase_utxo.height = 1;

        utxo_set.add_utxo(coinbase_utxo);

        assert!(utxo_set.find_spendable_utxos("miner", 1000, 50).is_err());
        assert!(utxo_set.find_spendable_utxos("miner", 1000, 101).is_ok());
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
        assert_eq!(deserialized.get_balance("address1"), 1000);
        assert_eq!(deserialized.get_balance("address2"), 2000);
    }
}
