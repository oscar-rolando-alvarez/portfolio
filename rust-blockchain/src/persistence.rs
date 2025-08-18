use crate::error::{BlockchainError, Result};
use crate::utxo::UTXOSet;
use crate::{Block, ChainState, Transaction};
use serde::{Deserialize, Serialize};
use std::path::Path;

const BLOCKS_CF: &str = "blocks";
const TRANSACTIONS_CF: &str = "transactions";
const CHAIN_STATE_CF: &str = "chain_state";
const UTXO_CF: &str = "utxo";
const METADATA_CF: &str = "metadata";

#[derive(Debug)]
pub struct BlockchainDB {
    db: rocksdb::DB,
}

impl BlockchainDB {
    pub fn new<P: AsRef<Path>>(path: P) -> Result<Self> {
        let mut opts = rocksdb::Options::default();
        opts.create_if_missing(true);
        opts.create_missing_column_families(true);

        let cf_descriptors = vec![
            rocksdb::ColumnFamilyDescriptor::new(BLOCKS_CF, rocksdb::Options::default()),
            rocksdb::ColumnFamilyDescriptor::new(TRANSACTIONS_CF, rocksdb::Options::default()),
            rocksdb::ColumnFamilyDescriptor::new(CHAIN_STATE_CF, rocksdb::Options::default()),
            rocksdb::ColumnFamilyDescriptor::new(UTXO_CF, rocksdb::Options::default()),
            rocksdb::ColumnFamilyDescriptor::new(METADATA_CF, rocksdb::Options::default()),
        ];

        let db = rocksdb::DB::open_cf_descriptors(&opts, path, cf_descriptors)
            .map_err(|e| BlockchainError::PersistenceError(e.to_string()))?;

        Ok(Self { db })
    }

    pub fn store_block(&self, block: &Block) -> Result<()> {
        let cf = self.get_cf(BLOCKS_CF)?;
        let key = self.block_key(block.header.height);
        let value = bincode::serialize(block)
            .map_err(|e| BlockchainError::SerializationError(e.to_string()))?;

        self.db
            .put_cf(&cf, key, value)
            .map_err(|e| BlockchainError::PersistenceError(e.to_string()))?;

        // Also store by hash for quick lookups
        let hash_key = self.block_hash_key(&self.calculate_block_hash(block));
        let height_value = block.header.height.to_be_bytes();
        
        self.db
            .put_cf(&cf, hash_key, height_value)
            .map_err(|e| BlockchainError::PersistenceError(e.to_string()))?;

        // Store individual transactions
        self.store_block_transactions(block)?;

        Ok(())
    }

    pub fn load_block(&self, height: u64) -> Result<Block> {
        let cf = self.get_cf(BLOCKS_CF)?;
        let key = self.block_key(height);

        let value = self
            .db
            .get_cf(&cf, key)
            .map_err(|e| BlockchainError::PersistenceError(e.to_string()))?
            .ok_or_else(|| BlockchainError::BlockNotFound(height.to_string()))?;

        bincode::deserialize(&value)
            .map_err(|e| BlockchainError::SerializationError(e.to_string()))
    }

    pub fn load_block_by_hash(&self, hash: &str) -> Result<Block> {
        let cf = self.get_cf(BLOCKS_CF)?;
        let hash_key = self.block_hash_key(hash);

        let height_bytes = self
            .db
            .get_cf(&cf, hash_key)
            .map_err(|e| BlockchainError::PersistenceError(e.to_string()))?
            .ok_or_else(|| BlockchainError::BlockNotFound(hash.to_string()))?;

        let height = u64::from_be_bytes(
            height_bytes
                .try_into()
                .map_err(|_| BlockchainError::PersistenceError("Invalid height data".to_string()))?
        );

        self.load_block(height)
    }

    pub fn load_all_blocks(&self) -> Result<Vec<Block>> {
        let cf = self.get_cf(BLOCKS_CF)?;
        let mut blocks = Vec::new();

        let iter = self.db.iterator_cf(&cf, rocksdb::IteratorMode::Start);
        for item in iter {
            let (key, value) = item
                .map_err(|e| BlockchainError::PersistenceError(e.to_string()))?;

            // Skip hash-based keys
            if key.starts_with(b"hash_") {
                continue;
            }

            let block: Block = bincode::deserialize(&value)
                .map_err(|e| BlockchainError::SerializationError(e.to_string()))?;
            blocks.push(block);
        }

        // Sort by height
        blocks.sort_by_key(|block| block.header.height);
        Ok(blocks)
    }

