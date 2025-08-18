use crate::crypto::{hash_to_string, sha256};
use crate::error::{BlockchainError, Result};
use crate::mempool::Mempool;
use crate::merkle_tree::MerkleTree;
use crate::mining::{calculate_next_difficulty, verify_block_hash};
use crate::persistence::BlockchainDB;
use crate::utxo::UTXOSet;
use crate::{Block, BlockHeader, ChainState, Transaction, DIFFICULTY_ADJUSTMENT_INTERVAL, TARGET_BLOCK_TIME};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BlockchainConfig {
    pub network: String,
    pub genesis_timestamp: DateTime<Utc>,
    pub genesis_difficulty: u32,
    pub max_block_size: usize,
    pub target_block_time: u64,
    pub difficulty_adjustment_interval: u64,
}

impl Default for BlockchainConfig {
    fn default() -> Self {
        Self {
            network: "mainnet".to_string(),
            genesis_timestamp: Utc::now(),
            genesis_difficulty: 1,
            max_block_size: crate::MAX_BLOCK_SIZE,
            target_block_time: TARGET_BLOCK_TIME,
            difficulty_adjustment_interval: DIFFICULTY_ADJUSTMENT_INTERVAL,
        }
    }
}

#[derive(Debug)]
pub struct Blockchain {
    config: BlockchainConfig,
    db: BlockchainDB,
    state: ChainState,
    utxo_set: UTXOSet,
    mempool: Mempool,
    blocks_by_hash: HashMap<String, Block>,
    blocks_by_height: HashMap<u64, String>,
}

impl Blockchain {
    pub fn new(config: BlockchainConfig, db_path: &str) -> Result<Self> {
        let db = BlockchainDB::new(db_path)?;
        let mut blockchain = Self {
            config,
            db,
            state: ChainState::default(),
            utxo_set: UTXOSet::new(),
            mempool: Mempool::default(),
            blocks_by_hash: HashMap::new(),
            blocks_by_height: HashMap::new(),
        };

        // Load existing blockchain state or create genesis block
        if let Ok(existing_state) = blockchain.db.load_chain_state() {
            blockchain.state = existing_state;
            blockchain.load_from_db()?;
        } else {
            blockchain.create_genesis_block()?;
        }

        Ok(blockchain)
    }

    pub fn create_genesis_block(&mut self) -> Result<()> {
        let genesis_tx = Transaction::new_coinbase(
            crate::BLOCK_REWARD,
            "genesis_address".to_string(),
            0,
        );

        let merkle_tree = MerkleTree::from_transaction_ids(&[genesis_tx.id.clone()])?;
        let merkle_root = merkle_tree.get_root_hash().unwrap_or_default();

        let genesis_header = BlockHeader {
            version: 1,
            previous_hash: "0".repeat(64),
            merkle_root,
            timestamp: self.config.genesis_timestamp,
            difficulty: self.config.genesis_difficulty,
            nonce: 0,
            height: 0,
        };

        let genesis_block = Block {
            header: genesis_header,
            transactions: vec![genesis_tx],
        };

        self.add_block(genesis_block)?;
        Ok(())
    }

    pub fn add_block(&mut self, block: Block) -> Result<()> {
        // Validate the block
        self.validate_block(&block)?;

        let block_hash = self.calculate_block_hash(&block);
        let height = block.header.height;

        // Apply block to UTXO set
        for transaction in &block.transactions {
            self.utxo_set.apply_transaction(transaction, height)?;
            
            // Remove transaction from mempool if it exists
            self.mempool.remove_transaction(&transaction.id);
        }

        // Update chain state
        self.state.height = height;
        self.state.difficulty = block.header.difficulty;
        self.state.best_block_hash = block_hash.clone();
        
        // Store block
        self.blocks_by_hash.insert(block_hash.clone(), block.clone());
        self.blocks_by_height.insert(height, block_hash);

        // Persist to database
        self.db.store_block(&block)?;
        self.db.store_chain_state(&self.state)?;
        self.db.store_utxo_set(&self.utxo_set)?;

        Ok(())
    }

