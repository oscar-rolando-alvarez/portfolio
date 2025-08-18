use crate::crypto::{sha256, hash_to_string, verify_signature};
use crate::error::{BlockchainError, Result};
use crate::{Address, Amount, Hash, OutPoint, Signature, TxInput, TxOutput, Transaction, UTXO};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

impl Transaction {
    pub fn new(
        inputs: Vec<TxInput>,
        outputs: Vec<TxOutput>,
        lock_time: u64,
    ) -> Self {
        let mut tx = Transaction {
            id: String::new(),
            inputs,
            outputs,
            lock_time,
            timestamp: Utc::now(),
            fee: 0,
            signature: None,
        };
        tx.id = tx.calculate_id();
        tx.fee = tx.calculate_fee();
        tx
    }

    pub fn new_coinbase(reward: Amount, miner_address: Address, height: u64) -> Self {
        let coinbase_input = TxInput {
            previous_output: None,
            script_sig: height.to_be_bytes().to_vec(),
            sequence: 0xFFFFFFFF,
        };

        let coinbase_output = TxOutput {
            value: reward,
            script_pubkey: Vec::new(),
            address: miner_address,
        };

        let mut tx = Transaction {
            id: String::new(),
            inputs: vec![coinbase_input],
            outputs: vec![coinbase_output],
            lock_time: 0,
            timestamp: Utc::now(),
            fee: 0,
            signature: None,
        };
        tx.id = tx.calculate_id();
        tx
    }

    pub fn calculate_id(&self) -> Hash {
        let mut data = Vec::new();
        
        // Add inputs
        for input in &self.inputs {
            if let Some(outpoint) = &input.previous_output {
                data.extend_from_slice(outpoint.txid.as_bytes());
                data.extend_from_slice(&outpoint.vout.to_be_bytes());
            }
            data.extend_from_slice(&input.script_sig);
            data.extend_from_slice(&input.sequence.to_be_bytes());
        }
        
        // Add outputs
        for output in &self.outputs {
            data.extend_from_slice(&output.value.to_be_bytes());
            data.extend_from_slice(&output.script_pubkey);
            data.extend_from_slice(output.address.as_bytes());
        }
        
        // Add lock time
        data.extend_from_slice(&self.lock_time.to_be_bytes());
        
        hash_to_string(&sha256(&data))
    }

    pub fn calculate_fee(&self) -> Amount {
        // Fee calculation would require UTXO set to determine input values
        // For now, return a default fee
        1000 // 0.00001 coins
    }

    pub fn is_coinbase(&self) -> bool {
        self.inputs.len() == 1 && self.inputs[0].previous_output.is_none()
    }

    pub fn total_input_value(&self, utxo_set: &HashMap<OutPoint, UTXO>) -> Result<Amount> {
        if self.is_coinbase() {
            return Ok(0);
        }

        let mut total = 0;
        for input in &self.inputs {
            if let Some(outpoint) = &input.previous_output {
                if let Some(utxo) = utxo_set.get(outpoint) {
                    total += utxo.output.value;
                } else {
                    return Err(BlockchainError::ValidationError(
                        format!("UTXO not found for outpoint: {}:{}", outpoint.txid, outpoint.vout)
                    ));
                }
            }
        }
        Ok(total)
    }

    pub fn total_output_value(&self) -> Amount {
        self.outputs.iter().map(|output| output.value).sum()
    }

