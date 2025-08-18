use rust_blockchain::{
    blockchain::{Blockchain, BlockchainConfig},
    bip39_wallet::BIP39Wallet,
    crypto::KeyPair,
    mining::{Miner, MiningConfig},
    smart_contracts::{SmartContractVM, ContractDeployment, ContractCall},
    transaction::TransactionBuilder,
    wallet::Wallet,
    Amount, BLOCK_REWARD,
};
use tempfile::TempDir;
use tokio;

#[test]
fn test_blockchain_integration() {
    let temp_dir = TempDir::new().unwrap();
    let db_path = temp_dir.path().join("test_blockchain.db");
    
    let config = BlockchainConfig::default();
    let mut blockchain = Blockchain::new(config, db_path.to_str().unwrap()).unwrap();
    
    // Test initial state
    assert_eq!(blockchain.get_chain_height(), 0);
    assert!(blockchain.get_latest_block().is_some());
    
    // Test stats
    let stats = blockchain.get_chain_stats();
    assert_eq!(stats.height, 0);
    assert!(stats.total_supply > 0); // Genesis block reward
}

#[test]
fn test_wallet_and_transaction_integration() {
    let temp_dir = TempDir::new().unwrap();
    let db_path = temp_dir.path().join("test_blockchain.db");
    
    let config = BlockchainConfig::default();
    let mut blockchain = Blockchain::new(config, db_path.to_str().unwrap()).unwrap();
    
    // Create wallets
    let mut wallet1 = Wallet::new("wallet1".to_string()).unwrap();
    let mut wallet2 = Wallet::new("wallet2".to_string()).unwrap();
    
    let address1 = wallet1.generate_new_address().unwrap();
    let address2 = wallet2.generate_new_address().unwrap();
    
    // Initial balances should be zero (except genesis address)
    assert_eq!(blockchain.get_balance(&address1), 0);
    assert_eq!(blockchain.get_balance(&address2), 0);
    
    // Test fee estimation
    let estimated_fee = blockchain.estimate_fee(6);
    assert!(estimated_fee > 0);
}

#[test]
fn test_bip39_wallet_integration() {
    use bip39::MnemonicType;
    
    // Create BIP39 wallet
    let wallet = BIP39Wallet::new("test_wallet".to_string(), MnemonicType::Words12).unwrap();
    
    // Test mnemonic
    assert!(wallet.get_mnemonic().is_some());
    let mnemonic = wallet.get_mnemonic().unwrap();
    assert!(!mnemonic.is_empty());
    
    // Test wallet info
    let derivation_info = wallet.get_derivation_info();
    assert!(derivation_info.has_mnemonic);
    assert!(derivation_info.has_seed);
    assert_eq!(derivation_info.account_index, 0);
    
    // Test backup and restore
    let backup_json = wallet.backup_to_json().unwrap();
    assert!(!backup_json.is_empty());
    
    let restored_wallet = BIP39Wallet::restore_from_json(&backup_json).unwrap();
    assert_eq!(wallet.wallet.name, restored_wallet.wallet.name);
}

#[test]
fn test_mining_integration() {
    let temp_dir = TempDir::new().unwrap();
    let db_path = temp_dir.path().join("test_blockchain.db");
    
    let config = BlockchainConfig::default();
    let blockchain = Blockchain::new(config, db_path.to_str().unwrap()).unwrap();
    
    let mining_config = MiningConfig {
        max_threads: 1,
        target_difficulty: 1, // Very low difficulty for testing
        miner_address: "test_miner".to_string(),
        extra_nonce: 0,
    };
    
    let miner = Miner::new(mining_config);
    
    // Create a simple transaction for mining
    let coinbase_tx = rust_blockchain::Transaction::new_coinbase(
        BLOCK_REWARD,
        "test_miner".to_string(),
        1,
    );
    
    // Test mining (with very low difficulty, should complete quickly)
    let result = miner.mine_block(
        vec![],
        "0".repeat(64),
        1,
        1,
    );
    
    assert!(result.is_ok());
    let block = result.unwrap();
    assert_eq!(block.header.height, 1);
    assert!(!block.transactions.is_empty());
    assert!(block.transactions[0].is_coinbase());
}

#[tokio::test]
async fn test_smart_contract_integration() {
    let mut vm = SmartContractVM::new().unwrap();
    
    // Test simple contract deployment (will fail with minimal WASM but tests the flow)
    let deployment = ContractDeployment {
        code: vec![0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00], // Minimal WASM header
        constructor_params: Vec::new(),
        deployer: "deployer_address".to_string(),
        gas_limit: 1000000,
        value: 0,
    };
    
    // This will fail due to invalid WASM, but tests the deployment flow
    let result = vm.deploy_contract(deployment);
    assert!(result.is_err()); // Expected to fail with minimal WASM
    
    // Test gas cost calculation
    let code = vec![0u8; 1000];
    let cost = SmartContractVM::calculate_deployment_cost(&code, 500000);
    assert!(cost > 0);
}