    pub fn validate_block(&self, block: &Block) -> Result<()> {
        // Check block header
        self.validate_block_header(&block.header)?;

        // Check transactions
        if block.transactions.is_empty() {
            return Err(BlockchainError::InvalidBlock(
                "Block has no transactions".to_string(),
            ));
        }

        // First transaction must be coinbase
        if !block.transactions[0].is_coinbase() {
            return Err(BlockchainError::InvalidBlock(
                "First transaction must be coinbase".to_string(),
            ));
        }

        // Only one coinbase transaction allowed
        let coinbase_count = block.transactions.iter().filter(|tx| tx.is_coinbase()).count();
        if coinbase_count != 1 {
            return Err(BlockchainError::InvalidBlock(
                "Block must have exactly one coinbase transaction".to_string(),
            ));
        }

        // Validate all transactions
        for (i, transaction) in block.transactions.iter().enumerate() {
            if i == 0 {
                // Skip coinbase validation (already checked)
                continue;
            }
            transaction.validate(self.utxo_set.get_all_utxos(), self.state.height)?;
        }

        // Verify merkle root
        let tx_ids: Vec<String> = block.transactions.iter().map(|tx| tx.id.clone()).collect();
        let merkle_tree = MerkleTree::from_transaction_ids(&tx_ids)?;
        let calculated_merkle_root = merkle_tree.get_root_hash().unwrap_or_default();
        
        if calculated_merkle_root != block.header.merkle_root {
            return Err(BlockchainError::InvalidBlock(
                "Invalid merkle root".to_string(),
            ));
        }

        // Verify proof of work
        if !verify_block_hash(block) {
            return Err(BlockchainError::InvalidBlock(
                "Invalid proof of work".to_string(),
            ));
        }

        // Check block size
        let block_size = bincode::serialize(block)
            .map_err(|e| BlockchainError::SerializationError(e.to_string()))?
            .len();
        
        if block_size > self.config.max_block_size {
            return Err(BlockchainError::InvalidBlock(
                "Block size exceeds limit".to_string(),
            ));
        }

        Ok(())
    }

    pub fn validate_block_header(&self, header: &BlockHeader) -> Result<()> {
        // Check if this is the genesis block
        if header.height == 0 {
            return Ok(());
        }

        // Check height sequence
        if header.height != self.state.height + 1 {
            return Err(BlockchainError::InvalidBlock(
                "Invalid block height".to_string(),
            ));
        }

        // Check previous hash
        if header.previous_hash != self.state.best_block_hash {
            return Err(BlockchainError::InvalidBlock(
                "Invalid previous hash".to_string(),
            ));
        }

        // Check timestamp (not too far in the future)
        let now = Utc::now();
        if header.timestamp > now + chrono::Duration::hours(2) {
            return Err(BlockchainError::InvalidBlock(
                "Block timestamp too far in the future".to_string(),
            ));
        }

        // Check difficulty
        let expected_difficulty = self.calculate_next_difficulty();
        if header.difficulty != expected_difficulty {
            return Err(BlockchainError::InvalidBlock(
                format!("Invalid difficulty: expected {}, got {}", 
                       expected_difficulty, header.difficulty),
            ));
        }

        Ok(())
    }

    pub fn calculate_next_difficulty(&self) -> u32 {
        if self.state.height < self.config.difficulty_adjustment_interval {
            return self.config.genesis_difficulty;
        }

        if (self.state.height + 1) % self.config.difficulty_adjustment_interval != 0 {
            return self.state.difficulty;
        }

        // Get the block from the beginning of this difficulty period
        let adjustment_height = self.state.height - self.config.difficulty_adjustment_interval + 1;
        if let Some(adjustment_block_hash) = self.blocks_by_height.get(&adjustment_height) {
            if let Some(adjustment_block) = self.blocks_by_hash.get(adjustment_block_hash) {
                return calculate_next_difficulty(
                    self.state.difficulty,
                    adjustment_block.header.timestamp,
                    self.config.difficulty_adjustment_interval,
                );
            }
        }

        self.state.difficulty
    }

    pub fn add_transaction(&mut self, transaction: Transaction) -> Result<()> {
        self.mempool.add_transaction(transaction, &self.utxo_set, self.state.height)
    }

    pub fn get_block_by_hash(&self, hash: &str) -> Option<&Block> {
        self.blocks_by_hash.get(hash)
    }

    pub fn get_block_by_height(&self, height: u64) -> Option<&Block> {
        self.blocks_by_height
            .get(&height)
            .and_then(|hash| self.blocks_by_hash.get(hash))
    }

    pub fn get_latest_block(&self) -> Option<&Block> {
        self.get_block_by_height(self.state.height)
    }

    pub fn get_chain_height(&self) -> u64 {
        self.state.height
    }

    pub fn get_difficulty(&self) -> u32 {
        self.state.difficulty
    }

    pub fn get_balance(&self, address: &str) -> u64 {
        self.utxo_set.get_balance(address)
    }

    pub fn get_mempool_transactions(&self, max_count: usize) -> Vec<&Transaction> {
        self.mempool.get_transactions_by_fee_rate(max_count)
    }

    pub fn get_transactions_for_mining(&self, max_size: usize, max_count: usize) -> Vec<Transaction> {
        self.mempool.get_transactions_for_mining(max_size, max_count)
    }

    pub fn calculate_block_hash(&self, block: &Block) -> String {
        let data = bincode::serialize(block).unwrap_or_default();
        hash_to_string(&sha256(&data))
    }

    pub fn reorg_to_block(&mut self, target_hash: &str) -> Result<()> {
        // Find the common ancestor
        let target_block = self.blocks_by_hash.get(target_hash)
            .ok_or_else(|| BlockchainError::BlockNotFound(target_hash.to_string()))?
            .clone();

        // For simplicity, this is a basic reorg implementation
        // In a full implementation, you'd need to:
        // 1. Find the fork point
        // 2. Revert blocks back to the fork point
        // 3. Apply blocks from the new chain
        
        // For now, we'll just validate the target block exists and is valid
        self.validate_block(&target_block)?;
        
        Ok(())
    }