    pub fn validate(&self, utxo_set: &HashMap<OutPoint, UTXO>, current_height: u64) -> Result<()> {
        // Basic validation
        if self.inputs.is_empty() {
            return Err(BlockchainError::InvalidTransaction(
                "Transaction has no inputs".to_string()
            ));
        }

        if self.outputs.is_empty() {
            return Err(BlockchainError::InvalidTransaction(
                "Transaction has no outputs".to_string()
            ));
        }

        // Validate transaction ID
        if self.id != self.calculate_id() {
            return Err(BlockchainError::InvalidTransaction(
                "Invalid transaction ID".to_string()
            ));
        }

        // Check for negative or zero outputs
        for output in &self.outputs {
            if output.value == 0 {
                return Err(BlockchainError::InvalidTransaction(
                    "Output value cannot be zero".to_string()
                ));
            }
        }

        // Coinbase transaction validation
        if self.is_coinbase() {
            if self.inputs.len() != 1 {
                return Err(BlockchainError::InvalidTransaction(
                    "Coinbase transaction must have exactly one input".to_string()
                ));
            }
            return Ok(()); // Skip further validation for coinbase
        }

        // Validate inputs exist and are unspent
        let mut total_input_value = 0;
        for input in &self.inputs {
            if let Some(outpoint) = &input.previous_output {
                if let Some(utxo) = utxo_set.get(outpoint) {
                    // Check coinbase maturity
                    if utxo.is_coinbase && (current_height - utxo.height) < crate::COINBASE_MATURITY {
                        return Err(BlockchainError::InvalidTransaction(
                            "Coinbase output not mature enough to spend".to_string()
                        ));
                    }
                    total_input_value += utxo.output.value;
                } else {
                    return Err(BlockchainError::InvalidTransaction(
                        format!("Referenced UTXO not found: {}:{}", outpoint.txid, outpoint.vout)
                    ));
                }
            }
        }

        let total_output_value = self.total_output_value();

        // Check that inputs >= outputs (fee is the difference)
        if total_input_value < total_output_value {
            return Err(BlockchainError::InvalidTransaction(
                "Total input value less than total output value".to_string()
            ));
        }

        // Check for reasonable fee (not too high)
        let fee = total_input_value - total_output_value;
        if fee > total_input_value / 2 {
            return Err(BlockchainError::InvalidTransaction(
                "Transaction fee too high".to_string()
            ));
        }

        Ok(())
    }

    pub fn sign(&mut self, private_key: &[u8]) -> Result<()> {
        let message = self.get_signing_data();
        let signature = crate::crypto::KeyPair::from_private_key(private_key)?
            .sign(&message)?;
        self.signature = Some(signature);
        Ok(())
    }

    pub fn verify_signature(&self, public_key: &[u8]) -> Result<bool> {
        if let Some(signature) = &self.signature {
            let message = self.get_signing_data();
            verify_signature(public_key, &message, signature)
        } else {
            Ok(false)
        }
    }

    fn get_signing_data(&self) -> Vec<u8> {
        let mut data = Vec::new();
        data.extend_from_slice(self.id.as_bytes());
        data.extend_from_slice(&self.lock_time.to_be_bytes());
        data
    }

    pub fn serialize(&self) -> Result<Vec<u8>> {
        bincode::serialize(self)
            .map_err(|e| BlockchainError::SerializationError(e.to_string()))
    }

    pub fn deserialize(data: &[u8]) -> Result<Self> {
        bincode::deserialize(data)
            .map_err(|e| BlockchainError::SerializationError(e.to_string()))
    }

    pub fn size(&self) -> usize {
        self.serialize().map(|data| data.len()).unwrap_or(0)
    }

    pub fn get_output(&self, index: u32) -> Option<&TxOutput> {
        self.outputs.get(index as usize)
    }

    pub fn creates_utxo(&self, vout: u32) -> Option<UTXO> {
        self.get_output(vout).map(|output| UTXO {
            outpoint: OutPoint {
                txid: self.id.clone(),
                vout,
            },
            output: output.clone(),
            height: 0, // Will be set when added to blockchain
            is_coinbase: self.is_coinbase(),
        })
    }
}

impl TxInput {
    pub fn new(txid: Hash, vout: u32, script_sig: Vec<u8>) -> Self {
        Self {
            previous_output: Some(OutPoint { txid, vout }),
            script_sig,
            sequence: 0xFFFFFFFF,
        }
    }

    pub fn coinbase(script_sig: Vec<u8>) -> Self {
        Self {
            previous_output: None,
            script_sig,
            sequence: 0xFFFFFFFF,
        }
    }
}

impl TxOutput {
    pub fn new(value: Amount, address: Address) -> Self {
        Self {
            value,
            script_pubkey: Vec::new(), // Simplified script
            address,
        }
    }

    pub fn is_dust(&self) -> bool {
        self.value < 546 // Dust threshold in satoshis
    }
}

