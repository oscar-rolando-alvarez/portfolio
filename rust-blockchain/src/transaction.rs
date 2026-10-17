use crate::codec;
use crate::crypto::{KeyPair, hash_to_string, public_key_to_address, sha256, verify_signature};
use crate::error::{BlockchainError, Result};
use crate::{Address, Amount, Hash, OutPoint, Transaction, TxInput, TxOutput, UTXO};
use chrono::Utc;
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};

/// Length of a compact ECDSA signature inside a `script_sig`.
pub const SIGNATURE_LEN: usize = 64;
/// Length of a compressed secp256k1 public key inside a `script_sig`.
pub const PUBLIC_KEY_LEN: usize = 33;

impl Transaction {
    pub fn new(inputs: Vec<TxInput>, outputs: Vec<TxOutput>, lock_time: u64) -> Self {
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
        tx
    }

    pub fn new_coinbase(reward: Amount, miner_address: Address, height: u64) -> Self {
        let coinbase_input = TxInput::coinbase(height.to_be_bytes().to_vec());
        let coinbase_output = TxOutput::new(reward, miner_address);
        Self::new(vec![coinbase_input], vec![coinbase_output], 0)
    }

    /// Transaction id: SHA-256 over inputs, outputs and lock time.
    ///
    /// Signature scripts of regular inputs are excluded so that signing a
    /// transaction does not change its id. Coinbase scripts are included
    /// because they carry the block height and make coinbase ids unique.
    pub fn calculate_id(&self) -> Hash {
        let mut data = Vec::new();

        for input in &self.inputs {
            match &input.previous_output {
                Some(outpoint) => {
                    data.extend_from_slice(outpoint.txid.as_bytes());
                    data.extend_from_slice(&outpoint.vout.to_be_bytes());
                }
                None => data.extend_from_slice(&input.script_sig),
            }
            data.extend_from_slice(&input.sequence.to_be_bytes());
        }

        for output in &self.outputs {
            data.extend_from_slice(&output.value.to_be_bytes());
            data.extend_from_slice(&output.script_pubkey);
            data.extend_from_slice(output.address.as_bytes());
        }

        data.extend_from_slice(&self.lock_time.to_be_bytes());

        hash_to_string(&sha256(&data))
    }

    /// Fee paid by this transaction (inputs minus outputs), computed against a UTXO set.
    pub fn calculate_fee(&self, utxo_set: &HashMap<OutPoint, UTXO>) -> Result<Amount> {
        if self.is_coinbase() {
            return Ok(0);
        }
        let inputs = self.total_input_value(utxo_set)?;
        inputs
            .checked_sub(self.total_output_value())
            .ok_or_else(|| {
                BlockchainError::InvalidTransaction(
                    "Total input value less than total output value".to_string(),
                )
            })
    }

    pub fn is_coinbase(&self) -> bool {
        self.inputs.len() == 1 && self.inputs[0].previous_output.is_none()
    }

    pub fn total_input_value(&self, utxo_set: &HashMap<OutPoint, UTXO>) -> Result<Amount> {
        if self.is_coinbase() {
            return Ok(0);
        }

        let mut total: Amount = 0;
        for outpoint in self
            .inputs
            .iter()
            .filter_map(|i| i.previous_output.as_ref())
        {
            let utxo = utxo_set.get(outpoint).ok_or_else(|| {
                BlockchainError::ValidationError(format!(
                    "UTXO not found for outpoint: {}:{}",
                    outpoint.txid, outpoint.vout
                ))
            })?;
            total = total.checked_add(utxo.output.value).ok_or_else(|| {
                BlockchainError::InvalidTransaction("Input value overflow".to_string())
            })?;
        }
        Ok(total)
    }

    pub fn total_output_value(&self) -> Amount {
        self.outputs
            .iter()
            .fold(0u64, |acc, output| acc.saturating_add(output.value))
    }