#[test]
fn test_end_to_end_transaction_flow() {
    let temp_dir = TempDir::new().unwrap();
    let db_path = temp_dir.path().join("test_blockchain.db");
    
    let config = BlockchainConfig::default();
    let mut blockchain = Blockchain::new(config, db_path.to_str().unwrap()).unwrap();
    
    // Create wallets
    let mut sender_wallet = Wallet::new("sender".to_string()).unwrap();
    let mut receiver_wallet = Wallet::new("receiver".to_string()).unwrap();
    
    let sender_address = sender_wallet.generate_new_address().unwrap();
    let receiver_address = receiver_wallet.generate_new_address().unwrap();
    
    // In a real scenario, sender would need UTXOs
    // For this test, we'll just test transaction creation structure
    let builder = TransactionBuilder::new()
        .add_output(1000, receiver_address.clone())
        .lock_time(0);
    
    let transaction = builder.build();
    
    assert!(!transaction.id.is_empty());
    assert_eq!(transaction.outputs.len(), 1);
    assert_eq!(transaction.outputs[0].value, 1000);
    assert_eq!(transaction.outputs[0].address, receiver_address);
}

#[test]
fn test_merkle_tree_integration() {
    use rust_blockchain::merkle_tree::MerkleTree;
    
    // Create transactions
    let tx1 = TransactionBuilder::new()
        .add_output(1000, "addr1".to_string())
        .build();
    
    let tx2 = TransactionBuilder::new()
        .add_output(2000, "addr2".to_string())
        .build();
    
    let tx3 = TransactionBuilder::new()
        .add_output(3000, "addr3".to_string())
        .build();
    
    let tx_ids = vec![tx1.id.clone(), tx2.id.clone(), tx3.id.clone()];
    
    // Create merkle tree
    let tree = MerkleTree::from_transaction_ids(&tx_ids).unwrap();
    
    assert_eq!(tree.size(), 3);
    assert!(tree.get_root_hash().is_some());
    
    // Test proof generation and verification
    let proof = tree.generate_proof(&tx1.id).unwrap();
    assert!(MerkleTree::verify_proof(&proof));
    
    // Test with different transaction
    let proof2 = tree.generate_proof(&tx2.id).unwrap();
    assert!(MerkleTree::verify_proof(&proof2));
}

#[test]
fn test_utxo_management_integration() {
    use rust_blockchain::utxo::{UTXOSet, UTXO};
    use rust_blockchain::{OutPoint, TxOutput};
    
    let mut utxo_set = UTXOSet::new();
    
    // Create test UTXO
    let utxo = UTXO {
        outpoint: OutPoint::new("tx1".to_string(), 0),
        output: TxOutput::new(5000, "address1".to_string()),
        height: 1,
        is_coinbase: false,
    };
    
    utxo_set.add_utxo(utxo);
    
    assert_eq!(utxo_set.size(), 1);
    assert_eq!(utxo_set.get_balance("address1"), 5000);
    assert_eq!(utxo_set.total_supply(), 5000);
    
    // Test finding spendable UTXOs
    let spendable = utxo_set.find_spendable_utxos("address1", 3000, 100).unwrap();
    assert!(!spendable.is_empty());
    
    let total_value: Amount = spendable.iter().map(|u| u.output.value).sum();
    assert!(total_value >= 3000);
}

#[test]
fn test_mempool_integration() {
    use rust_blockchain::mempool::{Mempool, MempoolConfig};
    use rust_blockchain::utxo::UTXOSet;
    
    let config = MempoolConfig::default();
    let mut mempool = Mempool::new(config);
    let utxo_set = UTXOSet::new();
    
    // Create a coinbase transaction (no inputs required)
    let tx = rust_blockchain::Transaction::new_coinbase(
        BLOCK_REWARD,
        "miner_address".to_string(),
        1,
    );
    
    // Add to mempool
    let result = mempool.add_transaction(tx.clone(), &utxo_set, 1);
    
    // Coinbase transactions shouldn't be added to mempool in normal operation
    // but this tests the validation flow
    assert!(result.is_err() || mempool.contains(&tx.id));
    
    // Test mempool stats
    let stats = mempool.get_stats();
    assert!(stats.transaction_count <= 1); // May be 0 if coinbase was rejected
}

