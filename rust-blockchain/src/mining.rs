use crate::crypto::{double_sha256, hash_difficulty_check};
use crate::error::{BlockchainError, Result};
use crate::merkle_tree::MerkleTree;
use crate::{
    BLOCK_REWARD, Block, BlockHeader, DIFFICULTY_ADJUSTMENT_INTERVAL, HALVING_INTERVAL,
    TARGET_BLOCK_TIME, Transaction,
};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant};

/// Hard upper bound on difficulty (leading zero bits of a 256-bit hash).
pub const MAX_DIFFICULTY: u32 = 255;

/// Maximum difficulty change, in bits, at a single adjustment (a factor of 4).
const MAX_ADJUSTMENT_BITS: i64 = 2;

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
            mining_time: Duration::ZERO,
            current_difficulty: 1,
            last_block_time: None,
        }
    }
}

#[derive(Debug)]
pub struct Miner {
    config: MiningConfig,
    stats: Arc<Mutex<MiningStats>>,
    is_mining: Arc<AtomicBool>,
    hash_counter: Arc<AtomicU64>,
}

impl Miner {
    pub fn new(config: MiningConfig) -> Self {
        Self {
            config,
            stats: Arc::new(Mutex::new(MiningStats::default())),
            is_mining: Arc::new(AtomicBool::new(false)),
            hash_counter: Arc::new(AtomicU64::new(0)),
        }
    }

    pub fn config(&self) -> &MiningConfig {
        &self.config
    }

    /// Build a block containing a coinbase plus `transactions` and search for a
    /// nonce that satisfies `difficulty`.
    pub fn mine_block(
        &self,
        transactions: Vec<Transaction>,
        previous_hash: String,
        height: u64,
        difficulty: u32,
    ) -> Result<Block> {
        if difficulty > MAX_DIFFICULTY {
            return Err(BlockchainError::MiningError(format!(
                "Difficulty {difficulty} exceeds maximum {MAX_DIFFICULTY}"
            )));
        }

        let coinbase_tx = Transaction::new_coinbase(
            calculate_block_reward(height),
            self.config.miner_address.clone(),
            height,
        );

        let mut all_transactions = Vec::with_capacity(transactions.len() + 1);
        all_transactions.push(coinbase_tx);
        all_transactions.extend(transactions);

        let tx_ids: Vec<String> = all_transactions.iter().map(|tx| tx.id.clone()).collect();
        let merkle_root = MerkleTree::from_transaction_ids(&tx_ids)?
            .get_root_hash()
            .unwrap_or_default();

        let mut header = BlockHeader {
            version: 1,
            previous_hash,
            merkle_root,
            timestamp: Utc::now(),
            difficulty,
            nonce: 0,
            height,
        };

        self.is_mining.store(true, Ordering::SeqCst);
        self.hash_counter.store(0, Ordering::SeqCst);
        let start_time = Instant::now();

        let result = self.mine_with_threads(&header, difficulty);
        self.is_mining.store(false, Ordering::SeqCst);
        header.nonce = result?;

        let mining_time = start_time.elapsed();
        let hashes = self.hash_counter.load(Ordering::SeqCst);

        if let Ok(mut stats) = self.stats.lock() {
            stats.blocks_mined += 1;
            stats.total_hashes += hashes;
            stats.mining_time += mining_time;
            let secs = mining_time.as_secs_f64();
            if secs > 0.0 {
                stats.hash_rate = hashes as f64 / secs;
            }
            stats.current_difficulty = difficulty;
            stats.last_block_time = Some(header.timestamp);
        }

        Ok(Block {
            header,
            transactions: all_transactions,
        })
    }

    fn mine_with_threads(&self, header: &BlockHeader, difficulty: u32) -> Result<u64> {
        const BATCH: u64 = 1024;

        let thread_count = self.config.max_threads.max(1) as u64;
        let found_nonce = Arc::new(AtomicU64::new(0));
        let found = Arc::new(AtomicBool::new(false));

        thread::scope(|scope| {
            for thread_id in 0..thread_count {
                let found_nonce = &found_nonce;
                let found = &found;
                let is_mining = &self.is_mining;
                let hash_counter = &self.hash_counter;

                scope.spawn(move || {
                    let mut nonce = thread_id;
                    let mut local_hashes = 0u64;

                    while is_mining.load(Ordering::Relaxed) && !found.load(Ordering::Relaxed) {
                        for _ in 0..BATCH {
                            let hash = calculate_block_hash(header, nonce);
                            local_hashes += 1;
                            if hash_difficulty_check(&hash, difficulty) {
                                if !found.swap(true, Ordering::SeqCst) {
                                    found_nonce.store(nonce, Ordering::SeqCst);
                                }
                                break;
                            }
                            nonce = nonce.wrapping_add(thread_count);
                        }
                        hash_counter.fetch_add(local_hashes, Ordering::Relaxed);
                        local_hashes = 0;
                    }
                });
            }
        });

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
        self.stats.lock().map(|s| s.clone()).unwrap_or_default()
    }