    pub fn store_transaction(&self, transaction: &Transaction) -> Result<()> {
        let cf = self.get_cf(TRANSACTIONS_CF)?;
        let key = transaction.id.as_bytes();
        let value = bincode::serialize(transaction)
            .map_err(|e| BlockchainError::SerializationError(e.to_string()))?;

        self.db
            .put_cf(&cf, key, value)
            .map_err(|e| BlockchainError::PersistenceError(e.to_string()))?;

        Ok(())
    }

    pub fn load_transaction(&self, tx_id: &str) -> Result<Transaction> {
        let cf = self.get_cf(TRANSACTIONS_CF)?;
        let key = tx_id.as_bytes();

        let value = self
            .db
            .get_cf(&cf, key)
            .map_err(|e| BlockchainError::PersistenceError(e.to_string()))?
            .ok_or_else(|| BlockchainError::TransactionNotFound(tx_id.to_string()))?;

        bincode::deserialize(&value)
            .map_err(|e| BlockchainError::SerializationError(e.to_string()))
    }

    pub fn store_chain_state(&self, state: &ChainState) -> Result<()> {
        let cf = self.get_cf(CHAIN_STATE_CF)?;
        let key = b"current_state";
        let value = bincode::serialize(state)
            .map_err(|e| BlockchainError::SerializationError(e.to_string()))?;

        self.db
            .put_cf(&cf, key, value)
            .map_err(|e| BlockchainError::PersistenceError(e.to_string()))?;

        Ok(())
    }

    pub fn load_chain_state(&self) -> Result<ChainState> {
        let cf = self.get_cf(CHAIN_STATE_CF)?;
        let key = b"current_state";

        let value = self
            .db
            .get_cf(&cf, key)
            .map_err(|e| BlockchainError::PersistenceError(e.to_string()))?
            .ok_or_else(|| BlockchainError::PersistenceError("Chain state not found".to_string()))?;

        bincode::deserialize(&value)
            .map_err(|e| BlockchainError::SerializationError(e.to_string()))
    }

    pub fn store_utxo_set(&self, utxo_set: &UTXOSet) -> Result<()> {
        let cf = self.get_cf(UTXO_CF)?;
        let key = b"utxo_set";
        let value = utxo_set.serialize()?;

        self.db
            .put_cf(&cf, key, value)
            .map_err(|e| BlockchainError::PersistenceError(e.to_string()))?;

        Ok(())
    }

    pub fn load_utxo_set(&self) -> Result<UTXOSet> {
        let cf = self.get_cf(UTXO_CF)?;
        let key = b"utxo_set";

        let value = self
            .db
            .get_cf(&cf, key)
            .map_err(|e| BlockchainError::PersistenceError(e.to_string()))?
            .ok_or_else(|| BlockchainError::PersistenceError("UTXO set not found".to_string()))?;

        UTXOSet::deserialize(&value)
    }

    pub fn store_metadata(&self, key: &str, value: &[u8]) -> Result<()> {
        let cf = self.get_cf(METADATA_CF)?;
        
        self.db
            .put_cf(&cf, key.as_bytes(), value)
            .map_err(|e| BlockchainError::PersistenceError(e.to_string()))?;

        Ok(())
    }

    pub fn load_metadata(&self, key: &str) -> Result<Vec<u8>> {
        let cf = self.get_cf(METADATA_CF)?;

        self.db
            .get_cf(&cf, key.as_bytes())
            .map_err(|e| BlockchainError::PersistenceError(e.to_string()))?
            .ok_or_else(|| BlockchainError::PersistenceError(format!("Metadata key '{}' not found", key)))
    }

    pub fn delete_block(&self, height: u64) -> Result<()> {
        let cf = self.get_cf(BLOCKS_CF)?;
        let key = self.block_key(height);

        // First load the block to get its hash
        if let Ok(block) = self.load_block(height) {
            let hash_key = self.block_hash_key(&self.calculate_block_hash(&block));
            self.db
                .delete_cf(&cf, hash_key)
                .map_err(|e| BlockchainError::PersistenceError(e.to_string()))?;
        }

        self.db
            .delete_cf(&cf, key)
            .map_err(|e| BlockchainError::PersistenceError(e.to_string()))?;

        Ok(())
    }

