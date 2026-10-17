use crate::error::{BlockchainError, Result};
use crate::utxo::UTXOSet;
use crate::{Amount, Hash, OutPoint, Transaction};
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, HashMap, HashSet};
use std::time::{Duration, SystemTime};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MempoolConfig {
    pub max_size: usize,
    pub max_tx_size: usize,
    /// Minimum fee rate in base units per byte.
    pub min_fee_rate: u64,
    pub max_tx_age: Duration,
    pub max_ancestors: usize,
    pub max_descendants: usize,
}

impl Default for MempoolConfig {
    fn default() -> Self {
        Self {
            max_size: 300_000_000,
            max_tx_size: 100_000,
            min_fee_rate: 1,
            max_tx_age: Duration::from_secs(24 * 60 * 60),
            max_ancestors: 25,
            max_descendants: 25,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MempoolEntry {
    pub transaction: Transaction,
    pub fee: Amount,
    /// Fee rate in base units per byte.
    pub fee_rate: u64,
    pub size: usize,
    pub time_added: SystemTime,
    pub ancestors: HashSet<Hash>,
    pub descendants: HashSet<Hash>,
    /// Chain height when the entry was added.
    pub height: u64,
}

impl MempoolEntry {
    /// Create an entry using the fee recorded on the transaction itself.
    pub fn new(transaction: Transaction, height: u64) -> Self {
        let fee = transaction.fee;
        Self::with_fee(transaction, fee, height)
    }

    /// Create an entry with an explicitly computed fee.
    pub fn with_fee(mut transaction: Transaction, fee: Amount, height: u64) -> Self {
        transaction.fee = fee;
        let size = transaction.size();
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
    /// Fee rate -> transaction ids.
    fee_rate_index: BTreeMap<u64, HashSet<Hash>>,
    /// Outpoints spent by mempool transactions -> spending transaction id.
    spent_outpoints: HashMap<OutPoint, Hash>,
    size_bytes: usize,
}

impl Mempool {
    pub fn new(config: MempoolConfig) -> Self {
        Self {
            config,
            transactions: HashMap::new(),
            fee_rate_index: BTreeMap::new(),
            spent_outpoints: HashMap::new(),
            size_bytes: 0,
        }
    }

    pub fn config(&self) -> &MempoolConfig {
        &self.config
    }

    /// Validate and insert a transaction. `current_height` is the chain tip.
    pub fn add_transaction(
        &mut self,
        transaction: Transaction,
        utxo_set: &UTXOSet,
        current_height: u64,
    ) -> Result<()> {
        if self.transactions.contains_key(&transaction.id) {
            return Err(BlockchainError::ValidationError(
                "Transaction already in mempool".to_string(),
            ));
        }

        self.validate_transaction(&transaction, utxo_set, current_height)?;

        let fee = transaction.calculate_fee(utxo_set.get_all_utxos())?;
        let entry = MempoolEntry::with_fee(transaction, fee, current_height);

        if entry.size > self.config.max_tx_size {
            return Err(BlockchainError::ValidationError(
                "Transaction too large".to_string(),
            ));
        }

        if entry.fee_rate < self.config.min_fee_rate {
            return Err(BlockchainError::ValidationError(
                "Fee rate too low".to_string(),
            ));
        }

        if self.size_bytes + entry.size > self.config.max_size {
            self.evict_transactions();
            if self.size_bytes + entry.size > self.config.max_size {
                return Err(BlockchainError::ValidationError(
                    "Mempool full and cannot evict enough transactions".to_string(),
                ));
            }
        }

        let tx_id = entry.transaction.id.clone();
        for outpoint in entry
            .transaction
            .inputs
            .iter()
            .filter_map(|i| i.previous_output.clone())
        {
            self.spent_outpoints.insert(outpoint, tx_id.clone());
        }
        self.fee_rate_index
            .entry(entry.fee_rate)
            .or_default()
            .insert(tx_id.clone());
        self.size_bytes += entry.size;
        self.transactions.insert(tx_id, entry);

        Ok(())
    }

    pub fn remove_transaction(&mut self, tx_id: &Hash) -> Option<Transaction> {
        let entry = self.transactions.remove(tx_id)?;

        if let Some(tx_set) = self.fee_rate_index.get_mut(&entry.fee_rate) {
            tx_set.remove(tx_id);
            if tx_set.is_empty() {
                self.fee_rate_index.remove(&entry.fee_rate);
            }
        }
        for outpoint in entry
            .transaction
            .inputs
            .iter()
            .filter_map(|i| i.previous_output.as_ref())
        {
            if self.spent_outpoints.get(outpoint) == Some(tx_id) {
                self.spent_outpoints.remove(outpoint);
            }
        }

        self.size_bytes -= entry.size;
        Some(entry.transaction)
    }

    /// Drop transactions whose inputs are no longer unspent (e.g. after a block).
    pub fn remove_invalid(&mut self, utxo_set: &UTXOSet) -> usize {
        let invalid: Vec<Hash> = self
            .transactions
            .iter()
            .filter(|(_, entry)| {
                entry
                    .transaction
                    .inputs
                    .iter()
                    .filter_map(|i| i.previous_output.as_ref())
                    .any(|outpoint| !utxo_set.contains(outpoint))
            })
            .map(|(id, _)| id.clone())
            .collect();

        for id in &invalid {
            self.remove_transaction(id);
        }
        invalid.len()
    }

    pub fn get_transaction(&self, tx_id: &Hash) -> Option<&Transaction> {
        self.transactions.get(tx_id).map(|entry| &entry.transaction)
    }

    pub fn contains(&self, tx_id: &Hash) -> bool {
        self.transactions.contains_key(tx_id)
    }

    fn ids_by_fee_rate_desc(&self) -> impl Iterator<Item = &MempoolEntry> {
        self.fee_rate_index.iter().rev().flat_map(move |(_, ids)| {
            let mut ids: Vec<&Hash> = ids.iter().collect();
            ids.sort();
            ids.into_iter()
                .filter_map(move |id| self.transactions.get(id))
        })
    }

    /// Transactions ordered from the highest to the lowest fee rate.
    pub fn get_transactions_by_fee_rate(&self, max_count: usize) -> Vec<&Transaction> {
        self.ids_by_fee_rate_desc()
            .take(max_count)
            .map(|entry| &entry.transaction)
            .collect()
    }

    /// Highest fee-rate transactions that fit into `max_size` bytes.
    pub fn get_transactions_for_mining(
        &self,
        max_size: usize,
        max_count: usize,
    ) -> Vec<Transaction> {
        let mut selected = Vec::new();
        let mut total_size = 0;

        for entry in self.ids_by_fee_rate_desc() {
            if selected.len() >= max_count {
                break;
            }
            if total_size + entry.size <= max_size {
                selected.push(entry.transaction.clone());
                total_size += entry.size;
            }
        }

        selected
    }

    pub fn cleanup_expired(&mut self) {
        let max_age = self.config.max_tx_age;
        let expired: Vec<Hash> = self
            .transactions
            .iter()
            .filter(|(_, entry)| entry.is_expired(max_age))
            .map(|(tx_id, _)| tx_id.clone())
            .collect();

        for tx_id in expired {
            self.remove_transaction(&tx_id);
        }
    }

    /// Evict lowest fee-rate transactions until the pool is at 75% capacity.
    pub fn evict_transactions(&mut self) {
        let target_size = self.config.max_size * 3 / 4;
        let mut remaining = self.size_bytes;
        let mut to_evict = Vec::new();

        'outer: for ids in self.fee_rate_index.values() {
            for tx_id in ids {
                if remaining <= target_size {
                    break 'outer;
                }
                if let Some(entry) = self.transactions.get(tx_id) {
                    to_evict.push(tx_id.clone());
                    remaining = remaining.saturating_sub(entry.size);
                }
            }
        }

        for tx_id in to_evict {
            self.remove_transaction(&tx_id);
        }
    }

    pub fn validate_transaction(
        &self,
        transaction: &Transaction,
        utxo_set: &UTXOSet,
        current_height: u64,
    ) -> Result<()> {
        if transaction.is_coinbase() {
            return Err(BlockchainError::ValidationError(
                "Coinbase transactions are not accepted into the mempool".to_string(),
            ));
        }

        transaction.validate(utxo_set.get_all_utxos(), current_height + 1)?;

        let conflict = transaction
            .inputs
            .iter()
            .filter_map(|i| i.previous_output.as_ref())
            .any(|outpoint| self.spent_outpoints.contains_key(outpoint));
        if conflict {
            return Err(BlockchainError::ValidationError(
                "Input already spent by mempool transaction".to_string(),
            ));
        }

        Ok(())
    }

    /// Fee rate needed to be included within roughly `target_blocks` blocks.
    pub fn estimate_fee(&self, target_blocks: u32) -> u64 {
        if self.transactions.is_empty() {
            return self.config.min_fee_rate;
        }

        let mut fee_rates: Vec<u64> = self
            .transactions
            .values()
            .map(|entry| entry.fee_rate)
            .collect();
        fee_rates.sort_unstable_by(|a, b| b.cmp(a));

        let index = (fee_rates.len() / target_blocks.max(1) as usize).min(fee_rates.len() - 1);
        fee_rates[index].max(self.config.min_fee_rate)
    }

    pub fn get_stats(&self) -> MempoolStats {
        let fee_rates = || self.transactions.values().map(|entry| entry.fee_rate);
        let count = self.transactions.len();

        MempoolStats {
            transaction_count: count,
            size_bytes: self.size_bytes,
            total_fees: self.transactions.values().map(|entry| entry.fee).sum(),
            avg_fee_rate: if count > 0 {
                fee_rates().sum::<u64>() / count as u64
            } else {
                0
            },
            min_fee_rate: fee_rates().min().unwrap_or(0),
            max_fee_rate: fee_rates().max().unwrap_or(0),
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
        self.spent_outpoints.clear();
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
    use crate::crypto::KeyPair;
    use crate::transaction::test_support::{owned_utxo, spend};
    use crate::{TransactionBuilder, UTXO};

    struct Fixture {
        utxo_set: UTXOSet,
        owners: Vec<(KeyPair, UTXO)>,
    }

    fn fixture(count: usize) -> Fixture {
        let mut utxo_set = UTXOSet::new();
        let owners: Vec<(KeyPair, UTXO)> = (0..count)
            .map(|i| owned_utxo(&format!("prev_tx_{i}"), 10_000, 1))
            .collect();
        for (_, utxo) in &owners {
            utxo_set.add_utxo(utxo.clone());
        }
        Fixture { utxo_set, owners }
    }

    impl Fixture {
        fn spend(&self, index: usize, amount: Amount) -> Transaction {
            let (keypair, utxo) = &self.owners[index];
            spend(keypair, utxo, amount, "address2")
        }
    }

    #[test]
    fn test_mempool_add_transaction() {
        let mut mempool = Mempool::default();
        let fx = fixture(1);
        let transaction = fx.spend(0, 9000);

        mempool
            .add_transaction(transaction.clone(), &fx.utxo_set, 100)
            .unwrap();
        assert_eq!(mempool.size(), 1);
        assert!(mempool.contains(&transaction.id));
        assert_eq!(mempool.get_transaction(&transaction.id).unwrap().fee, 1000);
    }

    #[test]
    fn test_mempool_rejects_invalid_transactions() {
        let mut mempool = Mempool::default();
        let fx = fixture(1);

        let unsigned = TransactionBuilder::new()
            .add_input("prev_tx_0".to_string(), 0, vec![])
            .add_output(9000, "address2".to_string())
            .build();
        assert!(
            mempool
                .add_transaction(unsigned, &fx.utxo_set, 100)
                .is_err()
        );

        let coinbase = Transaction::new_coinbase(50, "miner".to_string(), 1);
        assert!(
            mempool
                .add_transaction(coinbase, &fx.utxo_set, 100)
                .is_err()
        );
        assert!(mempool.is_empty());
    }

    #[test]
    fn test_mempool_remove_transaction() {
        let mut mempool = Mempool::default();
        let fx = fixture(1);
        let transaction = fx.spend(0, 9000);

        mempool
            .add_transaction(transaction.clone(), &fx.utxo_set, 100)
            .unwrap();
        let removed = mempool.remove_transaction(&transaction.id);
        assert!(removed.is_some());
        assert_eq!(mempool.size(), 0);
        assert_eq!(mempool.size_bytes(), 0);
        assert!(!mempool.contains(&transaction.id));

        // The outpoint is free again once the spender is removed.
        mempool
            .add_transaction(transaction, &fx.utxo_set, 100)
            .unwrap();
    }

    #[test]
    fn test_mempool_duplicate_transaction() {
        let mut mempool = Mempool::default();
        let fx = fixture(1);
        let transaction = fx.spend(0, 9000);

        mempool
            .add_transaction(transaction.clone(), &fx.utxo_set, 100)
            .unwrap();
        assert!(
            mempool
                .add_transaction(transaction, &fx.utxo_set, 100)
                .is_err()
        );
    }

    #[test]
    fn test_mempool_double_spend_rejected() {
        let mut mempool = Mempool::default();
        let fx = fixture(1);

        mempool
            .add_transaction(fx.spend(0, 9000), &fx.utxo_set, 100)
            .unwrap();
        let conflicting = fx.spend(0, 8000);
        assert!(
            mempool
                .add_transaction(conflicting, &fx.utxo_set, 100)
                .is_err()
        );
    }

    #[test]
    fn test_mempool_fee_rate_ordering() {
        let mut mempool = Mempool::default();
        let fx = fixture(3);

        let low = fx.spend(0, 9500);
        let high = fx.spend(1, 9000);
        let mid = fx.spend(2, 9250);

        mempool
            .add_transaction(low.clone(), &fx.utxo_set, 100)
            .unwrap();
        mempool
            .add_transaction(high.clone(), &fx.utxo_set, 100)
            .unwrap();
        mempool
            .add_transaction(mid.clone(), &fx.utxo_set, 100)
            .unwrap();

        let ordered: Vec<&str> = mempool
            .get_transactions_by_fee_rate(10)
            .iter()
            .map(|tx| tx.id.as_str())
            .collect();
        assert_eq!(
            ordered,
            vec![high.id.as_str(), mid.id.as_str(), low.id.as_str()]
        );

        let for_mining = mempool.get_transactions_for_mining(1_000_000, 2);
        assert_eq!(for_mining.len(), 2);
        assert_eq!(for_mining[0].id, high.id);
    }

    #[test]
    fn test_mempool_size_limit() {
        let config = MempoolConfig {
            max_size: 10,
            ..Default::default()
        };
        let mut mempool = Mempool::new(config);
        let fx = fixture(1);

        let result = mempool.add_transaction(fx.spend(0, 9000), &fx.utxo_set, 100);
        assert!(result.is_err());
        assert!(mempool.is_empty());
    }

    #[test]
    fn test_mempool_min_fee_rate() {
        let config = MempoolConfig {
            min_fee_rate: 1_000,
            ..Default::default()
        };
        let mut mempool = Mempool::new(config);
        let fx = fixture(1);

        assert!(
            mempool
                .add_transaction(fx.spend(0, 9999), &fx.utxo_set, 100)
                .is_err()
        );
    }

    #[test]
    fn test_mempool_cleanup_expired() {
        let config = MempoolConfig {
            max_tx_age: Duration::from_secs(0),
            ..Default::default()
        };
        let mut mempool = Mempool::new(config);
        let fx = fixture(1);

        mempool
            .add_transaction(fx.spend(0, 9000), &fx.utxo_set, 100)
            .unwrap();
        assert_eq!(mempool.size(), 1);

        std::thread::sleep(Duration::from_millis(5));

        mempool.cleanup_expired();
        assert_eq!(mempool.size(), 0);
    }

    #[test]
    fn test_mempool_remove_invalid() {
        let mut mempool = Mempool::default();
        let mut fx = fixture(2);

        mempool
            .add_transaction(fx.spend(0, 9000), &fx.utxo_set, 100)
            .unwrap();
        mempool
            .add_transaction(fx.spend(1, 9000), &fx.utxo_set, 100)
            .unwrap();

        let spent = fx.owners[0].1.outpoint.clone();
        fx.utxo_set.remove_utxo(&spent);
        assert_eq!(mempool.remove_invalid(&fx.utxo_set), 1);
        assert_eq!(mempool.size(), 1);
    }

    #[test]
    fn test_mempool_fee_estimation() {
        let mempool = Mempool::default();
        assert_eq!(mempool.estimate_fee(6), 1);

        let mut mempool = Mempool::default();
        let fx = fixture(1);
        mempool
            .add_transaction(fx.spend(0, 9000), &fx.utxo_set, 100)
            .unwrap();
        assert!(mempool.estimate_fee(6) >= 1);
        assert!(mempool.estimate_fee(0) >= 1);
    }

    #[test]
    fn test_mempool_stats() {
        let mut mempool = Mempool::default();
        let fx = fixture(1);

        mempool
            .add_transaction(fx.spend(0, 9000), &fx.utxo_set, 100)
            .unwrap();

        let stats = mempool.get_stats();
        assert_eq!(stats.transaction_count, 1);
        assert!(stats.size_bytes > 0);
        assert_eq!(stats.total_fees, 1000);
        assert!(stats.min_fee_rate <= stats.max_fee_rate);
    }
}
