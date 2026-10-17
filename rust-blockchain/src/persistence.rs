//! Embedded, pure-Rust persistence backed by `redb`.

use crate::codec;
use crate::error::{BlockchainError, Result};
use crate::utxo::UTXOSet;
use crate::{Block, ChainState, Transaction};
use redb::{
    Database, ReadableDatabase, ReadableTable, ReadableTableMetadata, TableDefinition, TableHandle,
};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

/// Block height -> encoded block.
const BLOCKS: TableDefinition<u64, &[u8]> = TableDefinition::new("blocks");
/// Block hash -> block height.
const BLOCK_HASHES: TableDefinition<&str, u64> = TableDefinition::new("block_hashes");
/// Transaction id -> encoded transaction.
const TRANSACTIONS: TableDefinition<&str, &[u8]> = TableDefinition::new("transactions");
/// Singleton key/value entries (chain state, UTXO set).
const CHAIN_STATE: TableDefinition<&str, &[u8]> = TableDefinition::new("chain_state");
/// Free-form metadata.
const METADATA: TableDefinition<&str, &[u8]> = TableDefinition::new("metadata");

const CHAIN_STATE_KEY: &str = "current_state";
const UTXO_SET_KEY: &str = "utxo_set";

fn db_err(e: impl std::fmt::Display) -> BlockchainError {
    BlockchainError::PersistenceError(e.to_string())
}

#[derive(Debug)]
pub struct BlockchainDB {
    db: Database,
    path: PathBuf,
}

impl BlockchainDB {
    /// Open (or create) the database file at `path`.
    pub fn new<P: AsRef<Path>>(path: P) -> Result<Self> {
        let path = path.as_ref().to_path_buf();
        if let Some(parent) = path.parent().filter(|p| !p.as_os_str().is_empty()) {
            std::fs::create_dir_all(parent)?;
        }
        let db = Database::create(&path).map_err(db_err)?;

        // Make sure every table exists so read transactions never fail on a fresh file.
        let txn = db.begin_write().map_err(db_err)?;
        txn.open_table(BLOCKS).map_err(db_err)?;
        txn.open_table(BLOCK_HASHES).map_err(db_err)?;
        txn.open_table(TRANSACTIONS).map_err(db_err)?;
        txn.open_table(CHAIN_STATE).map_err(db_err)?;
        txn.open_table(METADATA).map_err(db_err)?;
        txn.commit().map_err(db_err)?;

        Ok(Self { db, path })
    }

    pub fn path(&self) -> &Path {
        &self.path
    }

    fn put(&self, table: TableDefinition<&str, &[u8]>, key: &str, value: &[u8]) -> Result<()> {
        let txn = self.db.begin_write().map_err(db_err)?;
        {
            let mut t = txn.open_table(table).map_err(db_err)?;
            t.insert(key, value).map_err(db_err)?;
        }
        txn.commit().map_err(db_err)
    }

    fn get(&self, table: TableDefinition<&str, &[u8]>, key: &str) -> Result<Option<Vec<u8>>> {
        let txn = self.db.begin_read().map_err(db_err)?;
        let t = txn.open_table(table).map_err(db_err)?;
        Ok(t.get(key).map_err(db_err)?.map(|v| v.value().to_vec()))
    }

    /// Store a block, its hash index and all of its transactions atomically.
    pub fn store_block(&self, block: &Block) -> Result<()> {
        let encoded = codec::encode(block)?;
        let height = block.header.height;
        let hash = block.hash();

        let txn = self.db.begin_write().map_err(db_err)?;
        {
            let mut blocks = txn.open_table(BLOCKS).map_err(db_err)?;
            blocks.insert(height, encoded.as_slice()).map_err(db_err)?;

            let mut hashes = txn.open_table(BLOCK_HASHES).map_err(db_err)?;
            hashes.insert(hash.as_str(), height).map_err(db_err)?;

            let mut transactions = txn.open_table(TRANSACTIONS).map_err(db_err)?;
            for tx in &block.transactions {
                let tx_bytes = codec::encode(tx)?;
                transactions
                    .insert(tx.id.as_str(), tx_bytes.as_slice())
                    .map_err(db_err)?;
            }
        }
        txn.commit().map_err(db_err)
    }

    pub fn load_block(&self, height: u64) -> Result<Block> {
        let txn = self.db.begin_read().map_err(db_err)?;
        let blocks = txn.open_table(BLOCKS).map_err(db_err)?;
        let value = blocks
            .get(height)
            .map_err(db_err)?
            .ok_or_else(|| BlockchainError::BlockNotFound(height.to_string()))?;
        codec::decode(value.value())
    }