impl OutPoint {
    pub fn new(txid: Hash, vout: u32) -> Self {
        Self { txid, vout }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TransactionBuilder {
    inputs: Vec<TxInput>,
    outputs: Vec<TxOutput>,
    lock_time: u64,
}

impl TransactionBuilder {
    pub fn new() -> Self {
        Self {
            inputs: Vec::new(),
            outputs: Vec::new(),
            lock_time: 0,
        }
    }

    pub fn add_input(mut self, txid: Hash, vout: u32, script_sig: Vec<u8>) -> Self {
        self.inputs.push(TxInput::new(txid, vout, script_sig));
        self
    }

    pub fn add_output(mut self, value: Amount, address: Address) -> Self {
        self.outputs.push(TxOutput::new(value, address));
        self
    }

    pub fn lock_time(mut self, lock_time: u64) -> Self {
        self.lock_time = lock_time;
        self
    }

    pub fn build(self) -> Transaction {
        Transaction::new(self.inputs, self.outputs, self.lock_time)
    }
}

impl Default for TransactionBuilder {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;

    #[test]
    fn test_transaction_creation() {
        let inputs = vec![TxInput::new(
            "prev_tx_id".to_string(),
            0,
            vec![1, 2, 3],
        )];
        let outputs = vec![TxOutput::new(1000, "address1".to_string())];
        
        let tx = Transaction::new(inputs, outputs, 0);
        
        assert!(!tx.id.is_empty());
        assert_eq!(tx.inputs.len(), 1);
        assert_eq!(tx.outputs.len(), 1);
        assert!(!tx.is_coinbase());
    }

    #[test]
    fn test_coinbase_transaction() {
        let tx = Transaction::new_coinbase(5000000000, "miner_address".to_string(), 1);
        
        assert!(tx.is_coinbase());
        assert_eq!(tx.inputs.len(), 1);
        assert_eq!(tx.outputs.len(), 1);
        assert_eq!(tx.outputs[0].value, 5000000000);
        assert!(tx.inputs[0].previous_output.is_none());
    }

    #[test]
    fn test_transaction_validation() {
        let mut utxo_set = HashMap::new();
        let outpoint = OutPoint::new("prev_tx".to_string(), 0);
        let utxo = UTXO {
            outpoint: outpoint.clone(),
            output: TxOutput::new(2000, "address".to_string()),
            height: 1,
            is_coinbase: false,
        };
        utxo_set.insert(outpoint.clone(), utxo);

        let inputs = vec![TxInput::new(
            "prev_tx".to_string(),
            0,
            vec![],
        )];
        let outputs = vec![TxOutput::new(1500, "new_address".to_string())];
        
        let tx = Transaction::new(inputs, outputs, 0);
        
        assert!(tx.validate(&utxo_set, 100).is_ok());
    }

    #[test]
    fn test_transaction_builder() {
        let tx = TransactionBuilder::new()
            .add_input("prev_tx".to_string(), 0, vec![1, 2, 3])
            .add_output(1000, "address1".to_string())
            .add_output(500, "address2".to_string())
            .lock_time(12345)
            .build();

        assert_eq!(tx.inputs.len(), 1);
        assert_eq!(tx.outputs.len(), 2);
        assert_eq!(tx.lock_time, 12345);
    }

    #[test]
    fn test_transaction_serialization() {
        let tx = TransactionBuilder::new()
            .add_input("prev_tx".to_string(), 0, vec![1, 2, 3])
            .add_output(1000, "address1".to_string())
            .build();

        let serialized = tx.serialize().unwrap();
        let deserialized = Transaction::deserialize(&serialized).unwrap();

        assert_eq!(tx.id, deserialized.id);
        assert_eq!(tx.inputs.len(), deserialized.inputs.len());
        assert_eq!(tx.outputs.len(), deserialized.outputs.len());
    }

    #[test]
    fn test_insufficient_funds() {
        let mut utxo_set = HashMap::new();
        let outpoint = OutPoint::new("prev_tx".to_string(), 0);
        let utxo = UTXO {
            outpoint: outpoint.clone(),
            output: TxOutput::new(1000, "address".to_string()),
            height: 1,
            is_coinbase: false,
        };
        utxo_set.insert(outpoint, utxo);

        let inputs = vec![TxInput::new(
            "prev_tx".to_string(),
            0,
            vec![],
        )];
        let outputs = vec![TxOutput::new(1500, "new_address".to_string())];
        
        let tx = Transaction::new(inputs, outputs, 0);
        
        assert!(tx.validate(&utxo_set, 100).is_err());
    }
}