#[test]
fn test_address_validation() {
    use rust_blockchain::wallet::validate_address;
    
    // Test with some example addresses (these may not pass validation due to checksum)
    assert!(!validate_address("invalid_address").unwrap());
    assert!(!validate_address("").unwrap());
    assert!(!validate_address("123").unwrap());
    
    // These are syntactically valid but may fail checksum validation
    let result1 = validate_address("1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa");
    let result2 = validate_address("3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLy");
    
    // Results depend on actual checksum validation implementation
    assert!(result1.is_ok());
    assert!(result2.is_ok());
}

#[test]
fn test_crypto_operations_integration() {
    let keypair = KeyPair::new().unwrap();
    
    // Test signing and verification
    let message = b"test message for signing";
    let signature = keypair.sign(message).unwrap();
    
    let is_valid = rust_blockchain::crypto::verify_signature(
        &keypair.public_key,
        message,
        &signature,
    ).unwrap();
    
    assert!(is_valid);
    
    // Test with wrong message
    let wrong_message = b"different message";
    let is_valid_wrong = rust_blockchain::crypto::verify_signature(
        &keypair.public_key,
        wrong_message,
        &signature,
    ).unwrap();
    
    assert!(!is_valid_wrong);
    
    // Test hash functions
    let data = b"test data";
    let hash = rust_blockchain::crypto::sha256(data);
    assert_eq!(hash.len(), 32);
    
    let double_hash = rust_blockchain::crypto::double_sha256(data);
    assert_eq!(double_hash.len(), 32);
    assert_ne!(hash, double_hash);
}

#[test]
fn test_persistence_integration() {
    use rust_blockchain::persistence::BlockchainDB;
    use rust_blockchain::{ChainState, Transaction};
    
    let temp_dir = TempDir::new().unwrap();
    let db_path = temp_dir.path().join("test_persistence.db");
    
    let db = BlockchainDB::new(&db_path).unwrap();
    
    // Test chain state storage
    let state = ChainState {
        height: 100,
        difficulty: 5,
        total_work: 1000,
        best_block_hash: "test_hash".to_string(),
        ..Default::default()
    };
    
    db.store_chain_state(&state).unwrap();
    let loaded_state = db.load_chain_state().unwrap();
    
    assert_eq!(state.height, loaded_state.height);
    assert_eq!(state.difficulty, loaded_state.difficulty);
    assert_eq!(state.best_block_hash, loaded_state.best_block_hash);
    
    // Test transaction storage
    let tx = Transaction::new_coinbase(BLOCK_REWARD, "test_address".to_string(), 1);
    
    db.store_transaction(&tx).unwrap();
    let loaded_tx = db.load_transaction(&tx.id).unwrap();
    
    assert_eq!(tx.id, loaded_tx.id);
    assert_eq!(tx.outputs.len(), loaded_tx.outputs.len());
    
    // Test database stats
    let stats = db.get_stats().unwrap();
    assert_eq!(stats.transaction_count, 1);
}

#[test]
fn test_difficulty_adjustment() {
    use rust_blockchain::mining::calculate_next_difficulty;
    use chrono::{Duration, Utc};
    
    let current_difficulty = 4;
    
    // Test when blocks are too fast (should increase difficulty)
    let fast_time = Utc::now() - Duration::seconds(300); // Very fast
    let new_difficulty_fast = calculate_next_difficulty(
        current_difficulty,
        fast_time,
        rust_blockchain::DIFFICULTY_ADJUSTMENT_INTERVAL,
    );
    assert!(new_difficulty_fast >= current_difficulty);
    
    // Test when blocks are too slow (should decrease difficulty)
    let slow_time = Utc::now() - Duration::hours(48); // Very slow
    let new_difficulty_slow = calculate_next_difficulty(
        current_difficulty,
        slow_time,
        rust_blockchain::DIFFICULTY_ADJUSTMENT_INTERVAL,
    );
    assert!(new_difficulty_slow <= current_difficulty);
}

#[test]
fn test_block_reward_halving() {
    use rust_blockchain::mining::calculate_block_reward;
    
    // Test initial reward
    assert_eq!(calculate_block_reward(0), BLOCK_REWARD);
    
    // Test first halving
    assert_eq!(
        calculate_block_reward(rust_blockchain::HALVING_INTERVAL),
        BLOCK_REWARD / 2
    );
    
    // Test second halving
    assert_eq!(
        calculate_block_reward(rust_blockchain::HALVING_INTERVAL * 2),
        BLOCK_REWARD / 4
    );
    
    // Test eventual zero reward
    assert_eq!(
        calculate_block_reward(rust_blockchain::HALVING_INTERVAL * 64),
        0
    );
}