    pub fn load_block_by_hash(&self, hash: &str) -> Result<Block> {
        let height = {
            let txn = self.db.begin_read().map_err(db_err)?;
            let hashes = txn.open_table(BLOCK_HASHES).map_err(db_err)?;
            hashes
                .get(hash)
                .map_err(db_err)?
                .ok_or_else(|| BlockchainError::BlockNotFound(hash.to_string()))?
                .value()
        };
        self.load_block(height)
    }

    /// All blocks ordered by height.
    pub fn load_all_blocks(&self) -> Result<Vec<Block>> {
        let txn = self.db.begin_read().map_err(db_err)?;
        let blocks = txn.open_table(BLOCKS).map_err(db_err)?;
        blocks
            .iter()
            .map_err(db_err)?
            .map(|entry| {
                let (_, value) = entry.map_err(db_err)?;
                codec::decode(value.value())
            })
            .collect()
    }

    pub fn store_transaction(&self, transaction: &Transaction) -> Result<()> {
        self.put(TRANSACTIONS, &transaction.id, &codec::encode(transaction)?)
    }

    pub fn load_transaction(&self, tx_id: &str) -> Result<Transaction> {
        let bytes = self
            .get(TRANSACTIONS, tx_id)?
            .ok_or_else(|| BlockchainError::TransactionNotFound(tx_id.to_string()))?;
        codec::decode(&bytes)
    }

    pub fn store_chain_state(&self, state: &ChainState) -> Result<()> {
        self.put(CHAIN_STATE, CHAIN_STATE_KEY, &codec::encode(state)?)
    }

    pub fn load_chain_state(&self) -> Result<ChainState> {
        let bytes = self.get(CHAIN_STATE, CHAIN_STATE_KEY)?.ok_or_else(|| {
            BlockchainError::PersistenceError("Chain state not found".to_string())
        })?;
        codec::decode(&bytes)
    }

    pub fn store_utxo_set(&self, utxo_set: &UTXOSet) -> Result<()> {
        self.put(CHAIN_STATE, UTXO_SET_KEY, &utxo_set.serialize()?)
    }

    pub fn load_utxo_set(&self) -> Result<UTXOSet> {
        let bytes = self
            .get(CHAIN_STATE, UTXO_SET_KEY)?
            .ok_or_else(|| BlockchainError::PersistenceError("UTXO set not found".to_string()))?;
        UTXOSet::deserialize(&bytes)
    }

    /// Persist a block together with the resulting chain state and UTXO set
    /// in a single atomic transaction.
    pub fn commit_block(
        &self,
        block: &Block,
        state: &ChainState,
        utxo_set: &UTXOSet,
    ) -> Result<()> {
        let block_bytes = codec::encode(block)?;
        let state_bytes = codec::encode(state)?;
        let utxo_bytes = utxo_set.serialize()?;
        let hash = block.hash();

        let txn = self.db.begin_write().map_err(db_err)?;
        {
            let mut blocks = txn.open_table(BLOCKS).map_err(db_err)?;
            blocks
                .insert(block.header.height, block_bytes.as_slice())
                .map_err(db_err)?;

            let mut hashes = txn.open_table(BLOCK_HASHES).map_err(db_err)?;
            hashes
                .insert(hash.as_str(), block.header.height)
                .map_err(db_err)?;

            let mut transactions = txn.open_table(TRANSACTIONS).map_err(db_err)?;
            for tx in &block.transactions {
                let tx_bytes = codec::encode(tx)?;
                transactions
                    .insert(tx.id.as_str(), tx_bytes.as_slice())
                    .map_err(db_err)?;
            }

            let mut chain = txn.open_table(CHAIN_STATE).map_err(db_err)?;
            chain
                .insert(CHAIN_STATE_KEY, state_bytes.as_slice())
                .map_err(db_err)?;
            chain
                .insert(UTXO_SET_KEY, utxo_bytes.as_slice())
                .map_err(db_err)?;
        }
        txn.commit().map_err(db_err)
    }

    pub fn store_metadata(&self, key: &str, value: &[u8]) -> Result<()> {
        self.put(METADATA, key, value)
    }

    pub fn load_metadata(&self, key: &str) -> Result<Vec<u8>> {
        self.get(METADATA, key)?.ok_or_else(|| {
            BlockchainError::PersistenceError(format!("Metadata key '{key}' not found"))
        })
    }