    /// Validate the transaction against a UTXO set.
    ///
    /// `spend_height` is the height of the block that would include the transaction.
    pub fn validate(&self, utxo_set: &HashMap<OutPoint, UTXO>, spend_height: u64) -> Result<()> {
        if self.inputs.is_empty() {
            return Err(BlockchainError::InvalidTransaction(
                "Transaction has no inputs".to_string(),
            ));
        }

        if self.outputs.is_empty() {
            return Err(BlockchainError::InvalidTransaction(
                "Transaction has no outputs".to_string(),
            ));
        }

        if self.id != self.calculate_id() {
            return Err(BlockchainError::InvalidTransaction(
                "Invalid transaction ID".to_string(),
            ));
        }

        if self.outputs.iter().any(|output| output.value == 0) {
            return Err(BlockchainError::InvalidTransaction(
                "Output value cannot be zero".to_string(),
            ));
        }

        self.outputs
            .iter()
            .try_fold(0u64, |acc, output| acc.checked_add(output.value))
            .ok_or_else(|| {
                BlockchainError::InvalidTransaction("Output value overflow".to_string())
            })?;

        if self.is_coinbase() {
            return Ok(());
        }

        if self.inputs.iter().any(|i| i.previous_output.is_none()) {
            return Err(BlockchainError::InvalidTransaction(
                "Non-coinbase transaction has an input without a previous output".to_string(),
            ));
        }

        let mut seen = HashSet::new();
        let mut total_input_value: Amount = 0;
        for outpoint in self
            .inputs
            .iter()
            .filter_map(|i| i.previous_output.as_ref())
        {
            if !seen.insert(outpoint) {
                return Err(BlockchainError::InvalidTransaction(format!(
                    "Duplicate input: {}:{}",
                    outpoint.txid, outpoint.vout
                )));
            }

            let utxo = utxo_set.get(outpoint).ok_or_else(|| {
                BlockchainError::InvalidTransaction(format!(
                    "Referenced UTXO not found: {}:{}",
                    outpoint.txid, outpoint.vout
                ))
            })?;

            if utxo.is_coinbase
                && spend_height.saturating_sub(utxo.height) < crate::COINBASE_MATURITY
            {
                return Err(BlockchainError::InvalidTransaction(
                    "Coinbase output not mature enough to spend".to_string(),
                ));
            }

            total_input_value = total_input_value
                .checked_add(utxo.output.value)
                .ok_or_else(|| {
                    BlockchainError::InvalidTransaction("Input value overflow".to_string())
                })?;
        }

        let total_output_value = self.total_output_value();
        if total_input_value < total_output_value {
            return Err(BlockchainError::InvalidTransaction(
                "Total input value less than total output value".to_string(),
            ));
        }

        let fee = total_input_value - total_output_value;
        if fee > total_input_value / 2 {
            return Err(BlockchainError::InvalidTransaction(
                "Transaction fee too high".to_string(),
            ));
        }

        self.verify_input_signatures(utxo_set)
    }

    /// Check that every input carries a valid `signature || public_key` script
    /// whose key matches the address of the output being spent.
    pub fn verify_input_signatures(&self, utxo_set: &HashMap<OutPoint, UTXO>) -> Result<()> {
        if self.is_coinbase() {
            return Ok(());
        }

        for (index, input) in self.inputs.iter().enumerate() {
            let Some(outpoint) = &input.previous_output else {
                continue;
            };
            let utxo = utxo_set.get(outpoint).ok_or_else(|| {
                BlockchainError::InvalidTransaction(format!(
                    "Referenced UTXO not found: {}:{}",
                    outpoint.txid, outpoint.vout
                ))
            })?;

            if input.script_sig.len() != SIGNATURE_LEN + PUBLIC_KEY_LEN {
                return Err(BlockchainError::InvalidSignature);
            }
            let (signature, public_key) = input.script_sig.split_at(SIGNATURE_LEN);

            if public_key_to_address(public_key) != utxo.output.address {
                return Err(BlockchainError::InvalidSignature);
            }

            let sighash = self.signature_hash(index, &utxo.output);
            if !verify_signature(public_key, &sighash, signature)? {
                return Err(BlockchainError::InvalidSignature);
            }
        }

        Ok(())
    }

    /// Digest signed by the owner of `spent_output` for input `input_index`.
    pub fn signature_hash(&self, input_index: usize, spent_output: &TxOutput) -> Vec<u8> {
        let mut data = Vec::new();
        data.extend_from_slice(self.id.as_bytes());
        data.extend_from_slice(&(input_index as u32).to_be_bytes());
        data.extend_from_slice(&spent_output.value.to_be_bytes());
        data.extend_from_slice(spent_output.address.as_bytes());
        sha256(&data)
    }

    /// Sign input `input_index`, which spends `spent_output`, with `keypair`.
    pub fn sign_input(
        &mut self,
        input_index: usize,
        keypair: &KeyPair,
        spent_output: &TxOutput,
    ) -> Result<()> {
        if input_index >= self.inputs.len() {
            return Err(BlockchainError::InvalidTransaction(format!(
                "Input index {input_index} out of range"
            )));
        }
        let sighash = self.signature_hash(input_index, spent_output);
        let signature = keypair.sign(&sighash)?;

        let mut script_sig = Vec::with_capacity(SIGNATURE_LEN + PUBLIC_KEY_LEN);
        script_sig.extend_from_slice(&signature);
        script_sig.extend_from_slice(&keypair.public_key);
        self.inputs[input_index].script_sig = script_sig;
        Ok(())
    }