    pub fn load_from_db(&mut self) -> Result<()> {
        // Load blocks and rebuild in-memory structures
        let blocks = self.db.load_all_blocks()?;
        
        for block in blocks {
            let block_hash = self.calculate_block_hash(&block);
            let height = block.header.height;
            
            self.blocks_by_hash.insert(block_hash.clone(), block);
            self.blocks_by_height.insert(height, block_hash);
        }

        // Load UTXO set
        if let Ok(utxo_set) = self.db.load_utxo_set() {
            self.utxo_set = utxo_set;
        }

        Ok(())
    }

    pub fn get_chain_stats(&self) -> ChainStats {
        ChainStats {
            height: self.state.height,
            difficulty: self.state.difficulty,
            total_transactions: self.count_total_transactions(),
            total_supply: self.utxo_set.total_supply(),
            mempool_size: self.mempool.size(),
            utxo_count: self.utxo_set.size(),
        }
    }

    fn count_total_transactions(&self) -> u64 {
        self.blocks_by_hash
            .values()
            .map(|block| block.transactions.len() as u64)
            .sum()
    }

    pub fn cleanup_mempool(&mut self) {
        self.mempool.cleanup_expired();
    }

    pub fn estimate_fee(&self, target_blocks: u32) -> u64 {
        self.mempool.estimate_fee(target_blocks)
    }

    pub fn get_utxo_set(&self) -> &UTXOSet {
        &self.utxo_set
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChainStats {
    pub height: u64,
    pub difficulty: u32,
    pub total_transactions: u64,
    pub total_supply: u64,
    pub mempool_size: usize,
    pub utxo_count: usize,
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[test]
    fn test_blockchain_creation() {
        let temp_dir = TempDir::new().unwrap();
        let db_path = temp_dir.path().join("test_blockchain.db");
        
        let config = BlockchainConfig::default();
        let blockchain = Blockchain::new(config, db_path.to_str().unwrap());
        
        assert!(blockchain.is_ok());
        let blockchain = blockchain.unwrap();
        assert_eq!(blockchain.get_chain_height(), 0);
    }

    #[test]
    fn test_genesis_block_creation() {
        let temp_dir = TempDir::new().unwrap();
        let db_path = temp_dir.path().join("test_blockchain.db");
        
        let config = BlockchainConfig::default();
        let blockchain = Blockchain::new(config, db_path.to_str().unwrap()).unwrap();
        
        let genesis = blockchain.get_block_by_height(0);
        assert!(genesis.is_some());
        
        let genesis = genesis.unwrap();
        assert_eq!(genesis.header.height, 0);
        assert_eq!(genesis.transactions.len(), 1);
        assert!(genesis.transactions[0].is_coinbase());
    }

    #[test]
    fn test_block_validation() {
        let temp_dir = TempDir::new().unwrap();
        let db_path = temp_dir.path().join("test_blockchain.db");
        
        let config = BlockchainConfig::default();
        let blockchain = Blockchain::new(config, db_path.to_str().unwrap()).unwrap();
        
        let genesis = blockchain.get_block_by_height(0).unwrap();
        
        // Test valid genesis block
        assert!(blockchain.validate_block(genesis).is_ok());
    }

    #[test]
    fn test_chain_stats() {
        let temp_dir = TempDir::new().unwrap();
        let db_path = temp_dir.path().join("test_blockchain.db");
        
        let config = BlockchainConfig::default();
        let blockchain = Blockchain::new(config, db_path.to_str().unwrap()).unwrap();
        
        let stats = blockchain.get_chain_stats();
        assert_eq!(stats.height, 0);
        assert!(stats.total_supply > 0); // Genesis block reward
        assert_eq!(stats.mempool_size, 0);
    }

    #[test]
    fn test_difficulty_calculation() {
        let temp_dir = TempDir::new().unwrap();
        let db_path = temp_dir.path().join("test_blockchain.db");
        
        let config = BlockchainConfig::default();
        let blockchain = Blockchain::new(config, db_path.to_str().unwrap()).unwrap();
        
        let next_difficulty = blockchain.calculate_next_difficulty();
        assert_eq!(next_difficulty, blockchain.config.genesis_difficulty);
    }

    #[test]
    fn test_balance_calculation() {
        let temp_dir = TempDir::new().unwrap();
        let db_path = temp_dir.path().join("test_blockchain.db");
        
        let config = BlockchainConfig::default();
        let blockchain = Blockchain::new(config, db_path.to_str().unwrap()).unwrap();
        
        let balance = blockchain.get_balance("genesis_address");
        assert!(balance > 0); // Should have genesis block reward
        
        let balance = blockchain.get_balance("nonexistent_address");
        assert_eq!(balance, 0);
    }
}