    pub fn get_block_count(&self) -> Result<u64> {
        let cf = self.get_cf(BLOCKS_CF)?;
        let mut count = 0;

        let iter = self.db.iterator_cf(&cf, rocksdb::IteratorMode::Start);
        for item in iter {
            let (key, _) = item
                .map_err(|e| BlockchainError::PersistenceError(e.to_string()))?;
            
            // Skip hash-based keys
            if !key.starts_with(b"hash_") {
                count += 1;
            }
        }

        Ok(count)
    }

    pub fn compact(&self) -> Result<()> {
        self.db
            .compact_range::<&[u8], &[u8]>(None, None);
        Ok(())
    }

    pub fn backup(&self, backup_path: &str) -> Result<()> {
        // Create a backup engine
        let backup_opts = rocksdb::BackupEngineOptions::default();
        let mut backup_engine = rocksdb::BackupEngine::open(&backup_opts, backup_path)
            .map_err(|e| BlockchainError::PersistenceError(e.to_string()))?;

        backup_engine
            .create_new_backup(&self.db)
            .map_err(|e| BlockchainError::PersistenceError(e.to_string()))?;

        Ok(())
    }

    pub fn restore_from_backup(backup_path: &str, db_path: &str) -> Result<()> {
        let backup_opts = rocksdb::BackupEngineOptions::default();
        let mut backup_engine = rocksdb::BackupEngine::open(&backup_opts, backup_path)
            .map_err(|e| BlockchainError::PersistenceError(e.to_string()))?;

        let restore_opts = rocksdb::RestoreOptions::default();
        backup_engine
            .restore_from_latest_backup(db_path, db_path, &restore_opts)
            .map_err(|e| BlockchainError::PersistenceError(e.to_string()))?;

        Ok(())
    }

    pub fn get_stats(&self) -> Result<DBStats> {
        let mut stats = DBStats::default();
        
        // Count blocks
        if let Ok(cf) = self.get_cf(BLOCKS_CF) {
            let iter = self.db.iterator_cf(&cf, rocksdb::IteratorMode::Start);
            for item in iter {
                if let Ok((key, _)) = item {
                    if !key.starts_with(b"hash_") {
                        stats.block_count += 1;
                    }
                }
            }
        }

        // Count transactions
        if let Ok(cf) = self.get_cf(TRANSACTIONS_CF) {
            let iter = self.db.iterator_cf(&cf, rocksdb::IteratorMode::Start);
            for item in iter {
                if let Ok(_) = item {
                    stats.transaction_count += 1;
                }
            }
        }

        // Get database size (approximate)
        if let Some(size) = self.db.property_value("rocksdb.total-sst-files-size") {
            if let Ok(size) = size.parse::<u64>() {
                stats.database_size = size;
            }
        }

        Ok(stats)
    }

    fn get_cf(&self, name: &str) -> Result<std::sync::Arc<rocksdb::BoundColumnFamily>> {
        self.db
            .cf_handle(name)
            .ok_or_else(|| BlockchainError::PersistenceError(format!("Column family '{}' not found", name)))
    }

    fn block_key(&self, height: u64) -> Vec<u8> {
        format!("block_{:016}", height).into_bytes()
    }

    fn block_hash_key(&self, hash: &str) -> Vec<u8> {
        format!("hash_{}", hash).into_bytes()
    }

    fn store_block_transactions(&self, block: &Block) -> Result<()> {
        for transaction in &block.transactions {
            self.store_transaction(transaction)?;
        }
        Ok(())
    }