    /// Attach a whole-transaction signature (independent from per-input scripts).
    pub fn sign(&mut self, private_key: &[u8]) -> Result<()> {
        let message = self.get_signing_data();
        let signature = KeyPair::from_private_key(private_key)?.sign(&message)?;
        self.signature = Some(signature);
        Ok(())
    }

    pub fn verify_signature(&self, public_key: &[u8]) -> Result<bool> {
        match &self.signature {
            Some(signature) => verify_signature(public_key, &self.get_signing_data(), signature),
            None => Ok(false),
        }
    }

    fn get_signing_data(&self) -> Vec<u8> {
        let mut data = Vec::new();
        data.extend_from_slice(self.id.as_bytes());
        data.extend_from_slice(&self.lock_time.to_be_bytes());
        data
    }

    pub fn serialize(&self) -> Result<Vec<u8>> {
        codec::encode(self)
    }

    pub fn deserialize(data: &[u8]) -> Result<Self> {
        codec::decode(data)
    }

    /// Serialized size in bytes.
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
            height: 0,
            is_coinbase: self.is_coinbase(),
        })
    }
}

impl TxInput {
    pub fn new(txid: Hash, vout: u32, script_sig: Vec<u8>) -> Self {
        Self {
            previous_output: Some(OutPoint { txid, vout }),
            script_sig,
            sequence: 0xFFFF_FFFF,
        }
    }

    pub fn coinbase(script_sig: Vec<u8>) -> Self {
        Self {
            previous_output: None,
            script_sig,
            sequence: 0xFFFF_FFFF,
        }
    }
}

impl TxOutput {
    pub fn new(value: Amount, address: Address) -> Self {
        Self {
            value,
            script_pubkey: Vec::new(),
            address,
        }
    }

    /// Outputs below 546 base units are considered dust.
    pub fn is_dust(&self) -> bool {
        self.value < 546
    }
}