    pub fn get_hash_rate(&self) -> f64 {
        self.get_stats().hash_rate
    }
}

/// Double SHA-256 of the serialized header fields with the given nonce.
pub fn calculate_block_hash(header: &BlockHeader, nonce: u64) -> Vec<u8> {
    let mut data = Vec::with_capacity(4 + 64 + 64 + 8 + 4 + 8 + 8);

    data.extend_from_slice(&header.version.to_be_bytes());
    data.extend_from_slice(header.previous_hash.as_bytes());
    data.extend_from_slice(header.merkle_root.as_bytes());
    data.extend_from_slice(&header.timestamp.timestamp_millis().to_be_bytes());
    data.extend_from_slice(&header.difficulty.to_be_bytes());
    data.extend_from_slice(&nonce.to_be_bytes());
    data.extend_from_slice(&header.height.to_be_bytes());

    double_sha256(&data)
}

/// Search sequentially (single thread) for a valid nonce. Useful for small
/// difficulties such as the genesis block.
pub fn solve_header(header: &mut BlockHeader) {
    let mut nonce = 0u64;
    while !hash_difficulty_check(&calculate_block_hash(header, nonce), header.difficulty) {
        nonce = nonce.wrapping_add(1);
    }
    header.nonce = nonce;
}

pub fn verify_block_hash(block: &Block) -> bool {
    let calculated_hash = calculate_block_hash(&block.header, block.header.nonce);
    hash_difficulty_check(&calculated_hash, block.header.difficulty)
}

pub fn calculate_block_reward(height: u64) -> u64 {
    let halvings = height / HALVING_INTERVAL;
    if halvings >= 64 {
        0
    } else {
        BLOCK_REWARD >> halvings
    }
}

/// Difficulty retarget based on how long the last period actually took.
///
/// Difficulty is measured in leading zero bits, so doubling the work means
/// adding one bit. The change is clamped to +/- 2 bits (a factor of 4).
pub fn retarget_difficulty(current_difficulty: u32, actual_secs: u64, expected_secs: u64) -> u32 {
    let actual = actual_secs.max(1) as f64;
    let expected = expected_secs.max(1) as f64;
    let delta = (expected / actual)
        .log2()
        .round()
        .clamp(-(MAX_ADJUSTMENT_BITS as f64), MAX_ADJUSTMENT_BITS as f64) as i64;
    (i64::from(current_difficulty) + delta).clamp(1, i64::from(MAX_DIFFICULTY)) as u32
}