    pub fn delete_block(&self, height: u64) -> Result<()> {
        let txn = self.db.begin_write().map_err(db_err)?;
        {
            let mut blocks = txn.open_table(BLOCKS).map_err(db_err)?;
            let removed = blocks.remove(height).map_err(db_err)?;
            if let Some(bytes) = removed {
                let block: Block = codec::decode(bytes.value())?;
                let mut hashes = txn.open_table(BLOCK_HASHES).map_err(db_err)?;
                hashes.remove(block.hash().as_str()).map_err(db_err)?;
            }
        }
        txn.commit().map_err(db_err)
    }

    pub fn get_block_count(&self) -> Result<u64> {
        let txn = self.db.begin_read().map_err(db_err)?;
        let blocks = txn.open_table(BLOCKS).map_err(db_err)?;
        blocks.len().map_err(db_err)
    }

    /// Reclaim free space in the database file.
    pub fn compact(&mut self) -> Result<()> {
        self.db.compact().map_err(db_err)?;
        Ok(())
    }

    /// Write a consistent snapshot of every table into a new database file.
    pub fn backup<P: AsRef<Path>>(&self, backup_path: P) -> Result<()> {
        let backup = BlockchainDB::new(backup_path)?;
        let src = self.db.begin_read().map_err(db_err)?;
        let dst = backup.db.begin_write().map_err(db_err)?;

        {
            let from = src.open_table(BLOCKS).map_err(db_err)?;
            let mut to = dst.open_table(BLOCKS).map_err(db_err)?;
            for entry in from.iter().map_err(db_err)? {
                let (k, v) = entry.map_err(db_err)?;
                to.insert(k.value(), v.value()).map_err(db_err)?;
            }

            let from = src.open_table(BLOCK_HASHES).map_err(db_err)?;
            let mut to = dst.open_table(BLOCK_HASHES).map_err(db_err)?;
            for entry in from.iter().map_err(db_err)? {
                let (k, v) = entry.map_err(db_err)?;
                to.insert(k.value(), v.value()).map_err(db_err)?;
            }

            for table in [TRANSACTIONS, CHAIN_STATE, METADATA] {
                let from = src.open_table(table).map_err(db_err)?;
                let mut to = dst.open_table(table).map_err(db_err)?;
                for entry in from.iter().map_err(db_err)? {
                    let (k, v) = entry.map_err(db_err)?;
                    to.insert(k.value(), v.value()).map_err(db_err)?;
                }
            }
        }

        dst.commit().map_err(db_err)
    }

    /// Replace the database at `db_path` with a backup file. The target
    /// database must not be open.
    pub fn restore_from_backup<P: AsRef<Path>, Q: AsRef<Path>>(
        backup_path: P,
        db_path: Q,
    ) -> Result<()> {
        std::fs::copy(backup_path, db_path)?;
        Ok(())
    }

    pub fn get_stats(&self) -> Result<DBStats> {
        let txn = self.db.begin_read().map_err(db_err)?;
        let block_count = txn
            .open_table(BLOCKS)
            .map_err(db_err)?
            .len()
            .map_err(db_err)?;
        let transaction_count = txn
            .open_table(TRANSACTIONS)
            .map_err(db_err)?
            .len()
            .map_err(db_err)?;
        let database_size = std::fs::metadata(&self.path).map(|m| m.len()).unwrap_or(0);

        Ok(DBStats {
            block_count,
            transaction_count,
            database_size,
        })
    }

    /// Names of the tables managed by this database.
    pub fn table_names() -> Vec<&'static str> {
        vec![
            BLOCKS.name(),
            BLOCK_HASHES.name(),
            TRANSACTIONS.name(),
            CHAIN_STATE.name(),
            METADATA.name(),
        ]
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

    fn create_test_block(height: u64) -> Block {
        let tx = Transaction::new_coinbase(5_000_000_000, "test_address".to_string(), height);

        Block {
            header: BlockHeader {
                version: 1,
                previous_hash: "prev_hash".to_string(),
                merkle_root: tx.id.clone(),
                timestamp: Utc::now(),
                difficulty: 1,
                nonce: 12345,
                height,
            },
            transactions: vec![tx],
        }
    }

    fn open() -> (TempDir, BlockchainDB) {
        let temp_dir = TempDir::new().unwrap();
        let db = BlockchainDB::new(temp_dir.path().join("test.db")).unwrap();
        (temp_dir, db)
    }

    #[test]
    fn test_store_and_load_block() {
        let (_dir, db) = open();
        let block = create_test_block(1);

        db.store_block(&block).unwrap();
        assert_eq!(db.load_block(1).unwrap(), block);
        assert_eq!(db.load_block_by_hash(&block.hash()).unwrap(), block);
        assert!(db.load_block(2).is_err());
        assert!(db.load_block_by_hash("missing").is_err());
    }