impl OutPoint {
    pub fn new(txid: Hash, vout: u32) -> Self {
        Self { txid, vout }
    }
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct TransactionBuilder {
    inputs: Vec<TxInput>,
    outputs: Vec<TxOutput>,
    lock_time: u64,
}

impl TransactionBuilder {
    pub fn new() -> Self {
        Self::default()
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

#[cfg(test)]
pub(crate) mod test_support {
    use super::*;

    /// A spendable, non-coinbase UTXO owned by a fresh key pair.
    pub fn owned_utxo(txid: &str, value: Amount, height: u64) -> (KeyPair, UTXO) {
        let keypair = KeyPair::new().unwrap();
        let utxo = UTXO {
            outpoint: OutPoint::new(txid.to_string(), 0),
            output: TxOutput::new(value, keypair.address()),
            height,
            is_coinbase: false,
        };
        (keypair, utxo)
    }

    /// Build and sign a transaction spending `utxo` into a single output.
    pub fn spend(keypair: &KeyPair, utxo: &UTXO, amount: Amount, to: &str) -> Transaction {
        let mut tx = TransactionBuilder::new()
            .add_input(utxo.outpoint.txid.clone(), utxo.outpoint.vout, vec![])
            .add_output(amount, to.to_string())
            .build();
        tx.sign_input(0, keypair, &utxo.output).unwrap();
        tx
    }
}

#[cfg(test)]
mod tests {
    use super::test_support::{owned_utxo, spend};
    use super::*;

    fn utxo_map(utxos: &[&UTXO]) -> HashMap<OutPoint, UTXO> {
        utxos
            .iter()
            .map(|u| (u.outpoint.clone(), (*u).clone()))
            .collect()
    }

    #[test]
    fn test_transaction_creation() {
        let inputs = vec![TxInput::new("prev_tx_id".to_string(), 0, vec![1, 2, 3])];
        let outputs = vec![TxOutput::new(1000, "address1".to_string())];

        let tx = Transaction::new(inputs, outputs, 0);

        assert_eq!(tx.id.len(), 64);
        assert_eq!(tx.inputs.len(), 1);
        assert_eq!(tx.outputs.len(), 1);
        assert!(!tx.is_coinbase());
    }

    #[test]
    fn test_coinbase_transaction() {
        let tx = Transaction::new_coinbase(5_000_000_000, "miner_address".to_string(), 1);

        assert!(tx.is_coinbase());
        assert_eq!(tx.outputs[0].value, 5_000_000_000);
        assert!(tx.inputs[0].previous_output.is_none());
        assert!(tx.validate(&HashMap::new(), 1).is_ok());

        let other_height = Transaction::new_coinbase(5_000_000_000, "miner_address".to_string(), 2);
        assert_ne!(tx.id, other_height.id);
    }

    #[test]
    fn test_signed_transaction_validation() {
        let (keypair, utxo) = owned_utxo("prev_tx", 2000, 1);
        let utxo_set = utxo_map(&[&utxo]);

        let tx = spend(&keypair, &utxo, 1500, "new_address");

        assert!(tx.validate(&utxo_set, 100).is_ok());
        assert_eq!(tx.calculate_fee(&utxo_set).unwrap(), 500);
    }

    #[test]
    fn test_signing_does_not_change_id() {
        let (keypair, utxo) = owned_utxo("prev_tx", 2000, 1);
        let mut tx = TransactionBuilder::new()
            .add_input(utxo.outpoint.txid.clone(), 0, vec![])
            .add_output(1500, "dest".to_string())
            .build();
        let id_before = tx.id.clone();
        tx.sign_input(0, &keypair, &utxo.output).unwrap();
        assert_eq!(tx.id, id_before);
        assert_eq!(tx.id, tx.calculate_id());
    }

    #[test]
    fn test_unsigned_transaction_rejected() {
        let (_keypair, utxo) = owned_utxo("prev_tx", 2000, 1);
        let utxo_set = utxo_map(&[&utxo]);

        let tx = TransactionBuilder::new()
            .add_input("prev_tx".to_string(), 0, vec![])
            .add_output(1500, "new_address".to_string())
            .build();

        assert!(matches!(
            tx.validate(&utxo_set, 100),
            Err(BlockchainError::InvalidSignature)
        ));
    }

    #[test]
    fn test_wrong_key_rejected() {
        let (_owner, utxo) = owned_utxo("prev_tx", 2000, 1);
        let thief = KeyPair::new().unwrap();
        let utxo_set = utxo_map(&[&utxo]);

        let tx = spend(&thief, &utxo, 1500, "thief_address");
        assert!(matches!(
            tx.validate(&utxo_set, 100),
            Err(BlockchainError::InvalidSignature)
        ));
    }

    #[test]
    fn test_tampered_output_rejected() {
        let (keypair, utxo) = owned_utxo("prev_tx", 2000, 1);
        let utxo_set = utxo_map(&[&utxo]);

        let mut tx = spend(&keypair, &utxo, 1500, "new_address");
        tx.outputs[0].address = "attacker".to_string();
        tx.id = tx.calculate_id();

        assert!(tx.validate(&utxo_set, 100).is_err());
    }

    #[test]
    fn test_duplicate_inputs_rejected() {
        let (keypair, utxo) = owned_utxo("prev_tx", 2000, 1);
        let utxo_set = utxo_map(&[&utxo]);

        let mut tx = TransactionBuilder::new()
            .add_input("prev_tx".to_string(), 0, vec![])
            .add_input("prev_tx".to_string(), 0, vec![])
            .add_output(3000, "new_address".to_string())
            .build();
        tx.sign_input(0, &keypair, &utxo.output).unwrap();
        tx.sign_input(1, &keypair, &utxo.output).unwrap();

        assert!(tx.validate(&utxo_set, 100).is_err());
    }

    #[test]
    fn test_coinbase_maturity() {
        let (keypair, mut utxo) = owned_utxo("coinbase_tx", 2000, 10);
        utxo.is_coinbase = true;
        let utxo_set = utxo_map(&[&utxo]);
        let tx = spend(&keypair, &utxo, 1500, "dest");

        assert!(tx.validate(&utxo_set, 50).is_err());
        assert!(
            tx.validate(&utxo_set, 10 + crate::COINBASE_MATURITY)
                .is_ok()
        );
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
        assert_eq!(tx.total_output_value(), 1500);
    }

    #[test]
    fn test_transaction_serialization() {
        let tx = TransactionBuilder::new()
            .add_input("prev_tx".to_string(), 0, vec![1, 2, 3])
            .add_output(1000, "address1".to_string())
            .build();

        let serialized = tx.serialize().unwrap();
        let deserialized = Transaction::deserialize(&serialized).unwrap();

        assert_eq!(tx, deserialized);
        assert_eq!(tx.size(), serialized.len());
    }

    #[test]
    fn test_insufficient_funds() {
        let (keypair, utxo) = owned_utxo("prev_tx", 1000, 1);
        let utxo_set = utxo_map(&[&utxo]);

        let tx = spend(&keypair, &utxo, 1500, "new_address");

        assert!(tx.validate(&utxo_set, 100).is_err());
        assert!(tx.calculate_fee(&utxo_set).is_err());
    }

    #[test]
    fn test_whole_transaction_signature() {
        let keypair = KeyPair::new().unwrap();
        let mut tx = Transaction::new_coinbase(10, "a".to_string(), 3);
        assert!(!tx.verify_signature(&keypair.public_key).unwrap());
        tx.sign(&keypair.private_key).unwrap();
        assert!(tx.verify_signature(&keypair.public_key).unwrap());
    }
}
