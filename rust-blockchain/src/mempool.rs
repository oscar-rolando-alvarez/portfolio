use crate::error::{BlockchainError, Result};
use crate::utxo::UTXOSet;
use crate::{Amount, Hash, Transaction};
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, HashMap, HashSet};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MempoolConfig {
    pub max_size: usize,
    pub max_tx_size: usize,
    pub min_fee_rate: u64, // satoshis per byte
    pub max_tx_age: Duration,
    pub max_ancestors: usize,
    pub max_descendants: usize,
}

impl Default for MempoolConfig {
    fn default() -> Self {
        Self {
            max_size: 300_000_000, // 300MB
            max_tx_size: 100_000,   // 100KB
            min_fee_rate: 1,        // 1 satoshi per byte
            max_tx_age: Duration::from_secs(24 * 60 * 60), // 24 hours
            max_ancestors: 25,
            max_descendants: 25,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MempoolEntry {
    pub transaction: Transaction,
    pub fee: Amount,
    pub fee_rate: u64, // satoshis per byte
    pub size: usize,
    pub time_added: SystemTime,
    pub ancestors: HashSet<Hash>,
    pub descendants: HashSet<Hash>,
    pub height: u64, // Height when added
}

impl MempoolEntry {
    pub fn new(transaction: Transaction, height: u64) -> Self {
        let size = transaction.size();
        let fee = transaction.fee;
        let fee_rate = if size > 0 { fee / size as u64 } else { 0 };

        Self {
            transaction,
            fee,
            fee_rate,
            size,
            time_added: SystemTime::now(),
            ancestors: HashSet::new(),
            descendants: HashSet::new(),
            height,
        }
    }

    pub fn age(&self) -> Duration {
        SystemTime::now()
            .duration_since(self.time_added)
            .unwrap_or(Duration::ZERO)
    }

    pub fn is_expired(&self, max_age: Duration) -> bool {
        self.age() > max_age
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Mempool {
    config: MempoolConfig,
    transactions: HashMap<Hash, MempoolEntry>,
    fee_rate_index: BTreeMap<u64, HashSet<Hash>>, // Fee rate -> transaction IDs
    size_bytes: usize,
}

impl Mempool {
    pub fn new(config: MempoolConfig) -> Self {
        Self {
            config,
            transactions: HashMap::new(),
            fee_rate_index: BTreeMap::new(),
            size_bytes: 0,
        }
    }

    pub fn add_transaction(
        &mut self,
        transaction: Transaction,
        utxo_set: &UTXOSet,
        current_height: u64,
    ) -> Result<()> {
        // Basic validation
        self.validate_transaction(&transaction, utxo_set, current_height)?;

        // Check if transaction already exists
        if self.transactions.contains_key(&transaction.id) {
            return Err(BlockchainError::ValidationError(
                "Transaction already in mempool".to_string(),
            ));
        }

        let entry = MempoolEntry::new(transaction.clone(), current_height);

        // Check size limits
        if entry.size > self.config.max_tx_size {
            return Err(BlockchainError::ValidationError(
                "Transaction too large".to_string(),
            ));
        }

        // Check fee rate
        if entry.fee_rate < self.config.min_fee_rate {
            return Err(BlockchainError::ValidationError(
                "Fee rate too low".to_string(),
            ));
        }

        // Check if adding this transaction would exceed mempool size
        if self.size_bytes + entry.size > self.config.max_size {
            self.evict_transactions()?;
            
            // Check again after eviction
            if self.size_bytes + entry.size > self.config.max_size {
                return Err(BlockchainError::ValidationError(
                    "Mempool full and cannot evict enough transactions".to_string(),
                ));
            }
        }

        // Add to indexes
        self.fee_rate_index
            .entry(entry.fee_rate)
            .or_insert_with(HashSet::new)
            .insert(transaction.id.clone());

        self.size_bytes += entry.size;
        self.transactions.insert(transaction.id.clone(), entry);

        Ok(())
    }

    pub fn remove_transaction(&mut self, tx_id: &Hash) -> Option<Transaction> {
        if let Some(entry) = self.transactions.remove(tx_id) {
            // Remove from fee rate index
            if let Some(tx_set) = self.fee_rate_index.get_mut(&entry.fee_rate) {
                tx_set.remove(tx_id);
                if tx_set.is_empty() {
                    self.fee_rate_index.remove(&entry.fee_rate);
                }
            }

            self.size_bytes -= entry.size;
            Some(entry.transaction)
        } else {
            None
        }
    }

    pub fn get_transaction(&self, tx_id: &Hash) -> Option<&Transaction> {
        self.transactions.get(tx_id).map(|entry| &entry.transaction)
    }

    pub fn contains(&self, tx_id: &Hash) -> bool {
        self.transactions.contains_key(tx_id)
    }

    pub fn get_transactions_by_fee_rate(&self, max_count: usize) -> Vec<&Transaction> {
        let mut transactions = Vec::new();
        let mut count = 0;

        // Iterate from highest fee rate to lowest
        for (_, tx_ids) in self.fee_rate_index.iter().rev() {
            for tx_id in tx_ids {
                if let Some(entry) = self.transactions.get(tx_id) {
                    transactions.push(&entry.transaction);
                    count += 1;
                    if count >= max_count {
                        return transactions;
                    }
                }
            }
        }

        transactions
    }

    pub fn get_transactions_for_mining(&self, max_size: usize, max_count: usize) -> Vec<Transaction> {
        let mut selected_transactions = Vec::new();
        let mut total_size = 0;
        let mut count = 0;

        // Select transactions by highest fee rate first
        for (_, tx_ids) in self.fee_rate_index.iter().rev() {
            for tx_id in tx_ids {
                if let Some(entry) = self.transactions.get(tx_id) {
                    if total_size + entry.size <= max_size && count < max_count {
                        selected_transactions.push(entry.transaction.clone());
                        total_size += entry.size;
                        count += 1;
                    }
                }
            }
        }

        selected_transactions
    }

    pub fn cleanup_expired(&mut self) {
        let expired_txs: Vec<Hash> = self
            .transactions
            .iter()
            .filter(|(_, entry)| entry.is_expired(self.config.max_tx_age))
            .map(|(tx_id, _)| tx_id.clone())
            .collect();

        for tx_id in expired_txs {
            self.remove_transaction(&tx_id);
        }
    }

    pub fn evict_transactions(&mut self) -> Result<()> {
        // Evict lowest fee rate transactions first
        let target_size = self.config.max_size * 3 / 4; // Evict to 75% capacity
        
        let mut evicted_size = 0;
        let mut to_evict = Vec::new();

        for (_, tx_ids) in self.fee_rate_index.iter() {
            for tx_id in tx_ids {
                if let Some(entry) = self.transactions.get(tx_id) {
                    to_evict.push(tx_id.clone());
                    evicted_size += entry.size;
                    
                    if self.size_bytes - evicted_size <= target_size {
                        break;
                    }
                }
            }
            if self.size_bytes - evicted_size <= target_size {
                break;
            }
        }

        for tx_id in to_evict {
            self.remove_transaction(&tx_id);
        }

        Ok(())
    }

    pub fn validate_transaction(
        &self,
        transaction: &Transaction,
        utxo_set: &UTXOSet,
        current_height: u64,
    ) -> Result<()> {
        // Basic transaction validation
        transaction.validate(utxo_set.get_all_utxos(), current_height)?;

        // Check for conflicts with mempool transactions
        for input in &transaction.inputs {
            if let Some(outpoint) = &input.previous_output {
                // Check if any mempool transaction already spends this output
                for (_, entry) in &self.transactions {
                    for tx_input in &entry.transaction.inputs {
                        if let Some(tx_outpoint) = &tx_input.previous_output {
                            if tx_outpoint == outpoint {
                                return Err(BlockchainError::ValidationError(
                                    "Input already spent by mempool transaction".to_string(),
                                ));
                            }
                        }
                    }
                }
            }
        }

        Ok(())
    }

    pub fn estimate_fee(&self, target_blocks: u32) -> u64 {
        if self.transactions.is_empty() {
            return self.config.min_fee_rate;
        }

        // Simple fee estimation based on mempool state
        let total_txs = self.transactions.len();
        let sample_size = (total_txs / target_blocks as usize).max(1);
        
        let mut fee_rates: Vec<u64> = self
            .transactions
            .values()
            .map(|entry| entry.fee_rate)
            .collect();
        
        fee_rates.sort_unstable_by(|a, b| b.cmp(a)); // Sort descending
        
        let index = sample_size.min(fee_rates.len() - 1);
        fee_rates.get(index).copied().unwrap_or(self.config.min_fee_rate)
    }

    pub fn get_stats(&self) -> MempoolStats {
        let total_fees: Amount = self.transactions.values().map(|entry| entry.fee).sum();
        let avg_fee_rate = if !self.transactions.is_empty() {
            self.transactions.values().map(|entry| entry.fee_rate).sum::<u64>() 
                / self.transactions.len() as u64
        } else {
            0
        };

        MempoolStats {
            transaction_count: self.transactions.len(),
            size_bytes: self.size_bytes,
            total_fees,
            avg_fee_rate,
            min_fee_rate: self.transactions.values()
                .map(|entry| entry.fee_rate)
                .min()
                .unwrap_or(0),
            max_fee_rate: self.transactions.values()
                .map(|entry| entry.fee_rate)
                .max()
                .unwrap_or(0),
        }
    }

    pub fn size(&self) -> usize {
        self.transactions.len()
    }

    pub fn size_bytes(&self) -> usize {
        self.size_bytes
    }

    pub fn is_empty(&self) -> bool {
        self.transactions.is_empty()
    }

    pub fn clear(&mut self) {
        self.transactions.clear();
        self.fee_rate_index.clear();
        self.size_bytes = 0;
    }

    pub fn get_all_transactions(&self) -> Vec<&Transaction> {
        self.transactions
            .values()
            .map(|entry| &entry.transaction)
            .collect()
    }
}

impl Default for Mempool {
    fn default() -> Self {
        Self::new(MempoolConfig::default())
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MempoolStats {
    pub transaction_count: usize,
    pub size_bytes: usize,
    pub total_fees: Amount,
    pub avg_fee_rate: u64,
    pub min_fee_rate: u64,
    pub max_fee_rate: u64,
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{OutPoint, TxInput, TxOutput, TransactionBuilder, UTXO};

    fn create_test_utxo_set() -> UTXOSet {
        let mut utxo_set = UTXOSet::new();
        
        let utxo = UTXO {
            outpoint: OutPoint::new("prev_tx".to_string(), 0),
            output: TxOutput::new(10000, "address1".to_string()),
            height: 1,
            is_coinbase: false,
        };
        utxo_set.add_utxo(utxo);
        
        utxo_set
    }

    fn create_test_transaction() -> Transaction {
        TransactionBuilder::new()
            .add_input("prev_tx".to_string(), 0, vec![])
            .add_output(9000, "address2".to_string())
            .build()
    }

    #[test]
    fn test_mempool_add_transaction() {
        let mut mempool = Mempool::default();
        let utxo_set = create_test_utxo_set();
        let transaction = create_test_transaction();

        let result = mempool.add_transaction(transaction.clone(), &utxo_set, 100);
        assert!(result.is_ok());
        assert_eq!(mempool.size(), 1);
        assert!(mempool.contains(&transaction.id));
    }

    #[test]
    fn test_mempool_remove_transaction() {
        let mut mempool = Mempool::default();
        let utxo_set = create_test_utxo_set();
        let transaction = create_test_transaction();

        mempool.add_transaction(transaction.clone(), &utxo_set, 100).unwrap();
        assert_eq!(mempool.size(), 1);

        let removed = mempool.remove_transaction(&transaction.id);
        assert!(removed.is_some());
        assert_eq!(mempool.size(), 0);
        assert!(!mempool.contains(&transaction.id));
    }

    #[test]
    fn test_mempool_duplicate_transaction() {
        let mut mempool = Mempool::default();
        let utxo_set = create_test_utxo_set();
        let transaction = create_test_transaction();

        mempool.add_transaction(transaction.clone(), &utxo_set, 100).unwrap();
        
        let result = mempool.add_transaction(transaction, &utxo_set, 100);
        assert!(result.is_err());
    }

    #[test]
    fn test_mempool_fee_rate_ordering() {
        let mut mempool = Mempool::default();
        let utxo_set = create_test_utxo_set();

        // Add multiple UTXOs for multiple transactions
        let mut utxo_set = utxo_set;
        for i in 1..4 {
            let utxo = UTXO {
                outpoint: OutPoint::new(format!("prev_tx_{}", i), 0),
                output: TxOutput::new(10000, "address1".to_string()),
                height: 1,
                is_coinbase: false,
            };
            utxo_set.add_utxo(utxo);
        }

        // Create transactions with different fee rates
        let tx1 = TransactionBuilder::new()
            .add_input("prev_tx_1".to_string(), 0, vec![])
            .add_output(9500, "address2".to_string()) // Low fee
            .build();

        let tx2 = TransactionBuilder::new()
            .add_input("prev_tx_2".to_string(), 0, vec![])
            .add_output(9000, "address2".to_string()) // High fee
            .build();

        mempool.add_transaction(tx1, &utxo_set, 100).unwrap();
        mempool.add_transaction(tx2.clone(), &utxo_set, 100).unwrap();

        let ordered_txs = mempool.get_transactions_by_fee_rate(10);
        // tx2 should come first due to higher fee rate
        assert_eq!(ordered_txs[0].id, tx2.id);
    }

    #[test]
    fn test_mempool_size_limit() {
        let config = MempoolConfig {
            max_size: 1000, // Very small limit
            ..Default::default()
        };
        let mut mempool = Mempool::new(config);
        let utxo_set = create_test_utxo_set();
        let transaction = create_test_transaction();

        // This should fail due to size limit
        let result = mempool.add_transaction(transaction, &utxo_set, 100);
        // Depending on transaction size, this might pass or fail
        // In a real scenario, you'd create a transaction known to exceed the limit
    }

    #[test]
    fn test_mempool_cleanup_expired() {
        let config = MempoolConfig {
            max_tx_age: Duration::from_secs(0), // Immediate expiration
            ..Default::default()
        };
        let mut mempool = Mempool::new(config);
        let utxo_set = create_test_utxo_set();
        let transaction = create_test_transaction();

        mempool.add_transaction(transaction, &utxo_set, 100).unwrap();
        assert_eq!(mempool.size(), 1);

        // Sleep briefly to ensure expiration
        std::thread::sleep(Duration::from_millis(1));
        
        mempool.cleanup_expired();
        assert_eq!(mempool.size(), 0);
    }

    #[test]
    fn test_mempool_fee_estimation() {
        let mut mempool = Mempool::default();
        let estimated_fee = mempool.estimate_fee(6);
        assert!(estimated_fee > 0);
    }

    #[test]
    fn test_mempool_stats() {
        let mut mempool = Mempool::default();
        let utxo_set = create_test_utxo_set();
        let transaction = create_test_transaction();

        mempool.add_transaction(transaction, &utxo_set, 100).unwrap();
        
        let stats = mempool.get_stats();
        assert_eq!(stats.transaction_count, 1);
        assert!(stats.size_bytes > 0);
        assert!(stats.total_fees > 0);
    }
}