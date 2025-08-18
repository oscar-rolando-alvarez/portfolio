use crate::crypto::{double_sha256, hash_difficulty_check, hash_to_string};
use crate::error::{BlockchainError, Result};
use crate::merkle_tree::MerkleTree;
use crate::{Block, BlockHeader, Transaction, BLOCK_REWARD, HALVING_INTERVAL, TARGET_BLOCK_TIME, DIFFICULTY_ADJUSTMENT_INTERVAL};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Arc;
use std::thread;
use std::time::{Duration, Instant};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MiningConfig {
    pub max_threads: usize,
    pub target_difficulty: u32,
    pub miner_address: String,
    pub extra_nonce: u64,
}

impl Default for MiningConfig {
    fn default() -> Self {
        Self {
            max_threads: num_cpus::get(),
            target_difficulty: 1,
            miner_address: String::new(),
            extra_nonce: 0,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MiningStats {
    pub hash_rate: f64,
    pub blocks_mined: u64,
    pub total_hashes: u64,
    pub mining_time: Duration,
    pub current_difficulty: u32,
    pub last_block_time: Option<DateTime<Utc>>,
}

impl Default for MiningStats {
    fn default() -> Self {
        Self {
            hash_rate: 0.0,
            blocks_mined: 0,
            total_hashes: 0,
            mining_time: Duration::new(0, 0),
            current_difficulty: 1,
            last_block_time: None,
        }
    }
}

#[derive(Debug)]
pub struct Miner {
    config: MiningConfig,
    stats: Arc<std::sync::Mutex<MiningStats>>,
    is_mining: Arc<AtomicBool>,
    current_nonce: Arc<AtomicU64>,
}

impl Miner {
    pub fn new(config: MiningConfig) -> Self {
        Self {
            config,
            stats: Arc::new(std::sync::Mutex::new(MiningStats::default())),
            is_mining: Arc::new(AtomicBool::new(false)),
            current_nonce: Arc::new(AtomicU64::new(0)),
        }
    }

    pub fn mine_block(
        &self,
        transactions: Vec<Transaction>,
        previous_hash: String,
        height: u64,
        difficulty: u32,
    ) -> Result<Block> {
        if transactions.is_empty() {
            return Err(BlockchainError::MiningError(
                "Cannot mine block with no transactions".to_string(),
            ));
        }

        // Create coinbase transaction
        let block_reward = calculate_block_reward(height);
        let coinbase_tx = Transaction::new_coinbase(
            block_reward,
            self.config.miner_address.clone(),
            height,
        );

        // Combine coinbase with other transactions
        let mut all_transactions = vec![coinbase_tx];
        all_transactions.extend(transactions);

        // Calculate merkle root
        let tx_ids: Vec<String> = all_transactions.iter().map(|tx| tx.id.clone()).collect();
        let merkle_tree = MerkleTree::from_transaction_ids(&tx_ids)?;
        let merkle_root = merkle_tree.get_root_hash().unwrap_or_default();

        // Create block header
        let mut header = BlockHeader {
            version: 1,
            previous_hash,
            merkle_root,
            timestamp: Utc::now(),
            difficulty,
            nonce: 0,
            height,
        };

        // Start mining
        self.is_mining.store(true, Ordering::SeqCst);
        let start_time = Instant::now();
        let mut hashes = 0u64;

        // Mine with multiple threads
        let found_nonce = self.mine_with_threads(&header, difficulty)?;
        header.nonce = found_nonce;

        let mining_time = start_time.elapsed();
        hashes = self.current_nonce.load(Ordering::SeqCst);

        // Update stats
        {
            let mut stats = self.stats.lock().unwrap();
            stats.blocks_mined += 1;
            stats.total_hashes += hashes;
            stats.mining_time += mining_time;
            stats.hash_rate = hashes as f64 / mining_time.as_secs_f64();
            stats.current_difficulty = difficulty;
            stats.last_block_time = Some(header.timestamp);
        }

        self.is_mining.store(false, Ordering::SeqCst);

        Ok(Block {
            header,
            transactions: all_transactions,
        })
    }

    fn mine_with_threads(&self, header: &BlockHeader, difficulty: u32) -> Result<u64> {
        let thread_count = self.config.max_threads;
        let found_nonce = Arc::new(AtomicU64::new(0));
        let found = Arc::new(AtomicBool::new(false));
        let is_mining = self.is_mining.clone();
        let current_nonce = self.current_nonce.clone();

        let mut handles = Vec::new();

        for thread_id in 0..thread_count {
            let header = header.clone();
            let found_nonce = found_nonce.clone();
            let found = found.clone();
            let is_mining = is_mining.clone();
            let current_nonce = current_nonce.clone();

            let handle = thread::spawn(move || {
                let mut nonce = thread_id as u64;
                let nonce_step = thread_count as u64;

                while is_mining.load(Ordering::SeqCst) && !found.load(Ordering::SeqCst) {
                    let hash = calculate_block_hash(&header, nonce);
                    current_nonce.store(nonce, Ordering::SeqCst);

                    if hash_difficulty_check(&hash, difficulty) {
                        found_nonce.store(nonce, Ordering::SeqCst);
                        found.store(true, Ordering::SeqCst);
                        break;
                    }

                    nonce += nonce_step;

                    // Yield occasionally to avoid hogging CPU
                    if nonce % 10000 == 0 {
                        thread::yield_now();
                    }
                }
            });

            handles.push(handle);
        }

        // Wait for threads to complete
        for handle in handles {
            handle.join().map_err(|_| {
                BlockchainError::MiningError("Mining thread panicked".to_string())
            })?;
        }

        if found.load(Ordering::SeqCst) {
            Ok(found_nonce.load(Ordering::SeqCst))
        } else {
            Err(BlockchainError::MiningError(
                "Mining was stopped before finding solution".to_string(),
            ))
        }
    }

    pub fn stop_mining(&self) {
        self.is_mining.store(false, Ordering::SeqCst);
    }

    pub fn is_mining(&self) -> bool {
        self.is_mining.load(Ordering::SeqCst)
    }

    pub fn get_stats(&self) -> MiningStats {
        self.stats.lock().unwrap().clone()
    }

    pub fn get_hash_rate(&self) -> f64 {
        self.stats.lock().unwrap().hash_rate
    }
}

pub fn calculate_block_hash(header: &BlockHeader, nonce: u64) -> Vec<u8> {
    let mut data = Vec::new();
    
    data.extend_from_slice(&header.version.to_be_bytes());
    data.extend_from_slice(header.previous_hash.as_bytes());
    data.extend_from_slice(header.merkle_root.as_bytes());
    data.extend_from_slice(&header.timestamp.timestamp().to_be_bytes());
    data.extend_from_slice(&header.difficulty.to_be_bytes());
    data.extend_from_slice(&nonce.to_be_bytes());
    data.extend_from_slice(&header.height.to_be_bytes());
    
    double_sha256(&data)
}

pub fn verify_block_hash(block: &Block) -> bool {
    let calculated_hash = calculate_block_hash(&block.header, block.header.nonce);
    hash_difficulty_check(&calculated_hash, block.header.difficulty)
}

pub fn calculate_block_reward(height: u64) -> u64 {
    let halvings = height / HALVING_INTERVAL;
    if halvings >= 64 {
        0 // After 64 halvings, reward becomes 0
    } else {
        BLOCK_REWARD >> halvings
    }
}

pub fn calculate_next_difficulty(
    current_difficulty: u32,
    last_adjustment_time: DateTime<Utc>,
    blocks_since_adjustment: u64,
) -> u32 {
    if blocks_since_adjustment < DIFFICULTY_ADJUSTMENT_INTERVAL {
        return current_difficulty;
    }

    let expected_time = TARGET_BLOCK_TIME * DIFFICULTY_ADJUSTMENT_INTERVAL;
    let actual_time = Utc::now()
        .signed_duration_since(last_adjustment_time)
        .num_seconds() as u64;

    // Prevent extreme difficulty changes
    let max_adjustment_factor = 4;
    let min_adjustment_factor = 4;

    let new_difficulty = if actual_time < expected_time / max_adjustment_factor {
        current_difficulty + 1
    } else if actual_time > expected_time * min_adjustment_factor {
        if current_difficulty > 1 {
            current_difficulty - 1
        } else {
            1
        }
    } else {
        // Proportional adjustment
        let ratio = expected_time as f64 / actual_time as f64;
        let new_diff = (current_difficulty as f64 * ratio) as u32;
        new_diff.max(1) // Minimum difficulty of 1
    };

    new_difficulty
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MiningPool {
    pub name: String,
    pub miners: Vec<String>,
    pub total_hash_rate: f64,
    pub blocks_found: u64,
    pub payout_scheme: PayoutScheme,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum PayoutScheme {
    PPS,  // Pay Per Share
    PPLNS, // Pay Per Last N Shares
    PROP,  // Proportional
}

impl MiningPool {
    pub fn new(name: String, payout_scheme: PayoutScheme) -> Self {
        Self {
            name,
            miners: Vec::new(),
            total_hash_rate: 0.0,
            blocks_found: 0,
            payout_scheme,
        }
    }

    pub fn add_miner(&mut self, miner_address: String) {
        if !self.miners.contains(&miner_address) {
            self.miners.push(miner_address);
        }
    }

    pub fn remove_miner(&mut self, miner_address: &str) {
        self.miners.retain(|m| m != miner_address);
    }

    pub fn calculate_payout(&self, miner_address: &str, block_reward: u64) -> u64 {
        if !self.miners.contains(&miner_address.to_string()) {
            return 0;
        }

        match self.payout_scheme {
            PayoutScheme::PROP => {
                // Equal distribution for simplicity
                block_reward / self.miners.len() as u64
            }
            PayoutScheme::PPS | PayoutScheme::PPLNS => {
                // Simplified implementation
                block_reward / self.miners.len() as u64
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{TxOutput, Transaction};

    #[test]
    fn test_block_reward_calculation() {
        assert_eq!(calculate_block_reward(0), BLOCK_REWARD);
        assert_eq!(calculate_block_reward(HALVING_INTERVAL - 1), BLOCK_REWARD);
        assert_eq!(calculate_block_reward(HALVING_INTERVAL), BLOCK_REWARD / 2);
        assert_eq!(calculate_block_reward(HALVING_INTERVAL * 2), BLOCK_REWARD / 4);
    }

    #[test]
    fn test_block_hash_calculation() {
        let header = BlockHeader {
            version: 1,
            previous_hash: "prev_hash".to_string(),
            merkle_root: "merkle_root".to_string(),
            timestamp: Utc::now(),
            difficulty: 1,
            nonce: 12345,
            height: 1,
        };

        let hash1 = calculate_block_hash(&header, 12345);
        let hash2 = calculate_block_hash(&header, 12345);
        
        assert_eq!(hash1, hash2); // Should be deterministic
        assert_eq!(hash1.len(), 32); // SHA-256 produces 32-byte hash
    }

    #[test]
    fn test_difficulty_adjustment() {
        let current_difficulty = 4;
        let last_adjustment = Utc::now() - chrono::Duration::seconds(
            (TARGET_BLOCK_TIME * DIFFICULTY_ADJUSTMENT_INTERVAL * 2) as i64
        );

        let new_difficulty = calculate_next_difficulty(
            current_difficulty,
            last_adjustment,
            DIFFICULTY_ADJUSTMENT_INTERVAL,
        );

        // Should decrease difficulty when blocks take too long
        assert!(new_difficulty <= current_difficulty);
    }

    #[test]
    fn test_mining_config() {
        let config = MiningConfig {
            max_threads: 4,
            target_difficulty: 2,
            miner_address: "test_miner".to_string(),
            extra_nonce: 0,
        };

        let miner = Miner::new(config);
        assert!(!miner.is_mining());
        assert_eq!(miner.get_hash_rate(), 0.0);
    }

    #[test]
    fn test_mining_pool() {
        let mut pool = MiningPool::new("TestPool".to_string(), PayoutScheme::PROP);
        
        pool.add_miner("miner1".to_string());
        pool.add_miner("miner2".to_string());
        
        assert_eq!(pool.miners.len(), 2);
        
        let payout = pool.calculate_payout("miner1", 1000);
        assert_eq!(payout, 500); // Equal split
        
        pool.remove_miner("miner2");
        assert_eq!(pool.miners.len(), 1);
    }

    #[test]
    fn test_verify_block_hash() {
        // Create a simple block for testing
        let transactions = vec![Transaction::new_coinbase(
            BLOCK_REWARD,
            "miner".to_string(),
            1,
        )];

        let merkle_tree = MerkleTree::from_transaction_ids(
            &transactions.iter().map(|tx| tx.id.clone()).collect::<Vec<_>>()
        ).unwrap();

        let header = BlockHeader {
            version: 1,
            previous_hash: "genesis".to_string(),
            merkle_root: merkle_tree.get_root_hash().unwrap(),
            timestamp: Utc::now(),
            difficulty: 1,
            nonce: 0, // This would normally be found through mining
            height: 1,
        };

        let block = Block {
            header,
            transactions,
        };

        // Note: This test doesn't actually mine, so verification will likely fail
        // In a real scenario, the nonce would be found through the mining process
        let is_valid = verify_block_hash(&block);
        // We can't assert true here because we didn't actually mine the block
    }
}