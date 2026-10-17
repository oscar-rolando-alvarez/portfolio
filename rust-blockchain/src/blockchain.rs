use crate::error::{BlockchainError, Result};
use crate::mempool::Mempool;
use crate::merkle_tree::MerkleTree;
use crate::mining::{calculate_block_reward, retarget_difficulty, solve_header, verify_block_hash};
use crate::persistence::BlockchainDB;
use crate::utxo::UTXOSet;
use crate::{
    Block, BlockHeader, ChainState, DIFFICULTY_ADJUSTMENT_INTERVAL, OutPoint, TARGET_BLOCK_TIME,
    Transaction, codec,
};
use chrono::{DateTime, TimeZone, Utc};
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::path::Path;

/// Address credited by the genesis coinbase.
pub const GENESIS_ADDRESS: &str = "genesis_address";

/// Fixed genesis timestamp (2024-01-01T00:00:00Z) so every node agrees on the genesis block.
pub fn default_genesis_timestamp() -> DateTime<Utc> {
    Utc.with_ymd_and_hms(2024, 1, 1, 0, 0, 0)
        .single()
        .expect("valid genesis timestamp")
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BlockchainConfig {
    pub network: String,
    pub genesis_timestamp: DateTime<Utc>,
    /// Difficulty in leading zero bits used for the genesis block and the
    /// first adjustment period.
    pub genesis_difficulty: u32,
    pub max_block_size: usize,
    pub target_block_time: u64,
    pub difficulty_adjustment_interval: u64,
}

impl Default for BlockchainConfig {
    fn default() -> Self {
        Self {
            network: "mainnet".to_string(),
            genesis_timestamp: default_genesis_timestamp(),
            genesis_difficulty: 12,
            max_block_size: crate::MAX_BLOCK_SIZE,
            target_block_time: TARGET_BLOCK_TIME,
            difficulty_adjustment_interval: DIFFICULTY_ADJUSTMENT_INTERVAL,
        }
    }
}

/// Everything a miner needs to build the next block.
#[derive(Debug, Clone)]
pub struct BlockTemplate {
    pub height: u64,
    pub previous_hash: String,
    pub difficulty: u32,
    pub transactions: Vec<Transaction>,
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
    /// Open the chain stored at `db_path`, creating the genesis block if empty.
    pub fn new<P: AsRef<Path>>(config: BlockchainConfig, db_path: P) -> Result<Self> {
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

        match blockchain.db.load_chain_state() {
            Ok(existing_state) => {
                blockchain.state = existing_state;
                blockchain.load_from_db()?;
            }
            Err(_) => blockchain.create_genesis_block()?,
        }

        Ok(blockchain)
    }

    pub fn config(&self) -> &BlockchainConfig {
        &self.config
    }

    /// Deterministic genesis block for the configured parameters.
    pub fn build_genesis_block(config: &BlockchainConfig) -> Result<Block> {
        let mut genesis_tx =
            Transaction::new_coinbase(crate::BLOCK_REWARD, GENESIS_ADDRESS.to_string(), 0);
        genesis_tx.timestamp = config.genesis_timestamp;

        let merkle_root = MerkleTree::from_transaction_ids(std::slice::from_ref(&genesis_tx.id))?
            .get_root_hash()
            .unwrap_or_default();

        let mut header = BlockHeader {
            version: 1,
            previous_hash: "0".repeat(64),
            merkle_root,
            timestamp: config.genesis_timestamp,
            difficulty: config.genesis_difficulty,
            nonce: 0,
            height: 0,
        };
        solve_header(&mut header);

        Ok(Block {
            header,
            transactions: vec![genesis_tx],
        })
    }

    pub fn create_genesis_block(&mut self) -> Result<()> {
        let genesis = Self::build_genesis_block(&self.config)?;
        self.add_block(genesis)
    }

    /// Validate `block` and append it to the chain.
    pub fn add_block(&mut self, block: Block) -> Result<()> {
        self.validate_block(&block)?;

        let block_hash = block.hash();
        let height = block.header.height;

        let mut utxo_set = self.utxo_set.clone();
        for transaction in &block.transactions {
            utxo_set.apply_transaction(transaction, height)?;
        }

        let mut state = self.state.clone();
        state.height = height;
        state.difficulty = block.header.difficulty;
        state.best_block_hash = block_hash.clone();
        state.total_work = state
            .total_work
            .saturating_add(1u64 << block.header.difficulty.min(63));

        self.db.commit_block(&block, &state, &utxo_set)?;

        self.utxo_set = utxo_set;
        self.state = state;
        for transaction in &block.transactions {
            self.mempool.remove_transaction(&transaction.id);
        }
        self.mempool.remove_invalid(&self.utxo_set);

        self.blocks_by_hash.insert(block_hash.clone(), block);
        self.blocks_by_height.insert(height, block_hash);

        Ok(())
    }

    pub fn is_empty(&self) -> bool {
        self.blocks_by_height.is_empty()
    }

    pub fn validate_block(&self, block: &Block) -> Result<()> {
        self.validate_block_header(&block.header)?;

        if block.transactions.is_empty() {
            return Err(BlockchainError::InvalidBlock(
                "Block has no transactions".to_string(),
            ));
        }

        if !block.transactions[0].is_coinbase() {
            return Err(BlockchainError::InvalidBlock(
                "First transaction must be coinbase".to_string(),
            ));
        }

        if block
            .transactions
            .iter()
            .filter(|tx| tx.is_coinbase())
            .count()
            != 1
        {
            return Err(BlockchainError::InvalidBlock(
                "Block must have exactly one coinbase transaction".to_string(),
            ));
        }

        let utxos = self.utxo_set.get_all_utxos();
        let spend_height = block.header.height;
        let mut spent: HashSet<&OutPoint> = HashSet::new();
        let mut seen_ids: HashSet<&str> = HashSet::new();
        let mut total_fees: u64 = 0;

        for transaction in &block.transactions {
            if !seen_ids.insert(transaction.id.as_str()) {
                return Err(BlockchainError::InvalidBlock(format!(
                    "Duplicate transaction {}",
                    transaction.id
                )));
            }
            transaction.validate(utxos, spend_height)?;
            if transaction.is_coinbase() {
                continue;
            }
            for outpoint in transaction
                .inputs
                .iter()
                .filter_map(|i| i.previous_output.as_ref())
            {
                if !spent.insert(outpoint) {
                    return Err(BlockchainError::InvalidBlock(format!(
                        "Double spend of {}:{} within block",
                        outpoint.txid, outpoint.vout
                    )));
                }
            }
            total_fees = total_fees.saturating_add(transaction.calculate_fee(utxos)?);
        }

        let max_coinbase = calculate_block_reward(block.header.height).saturating_add(total_fees);
        if block.transactions[0].total_output_value() > max_coinbase {
            return Err(BlockchainError::InvalidBlock(format!(
                "Coinbase pays {} but at most {} is allowed",
                block.transactions[0].total_output_value(),
                max_coinbase
            )));
        }

        let tx_ids: Vec<String> = block.transactions.iter().map(|tx| tx.id.clone()).collect();
        let calculated_merkle_root = MerkleTree::from_transaction_ids(&tx_ids)?
            .get_root_hash()
            .unwrap_or_default();
        if calculated_merkle_root != block.header.merkle_root {
            return Err(BlockchainError::InvalidBlock(
                "Invalid merkle root".to_string(),
            ));
        }

        if !verify_block_hash(block) {
            return Err(BlockchainError::InvalidBlock(
                "Invalid proof of work".to_string(),
            ));
        }

        if codec::encode(block)?.len() > self.config.max_block_size {
            return Err(BlockchainError::InvalidBlock(
                "Block size exceeds limit".to_string(),
            ));
        }

        Ok(())
    }

    pub fn validate_block_header(&self, header: &BlockHeader) -> Result<()> {
        if header.height == 0 {
            if let Some(existing) = self.get_block_by_height(0) {
                if existing.header != *header {
                    return Err(BlockchainError::InvalidBlock(
                        "Chain already has a different genesis block".to_string(),
                    ));
                }
                return Err(BlockchainError::InvalidBlock(
                    "Genesis block already present".to_string(),
                ));
            }
            if header.difficulty != self.config.genesis_difficulty {
                return Err(BlockchainError::InvalidBlock(
                    "Invalid genesis difficulty".to_string(),
                ));
            }
            return Ok(());
        }

        if self.is_empty() {
            return Err(BlockchainError::InvalidBlock(
                "Chain has no genesis block".to_string(),
            ));
        }

        if header.height != self.state.height + 1 {
            return Err(BlockchainError::InvalidBlock(format!(
                "Invalid block height: expected {}, got {}",
                self.state.height + 1,
                header.height
            )));
        }

        if header.previous_hash != self.state.best_block_hash {
            return Err(BlockchainError::InvalidBlock(
                "Invalid previous hash".to_string(),
            ));
        }

        if header.timestamp > Utc::now() + chrono::Duration::hours(2) {
            return Err(BlockchainError::InvalidBlock(
                "Block timestamp too far in the future".to_string(),
            ));
        }

        let expected_difficulty = self.calculate_next_difficulty();
        if header.difficulty != expected_difficulty {
            return Err(BlockchainError::InvalidBlock(format!(
                "Invalid difficulty: expected {}, got {}",
                expected_difficulty, header.difficulty
            )));
        }

        Ok(())
    }

    /// Difficulty required for the block at height `self.height + 1`.
    pub fn calculate_next_difficulty(&self) -> u32 {
        let interval = self.config.difficulty_adjustment_interval.max(1);
        let next_height = self.state.height + 1;

        if self.is_empty() || next_height < interval {
            return self.config.genesis_difficulty;
        }

        if !next_height.is_multiple_of(interval) {
            return self.state.difficulty;
        }

        let period_start = next_height - interval;
        let (Some(first), Some(last)) = (
            self.get_block_by_height(period_start),
            self.get_block_by_height(self.state.height),
        ) else {
            return self.state.difficulty;
        };

        let actual = last
            .header
            .timestamp
            .signed_duration_since(first.header.timestamp)
            .num_seconds()
            .max(0) as u64;
        let expected = self.config.target_block_time * (interval - 1).max(1);

        retarget_difficulty(self.state.difficulty, actual, expected)
    }

    /// Validate a transaction and add it to the mempool.
    pub fn add_transaction(&mut self, transaction: Transaction) -> Result<()> {
        self.mempool
            .add_transaction(transaction, &self.utxo_set, self.state.height)
    }

    /// Parameters for mining the next block on top of the current tip.
    pub fn block_template(&self, max_size: usize, max_count: usize) -> BlockTemplate {
        BlockTemplate {
            height: self.state.height + 1,
            previous_hash: self.state.best_block_hash.clone(),
            difficulty: self.calculate_next_difficulty(),
            transactions: self.get_transactions_for_mining(max_size, max_count),
        }
    }

    pub fn get_block_by_hash(&self, hash: &str) -> Option<&Block> {
        self.blocks_by_hash.get(hash)
    }

    pub fn get_block_by_height(&self, height: u64) -> Option<&Block> {
        self.blocks_by_height
            .get(&height)
            .and_then(|hash| self.blocks_by_hash.get(hash))
    }

    /// Up to `count` consecutive blocks starting at `start_height`.
    pub fn get_blocks_from(&self, start_height: u64, count: usize) -> Vec<Block> {
        (start_height..)
            .take(count)
            .map_while(|h| self.get_block_by_height(h).cloned())
            .collect()
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

    pub fn get_best_block_hash(&self) -> &str {
        &self.state.best_block_hash
    }

    pub fn get_balance(&self, address: &str) -> u64 {
        self.utxo_set.get_balance(address)
    }

    pub fn get_mempool_transactions(&self, max_count: usize) -> Vec<&Transaction> {
        self.mempool.get_transactions_by_fee_rate(max_count)
    }

    pub fn get_mempool(&self) -> &Mempool {
        &self.mempool
    }

    pub fn get_transactions_for_mining(
        &self,
        max_size: usize,
        max_count: usize,
    ) -> Vec<Transaction> {
        self.mempool
            .get_transactions_for_mining(max_size, max_count)
    }

    /// Look up a confirmed transaction by id.
    pub fn get_transaction(&self, tx_id: &str) -> Option<Transaction> {
        self.db.load_transaction(tx_id).ok()
    }

    /// Proof-of-work hash of `block` (hex encoded).
    pub fn calculate_block_hash(&self, block: &Block) -> String {
        block.hash()
    }

    /// Check that the stored chain links up and every block satisfies its PoW.
    pub fn verify_chain(&self) -> Result<()> {
        let mut previous_hash = "0".repeat(64);
        for height in 0..=self.state.height {
            let block = self
                .get_block_by_height(height)
                .ok_or_else(|| BlockchainError::BlockNotFound(height.to_string()))?;
            if block.header.previous_hash != previous_hash {
                return Err(BlockchainError::InvalidBlock(format!(
                    "Broken link at height {height}"
                )));
            }
            if !verify_block_hash(block) {
                return Err(BlockchainError::InvalidBlock(format!(
                    "Invalid proof of work at height {height}"
                )));
            }
            previous_hash = block.hash();
        }
        Ok(())
    }

    fn load_from_db(&mut self) -> Result<()> {
        for block in self.db.load_all_blocks()? {
            let block_hash = block.hash();
            let height = block.header.height;
            self.blocks_by_hash.insert(block_hash.clone(), block);
            self.blocks_by_height.insert(height, block_hash);
        }

        if let Ok(utxo_set) = self.db.load_utxo_set() {
            self.utxo_set = utxo_set;
        }

        Ok(())
    }

    pub fn get_chain_stats(&self) -> ChainStats {
        ChainStats {
            height: self.state.height,
            difficulty: self.state.difficulty,
            next_difficulty: self.calculate_next_difficulty(),
            best_block_hash: self.state.best_block_hash.clone(),
            total_transactions: self.count_total_transactions(),
            total_supply: self.utxo_set.total_supply(),
            mempool_size: self.mempool.size(),
            utxo_count: self.utxo_set.size(),
            network: self.config.network.clone(),
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
    pub next_difficulty: u32,
    pub best_block_hash: String,
    pub total_transactions: u64,
    pub total_supply: u64,
    pub mempool_size: usize,
    pub utxo_count: usize,
    pub network: String,
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::mining::{Miner, MiningConfig};
    use tempfile::TempDir;

    fn test_config() -> BlockchainConfig {
        BlockchainConfig {
            network: "testnet".to_string(),
            genesis_difficulty: 4,
            ..Default::default()
        }
    }

    fn new_chain() -> (TempDir, Blockchain) {
        let temp_dir = TempDir::new().unwrap();
        let chain = Blockchain::new(test_config(), temp_dir.path().join("chain.db")).unwrap();
        (temp_dir, chain)
    }

    fn mine_next(chain: &Blockchain, miner: &Miner) -> Block {
        let template = chain.block_template(900_000, 1000);
        miner
            .mine_block(
                template.transactions,
                template.previous_hash,
                template.height,
                template.difficulty,
            )
            .unwrap()
    }

    fn miner(address: &str) -> Miner {
        Miner::new(MiningConfig {
            max_threads: 1,
            target_difficulty: 4,
            miner_address: address.to_string(),
            extra_nonce: 0,
        })
    }

    #[test]
    fn test_blockchain_creation() {
        let (_dir, blockchain) = new_chain();
        assert_eq!(blockchain.get_chain_height(), 0);
        assert!(!blockchain.is_empty());
    }

    #[test]
    fn test_genesis_block_creation() {
        let (_dir, blockchain) = new_chain();

        let genesis = blockchain.get_block_by_height(0).unwrap();
        assert_eq!(genesis.header.height, 0);
        assert_eq!(genesis.transactions.len(), 1);
        assert!(genesis.transactions[0].is_coinbase());
        assert!(verify_block_hash(genesis));
    }

    #[test]
    fn test_genesis_is_deterministic() {
        let (_d1, a) = new_chain();
        let (_d2, b) = new_chain();
        assert_eq!(
            a.get_block_by_height(0).unwrap().hash(),
            b.get_block_by_height(0).unwrap().hash()
        );
    }

    #[test]
    fn test_genesis_cannot_be_replaced() {
        let (_dir, mut blockchain) = new_chain();
        let genesis = blockchain.get_block_by_height(0).unwrap().clone();
        assert!(blockchain.add_block(genesis).is_err());
    }

    #[test]
    fn test_add_mined_blocks() {
        let (_dir, mut chain) = new_chain();
        let miner = miner("miner_address");

        for expected_height in 1..=3 {
            let block = mine_next(&chain, &miner);
            chain.add_block(block).unwrap();
            assert_eq!(chain.get_chain_height(), expected_height);
        }

        assert_eq!(
            chain.get_balance("miner_address"),
            3 * calculate_block_reward(1)
        );
        assert!(chain.verify_chain().is_ok());
        assert_eq!(chain.get_blocks_from(1, 10).len(), 3);
        assert_eq!(chain.get_chain_stats().total_transactions, 4);
    }

    #[test]
    fn test_reject_wrong_previous_hash() {
        let (_dir, mut chain) = new_chain();
        let miner = miner("m");
        let block = miner.mine_block(vec![], "f".repeat(64), 1, 4).unwrap();
        assert!(chain.add_block(block).is_err());
    }

    #[test]
    fn test_reject_wrong_height_and_difficulty() {
        let (_dir, mut chain) = new_chain();
        let miner = miner("m");
        let tip = chain.get_best_block_hash().to_string();

        let wrong_height = miner.mine_block(vec![], tip.clone(), 5, 4).unwrap();
        assert!(chain.add_block(wrong_height).is_err());

        let wrong_difficulty = miner.mine_block(vec![], tip, 1, 2).unwrap();
        assert!(chain.add_block(wrong_difficulty).is_err());
        assert_eq!(chain.get_chain_height(), 0);
    }

    #[test]
    fn test_reject_tampered_block() {
        let (_dir, mut chain) = new_chain();
        let miner = miner("m");
        let mut block = mine_next(&chain, &miner);
        block.transactions[0].outputs[0].value += 1;
        block.transactions[0].id = block.transactions[0].calculate_id();
        assert!(chain.add_block(block).is_err());
    }

    #[test]
    fn test_reject_excessive_coinbase() {
        let (_dir, mut chain) = new_chain();
        let template = chain.block_template(900_000, 10);

        let coinbase =
            Transaction::new_coinbase(calculate_block_reward(1) + 1, "greedy".to_string(), 1);
        let merkle_root = MerkleTree::from_transaction_ids(std::slice::from_ref(&coinbase.id))
            .unwrap()
            .get_root_hash()
            .unwrap();
        let mut header = BlockHeader {
            version: 1,
            previous_hash: template.previous_hash,
            merkle_root,
            timestamp: Utc::now(),
            difficulty: template.difficulty,
            nonce: 0,
            height: 1,
        };
        solve_header(&mut header);

        let block = Block {
            header,
            transactions: vec![coinbase],
        };
        let err = chain.add_block(block).unwrap_err();
        assert!(err.to_string().contains("Coinbase"));
    }

    #[test]
    fn test_persistence_across_reopen() {
        let temp_dir = TempDir::new().unwrap();
        let path = temp_dir.path().join("chain.db");
        let tip_hash;
        {
            let mut chain = Blockchain::new(test_config(), &path).unwrap();
            let miner = miner("persist");
            let block = mine_next(&chain, &miner);
            chain.add_block(block).unwrap();
            tip_hash = chain.get_best_block_hash().to_string();
        }

        let chain = Blockchain::new(test_config(), &path).unwrap();
        assert_eq!(chain.get_chain_height(), 1);
        assert_eq!(chain.get_best_block_hash(), tip_hash);
        assert_eq!(chain.get_balance("persist"), calculate_block_reward(1));
        assert!(chain.get_block_by_hash(&tip_hash).is_some());
        assert!(chain.verify_chain().is_ok());
    }

    #[test]
    fn test_block_validation() {
        let (_dir, blockchain) = new_chain();
        let genesis = blockchain.get_block_by_height(0).unwrap();
        // Re-validating genesis against a chain that already has it must fail.
        assert!(blockchain.validate_block(genesis).is_err());

        let fresh = Blockchain::build_genesis_block(&test_config()).unwrap();
        assert_eq!(&fresh, genesis);
    }

    #[test]
    fn test_chain_stats() {
        let (_dir, blockchain) = new_chain();

        let stats = blockchain.get_chain_stats();
        assert_eq!(stats.height, 0);
        assert_eq!(stats.total_supply, crate::BLOCK_REWARD);
        assert_eq!(stats.mempool_size, 0);
        assert_eq!(stats.utxo_count, 1);
        assert_eq!(stats.network, "testnet");
    }

    #[test]
    fn test_difficulty_calculation() {
        let (_dir, blockchain) = new_chain();
        assert_eq!(
            blockchain.calculate_next_difficulty(),
            blockchain.config.genesis_difficulty
        );
    }

    #[test]
    fn test_difficulty_retarget_at_interval() {
        let temp_dir = TempDir::new().unwrap();
        let config = BlockchainConfig {
            genesis_difficulty: 2,
            difficulty_adjustment_interval: 4,
            ..test_config()
        };
        let mut chain = Blockchain::new(config, temp_dir.path().join("c.db")).unwrap();
        let miner = miner("m");

        // Heights 1..=3 keep the genesis difficulty.
        for _ in 1..=3 {
            let block = mine_next(&chain, &miner);
            assert_eq!(block.header.difficulty, 2);
            chain.add_block(block).unwrap();
        }
        // The first period spans from the fixed (old) genesis timestamp to now,
        // which is far slower than target, so difficulty drops (floored at 1).
        let next = chain.calculate_next_difficulty();
        assert_eq!(next, 1);
        let block = mine_next(&chain, &miner);
        assert_eq!(block.header.difficulty, next);
        chain.add_block(block).unwrap();
    }

    #[test]
    fn test_balance_calculation() {
        let (_dir, blockchain) = new_chain();

        assert_eq!(blockchain.get_balance(GENESIS_ADDRESS), crate::BLOCK_REWARD);
        assert_eq!(blockchain.get_balance("nonexistent_address"), 0);
    }
}
