pub mod blockchain;
pub mod crypto;
pub mod merkle_tree;
pub mod mining;
pub mod network;
pub mod transaction;
pub mod utxo;
pub mod wallet;
pub mod bip39_wallet;
pub mod mempool;
pub mod smart_contracts;
pub mod api;
pub mod error;
pub mod persistence;

pub use blockchain::*;
pub use crypto::*;
pub use error::*;
pub use transaction::*;
pub use utxo::*;
pub use wallet::*;

use std::collections::HashMap;
use serde::{Deserialize, Serialize};
use chrono::{DateTime, Utc};

pub type Address = String;
pub type Hash = String;
pub type Amount = u64;
pub type Signature = Vec<u8>;
pub type PublicKey = Vec<u8>;
pub type PrivateKey = Vec<u8>;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct BlockHeader {
    pub version: u32,
    pub previous_hash: Hash,
    pub merkle_root: Hash,
    pub timestamp: DateTime<Utc>,
    pub difficulty: u32,
    pub nonce: u64,
    pub height: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct Block {
    pub header: BlockHeader,
    pub transactions: Vec<Transaction>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct Transaction {
    pub id: Hash,
    pub inputs: Vec<TxInput>,
    pub outputs: Vec<TxOutput>,
    pub lock_time: u64,
    pub timestamp: DateTime<Utc>,
    pub fee: Amount,
    pub signature: Option<Signature>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct TxInput {
    pub previous_output: Option<OutPoint>,
    pub script_sig: Vec<u8>,
    pub sequence: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct TxOutput {
    pub value: Amount,
    pub script_pubkey: Vec<u8>,
    pub address: Address,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct OutPoint {
    pub txid: Hash,
    pub vout: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UTXO {
    pub outpoint: OutPoint,
    pub output: TxOutput,
    pub height: u64,
    pub is_coinbase: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChainState {
    pub height: u64,
    pub difficulty: u32,
    pub total_work: u64,
    pub best_block_hash: Hash,
    pub utxo_set: HashMap<OutPoint, UTXO>,
}

impl Default for ChainState {
    fn default() -> Self {
        Self {
            height: 0,
            difficulty: 1,
            total_work: 0,
            best_block_hash: String::new(),
            utxo_set: HashMap::new(),
        }
    }
}

// Constants
pub const BLOCK_REWARD: Amount = 50_00000000; // 50 coins with 8 decimal precision
pub const HALVING_INTERVAL: u64 = 210_000;
pub const TARGET_BLOCK_TIME: u64 = 600; // 10 minutes in seconds
pub const DIFFICULTY_ADJUSTMENT_INTERVAL: u64 = 2016; // Adjust every ~2 weeks
pub const MAX_BLOCK_SIZE: usize = 1_000_000; // 1MB
pub const COINBASE_MATURITY: u64 = 100; // Blocks before coinbase can be spent