/// Difficulty for the next period given the timestamp of the first block of
/// the period that just ended, using the default chain parameters.
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
        .num_seconds()
        .max(0) as u64;

    retarget_difficulty(current_difficulty, actual_time, expected_time)
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
    /// Pay per share.
    Pps,
    /// Pay per last N shares.
    Pplns,
    /// Proportional.
    Prop,
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

    /// Payout for a miner. All schemes currently split the reward equally.
    pub fn calculate_payout(&self, miner_address: &str, block_reward: u64) -> u64 {
        if !self.miners.iter().any(|m| m == miner_address) {
            return 0;
        }

        match self.payout_scheme {
            PayoutScheme::Prop | PayoutScheme::Pps | PayoutScheme::Pplns => {
                block_reward / self.miners.len() as u64
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_header(difficulty: u32) -> BlockHeader {
        BlockHeader {
            version: 1,
            previous_hash: "0".repeat(64),
            merkle_root: "merkle_root".to_string(),
            timestamp: Utc::now(),
            difficulty,
            nonce: 0,
            height: 1,
        }
    }

    fn test_miner(threads: usize) -> Miner {
        Miner::new(MiningConfig {
            max_threads: threads,
            target_difficulty: 4,
            miner_address: "miner".to_string(),
            extra_nonce: 0,
        })
    }

    #[test]
    fn test_block_reward_calculation() {
        assert_eq!(calculate_block_reward(0), BLOCK_REWARD);
        assert_eq!(calculate_block_reward(HALVING_INTERVAL - 1), BLOCK_REWARD);
        assert_eq!(calculate_block_reward(HALVING_INTERVAL), BLOCK_REWARD / 2);
        assert_eq!(
            calculate_block_reward(HALVING_INTERVAL * 2),
            BLOCK_REWARD / 4
        );
        assert_eq!(calculate_block_reward(HALVING_INTERVAL * 64), 0);
    }

    #[test]
    fn test_block_hash_calculation() {
        let header = test_header(1);
        let hash1 = calculate_block_hash(&header, 12345);
        let hash2 = calculate_block_hash(&header, 12345);
        let hash3 = calculate_block_hash(&header, 12346);

        assert_eq!(hash1, hash2);
        assert_ne!(hash1, hash3);
        assert_eq!(hash1.len(), 32);
    }

    #[test]
    fn test_retarget_difficulty() {
        // On target: unchanged.
        assert_eq!(retarget_difficulty(10, 1000, 1000), 10);
        // Twice as fast: one more bit.
        assert_eq!(retarget_difficulty(10, 500, 1000), 11);
        // Extremely fast: clamped to +2.
        assert_eq!(retarget_difficulty(10, 1, 1000), 12);
        // Twice as slow: one less bit.
        assert_eq!(retarget_difficulty(10, 2000, 1000), 9);
        // Extremely slow: clamped to -2, never below 1.
        assert_eq!(retarget_difficulty(10, 1_000_000, 1000), 8);
        assert_eq!(retarget_difficulty(1, 1_000_000, 1000), 1);
    }

    #[test]
    fn test_difficulty_adjustment() {
        let current_difficulty = 4;
        let expected = TARGET_BLOCK_TIME * DIFFICULTY_ADJUSTMENT_INTERVAL;

        let slow_start = Utc::now() - chrono::Duration::seconds((expected * 2) as i64);
        let slow = calculate_next_difficulty(
            current_difficulty,
            slow_start,
            DIFFICULTY_ADJUSTMENT_INTERVAL,
        );
        assert_eq!(slow, current_difficulty - 1);

        let fast_start = Utc::now() - chrono::Duration::seconds((expected / 2) as i64);
        let fast = calculate_next_difficulty(
            current_difficulty,
            fast_start,
            DIFFICULTY_ADJUSTMENT_INTERVAL,
        );
        assert_eq!(fast, current_difficulty + 1);

        // Not at an adjustment boundary: unchanged.
        assert_eq!(
            calculate_next_difficulty(current_difficulty, fast_start, 10),
            current_difficulty
        );
    }

    #[test]
    fn test_mining_config() {
        let miner = test_miner(4);
        assert!(!miner.is_mining());
        assert_eq!(miner.get_hash_rate(), 0.0);
        assert_eq!(miner.config().max_threads, 4);
    }

    #[test]
    fn test_mine_block_satisfies_difficulty() {
        let miner = test_miner(2);
        let block = miner.mine_block(vec![], "0".repeat(64), 1, 8).unwrap();

        assert!(verify_block_hash(&block));
        assert!(crate::crypto::leading_zero_bits(&hex::decode(block.hash()).unwrap()) >= 8);
        assert_eq!(block.transactions.len(), 1);
        assert!(block.transactions[0].is_coinbase());
        assert_eq!(block.transactions[0].outputs[0].value, BLOCK_REWARD);

        let stats = miner.get_stats();
        assert_eq!(stats.blocks_mined, 1);
        assert!(stats.total_hashes >= 1);
        assert!(!miner.is_mining());
    }

    #[test]
    fn test_mine_block_zero_threads_still_works() {
        let miner = test_miner(0);
        let block = miner.mine_block(vec![], "0".repeat(64), 1, 4).unwrap();
        assert!(verify_block_hash(&block));
    }

    #[test]
    fn test_solve_header() {
        let mut header = test_header(10);
        solve_header(&mut header);
        assert!(hash_difficulty_check(
            &calculate_block_hash(&header, header.nonce),
            10
        ));
    }

    #[test]
    fn test_mining_pool() {
        let mut pool = MiningPool::new("TestPool".to_string(), PayoutScheme::Prop);

        pool.add_miner("miner1".to_string());
        pool.add_miner("miner2".to_string());
        pool.add_miner("miner2".to_string());
        assert_eq!(pool.miners.len(), 2);

        assert_eq!(pool.calculate_payout("miner1", 1000), 500);
        assert_eq!(pool.calculate_payout("stranger", 1000), 0);

        pool.remove_miner("miner2");
        assert_eq!(pool.miners.len(), 1);
    }

    #[test]
    fn test_verify_block_hash_rejects_bad_nonce() {
        let miner = test_miner(1);
        let mut block = miner.mine_block(vec![], "0".repeat(64), 1, 12).unwrap();
        assert!(verify_block_hash(&block));

        // Find a nonce that does not satisfy the difficulty.
        let mut nonce = block.header.nonce.wrapping_add(1);
        while hash_difficulty_check(&calculate_block_hash(&block.header, nonce), 12) {
            nonce = nonce.wrapping_add(1);
        }
        block.header.nonce = nonce;
        assert!(!verify_block_hash(&block));
    }
}