    #[test]
    fn test_store_and_load_chain_state() {
        let (_dir, db) = open();
        assert!(db.load_chain_state().is_err());

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
        let (_dir, db) = open();
        let tx = Transaction::new_coinbase(5_000_000_000, "test_address".to_string(), 1);

        db.store_transaction(&tx).unwrap();
        assert_eq!(db.load_transaction(&tx.id).unwrap(), tx);
        assert!(db.load_transaction("missing").is_err());
    }

    #[test]
    fn test_load_all_blocks() {
        let (_dir, db) = open();

        for i in (0..5).rev() {
            db.store_block(&create_test_block(i)).unwrap();
        }

        let blocks = db.load_all_blocks().unwrap();
        assert_eq!(blocks.len(), 5);
        for (i, block) in blocks.iter().enumerate() {
            assert_eq!(block.header.height, i as u64);
        }
        assert_eq!(db.get_block_count().unwrap(), 5);
    }

    #[test]
    fn test_utxo_set_round_trip() {
        let (_dir, db) = open();
        let mut utxo_set = UTXOSet::new();
        let tx = Transaction::new_coinbase(777, "addr".to_string(), 1);
        utxo_set.apply_transaction(&tx, 1).unwrap();

        db.store_utxo_set(&utxo_set).unwrap();
        let loaded = db.load_utxo_set().unwrap();
        assert_eq!(loaded.get_balance("addr"), 777);
    }

    #[test]
    fn test_commit_block_is_atomic_unit() {
        let (_dir, db) = open();
        let block = create_test_block(0);
        let mut utxo_set = UTXOSet::new();
        utxo_set
            .apply_transaction(&block.transactions[0], 0)
            .unwrap();
        let state = ChainState {
            best_block_hash: block.hash(),
            ..Default::default()
        };

        db.commit_block(&block, &state, &utxo_set).unwrap();
        assert_eq!(db.load_block(0).unwrap(), block);
        assert_eq!(db.load_chain_state().unwrap().best_block_hash, block.hash());
        assert_eq!(db.load_utxo_set().unwrap().size(), 1);
    }

    #[test]
    fn test_metadata_storage() {
        let (_dir, db) = open();

        db.store_metadata("test_key", b"test_value").unwrap();
        assert_eq!(db.load_metadata("test_key").unwrap(), b"test_value");
        assert!(db.load_metadata("other").is_err());
    }

    #[test]
    fn test_block_deletion() {
        let (_dir, db) = open();
        let block = create_test_block(1);

        db.store_block(&block).unwrap();
        db.delete_block(1).unwrap();
        assert!(db.load_block(1).is_err());
        assert!(db.load_block_by_hash(&block.hash()).is_err());
    }

    #[test]
    fn test_database_stats() {
        let (_dir, db) = open();
        db.store_block(&create_test_block(1)).unwrap();

        let stats = db.get_stats().unwrap();
        assert_eq!(stats.block_count, 1);
        assert_eq!(stats.transaction_count, 1);
        assert!(stats.database_size > 0);
    }

    #[test]
    fn test_reopen_persists_data() {
        let temp_dir = TempDir::new().unwrap();
        let path = temp_dir.path().join("test.db");
        let block = create_test_block(3);
        {
            let db = BlockchainDB::new(&path).unwrap();
            db.store_block(&block).unwrap();
        }
        let db = BlockchainDB::new(&path).unwrap();
        assert_eq!(db.load_block(3).unwrap(), block);
    }

    #[test]
    fn test_backup_and_restore() {
        let temp_dir = TempDir::new().unwrap();
        let path = temp_dir.path().join("main.db");
        let backup_path = temp_dir.path().join("backup.db");
        let restored_path = temp_dir.path().join("restored.db");
        let block = create_test_block(1);

        let mut db = BlockchainDB::new(&path).unwrap();
        db.store_block(&block).unwrap();
        db.store_metadata("k", b"v").unwrap();
        db.compact().unwrap();
        db.backup(&backup_path).unwrap();

        BlockchainDB::restore_from_backup(&backup_path, &restored_path).unwrap();
        let restored = BlockchainDB::new(&restored_path).unwrap();
        assert_eq!(restored.load_block(1).unwrap(), block);
        assert_eq!(restored.load_metadata("k").unwrap(), b"v");
        assert_eq!(BlockchainDB::table_names().len(), 5);
    }
}
