//! A small but functional proof-of-work blockchain.
//!
//! The crate provides a UTXO based ledger with ECDSA (secp256k1) signed
//! transactions, a Merkle tree, a multi-threaded miner, a fee-prioritised
//! mempool, an embedded database for persistence, BIP39 wallets, a
//! WebAssembly smart-contract VM, a libp2p networking layer and an HTTP API.
//!
//! ```
//! use rust_blockchain::{Transaction, BLOCK_REWARD};
//!
//! let coinbase = Transaction::new_coinbase(BLOCK_REWARD, "miner".to_string(), 1);
//! assert!(coinbase.is_coinbase());
//! assert_eq!(coinbase.total_output_value(), BLOCK_REWARD);
//! ```

pub mod api;
pub mod bip39_wallet;
pub mod blockchain;
pub mod codec;
pub mod crypto;
pub mod error;
pub mod mempool;
pub mod merkle_tree;
pub mod mining;
pub mod network;
pub mod node;
pub mod persistence;
pub mod smart_contracts;
pub mod transaction;
pub mod utxo;
pub mod wallet;

pub use blockchain::*;
pub use crypto::*;
pub use error::*;
pub use transaction::*;
pub use utxo::*;
pub use wallet::*;

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

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
    /// Number of leading zero bits the header hash must have.
    pub difficulty: u32,
    pub nonce: u64,
    pub height: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct Block {
    pub header: BlockHeader,
    pub transactions: Vec<Transaction>,
}

impl Block {
    /// Hex encoded proof-of-work hash of the block header.
    pub fn hash(&self) -> Hash {
        crypto::hash_to_string(&mining::calculate_block_hash(
            &self.header,
            self.header.nonce,
        ))
    }
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

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Hash, PartialOrd, Ord)]
pub struct OutPoint {
    pub txid: Hash,
    pub vout: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
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

/// 50 coins with 8 decimal places of precision.
pub const BLOCK_REWARD: Amount = 5_000_000_000;
pub const HALVING_INTERVAL: u64 = 210_000;
/// Target block time in seconds.
pub const TARGET_BLOCK_TIME: u64 = 600;
/// Number of blocks between difficulty adjustments.
pub const DIFFICULTY_ADJUSTMENT_INTERVAL: u64 = 2016;
/// Maximum serialized block size in bytes.
pub const MAX_BLOCK_SIZE: usize = 1_000_000;
/// Number of blocks before a coinbase output can be spent.
pub const COINBASE_MATURITY: u64 = 100;