    fn calculate_block_hash(&self, block: &Block) -> String {
        use crate::crypto::{sha256, hash_to_string};
        let data = bincode::serialize(block).unwrap_or_default();
        hash_to_string(&sha256(&data))
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct DBStats {
    pub block_count: u64,
    pub transaction_count: u64,
    pub database_size: u64,
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{BlockHeader, Transaction};
    use chrono::Utc;
    use tempfile::TempDir;

    fn create_test_block() -> Block {
        let tx = Transaction::new_coinbase(5000000000, "test_address".to_string(), 1);
        
        Block {
            header: BlockHeader {
                version: 1,
                previous_hash: "prev_hash".to_string(),
                merkle_root: "merkle_root".to_string(),
                timestamp: Utc::now(),
                difficulty: 1,
                nonce: 12345,
                height: 1,
            },
            transactions: vec![tx],
        }
    }

    #[test]
    fn test_store_and_load_block() {
        let temp_dir = TempDir::new().unwrap();
        let db_path = temp_dir.path().join("test.db");
        
        let db = BlockchainDB::new(&db_path).unwrap();
        let block = create_test_block();
        
        db.store_block(&block).unwrap();
        let loaded_block = db.load_block(1).unwrap();
        
        assert_eq!(block.header.height, loaded_block.header.height);
        assert_eq!(block.header.nonce, loaded_block.header.nonce);
        assert_eq!(block.transactions.len(), loaded_block.transactions.len());
    }

    #[test]
    fn test_store_and_load_chain_state() {
        let temp_dir = TempDir::new().unwrap();
        let db_path = temp_dir.path().join("test.db");
        
        let db = BlockchainDB::new(&db_path).unwrap();
        let state = ChainState {
            height: 100,
            difficulty: 5,
            total_work: 1000,
            best_block_hash: "best_hash".to_string(),
            ..Default::default()
        };
        
        db.store_chain_state(&state).unwrap();
        let loaded_state = db.load_chain_state().unwrap();
        
        assert_eq!(state.height, loaded_state.height);
        assert_eq!(state.difficulty, loaded_state.difficulty);
        assert_eq!(state.best_block_hash, loaded_state.best_block_hash);
    }

    #[test]
    fn test_store_and_load_transaction() {
        let temp_dir = TempDir::new().unwrap();
        let db_path = temp_dir.path().join("test.db");
        
        let db = BlockchainDB::new(&db_path).unwrap();
        let tx = Transaction::new_coinbase(5000000000, "test_address".to_string(), 1);
        
        db.store_transaction(&tx).unwrap();
        let loaded_tx = db.load_transaction(&tx.id).unwrap();
        
        assert_eq!(tx.id, loaded_tx.id);
        assert_eq!(tx.outputs.len(), loaded_tx.outputs.len());
    }

    #[test]
    fn test_load_all_blocks() {
        let temp_dir = TempDir::new().unwrap();
        let db_path = temp_dir.path().join("test.db");
        
        let db = BlockchainDB::new(&db_path).unwrap();
        
        // Store multiple blocks
        for i in 0..5 {
            let mut block = create_test_block();
            block.header.height = i;
            db.store_block(&block).unwrap();
        }
        
        let blocks = db.load_all_blocks().unwrap();
        assert_eq!(blocks.len(), 5);
        
        // Should be sorted by height
        for (i, block) in blocks.iter().enumerate() {
            assert_eq!(block.header.height, i as u64);
        }
    }

    #[test]
    fn test_metadata_storage() {
        let temp_dir = TempDir::new().unwrap();
        let db_path = temp_dir.path().join("test.db");
        
        let db = BlockchainDB::new(&db_path).unwrap();
        let key = "test_key";
        let value = b"test_value";
        
        db.store_metadata(key, value).unwrap();
        let loaded_value = db.load_metadata(key).unwrap();
        
        assert_eq!(value, loaded_value.as_slice());
    }

    #[test]
    fn test_block_deletion() {
        let temp_dir = TempDir::new().unwrap();
        let db_path = temp_dir.path().join("test.db");
        
        let db = BlockchainDB::new(&db_path).unwrap();
        let block = create_test_block();
        
        db.store_block(&block).unwrap();
        assert!(db.load_block(1).is_ok());
        
        db.delete_block(1).unwrap();
        assert!(db.load_block(1).is_err());
    }

    #[test]
    fn test_database_stats() {
        let temp_dir = TempDir::new().unwrap();
        let db_path = temp_dir.path().join("test.db");
        
        let db = BlockchainDB::new(&db_path).unwrap();
        
        // Store some test data
        let block = create_test_block();
        db.store_block(&block).unwrap();
        
        let stats = db.get_stats().unwrap();
        assert_eq!(stats.block_count, 1);
        assert_eq!(stats.transaction_count, 1); // Coinbase transaction
    }
}