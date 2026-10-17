use rust_blockchain::{
    Amount, BLOCK_REWARD, COINBASE_MATURITY, Transaction,
    bip39_wallet::{BIP39Wallet, WordCount},
    blockchain::{Blockchain, BlockchainConfig, GENESIS_ADDRESS},
    crypto::KeyPair,
    mining::{Miner, MiningConfig, calculate_block_reward, verify_block_hash},
    smart_contracts::{
        ContractCall, ContractDeployment, ContractParameter, SimpleContractCompiler,
        SmartContractVM,
    },
    transaction::TransactionBuilder,
    wallet::Wallet,
};
use tempfile::TempDir;

/// Low difficulty so mining in debug builds is fast.
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

fn miner_for(address: &str) -> Miner {
    Miner::new(MiningConfig {
        max_threads: 1,
        target_difficulty: 4,
        miner_address: address.to_string(),
        extra_nonce: 0,
    })
}

fn mine_blocks(chain: &mut Blockchain, miner: &Miner, count: u64) {
    for _ in 0..count {
        let template = chain.block_template(900_000, 1000);
        let block = miner
            .mine_block(
                template.transactions,
                template.previous_hash,
                template.height,
                template.difficulty,
            )
            .unwrap();
        chain.add_block(block).unwrap();
    }
}

#[test]
fn test_blockchain_integration() {
    let (_dir, blockchain) = new_chain();

    assert_eq!(blockchain.get_chain_height(), 0);
    assert!(blockchain.get_latest_block().is_some());

    let stats = blockchain.get_chain_stats();
    assert_eq!(stats.height, 0);
    assert_eq!(stats.total_supply, BLOCK_REWARD);
    assert_eq!(blockchain.get_balance(GENESIS_ADDRESS), BLOCK_REWARD);
}

#[test]
fn test_wallet_and_transaction_integration() {
    let (_dir, blockchain) = new_chain();

    let mut wallet1 = Wallet::new("wallet1".to_string()).unwrap();
    let mut wallet2 = Wallet::new("wallet2".to_string()).unwrap();
    let address1 = wallet1.generate_new_address().unwrap();
    let address2 = wallet2.generate_new_address().unwrap();

    assert_eq!(blockchain.get_balance(&address1), 0);
    assert_eq!(blockchain.get_balance(&address2), 0);
    assert!(blockchain.estimate_fee(6) > 0);

    // No funds: creating a transaction must fail cleanly.
    assert!(
        wallet1
            .create_transaction(address2, 1_000, 100, blockchain.get_utxo_set(), 0)
            .is_err()
    );
}

#[test]
fn test_bip39_wallet_integration() {
    let wallet = BIP39Wallet::new("test_wallet".to_string(), WordCount::Words12).unwrap();

    let mnemonic = wallet.get_mnemonic().unwrap();
    assert_eq!(mnemonic.split_whitespace().count(), 12);
    assert!(BIP39Wallet::validate_mnemonic(mnemonic));

    let derivation_info = wallet.get_derivation_info();
    assert!(derivation_info.has_mnemonic);
    assert!(derivation_info.has_seed);
    assert_eq!(derivation_info.account_index, 0);

    let backup_json = wallet.backup_to_json().unwrap();
    let restored_wallet = BIP39Wallet::restore_from_json(&backup_json).unwrap();
    assert_eq!(wallet.wallet.name, restored_wallet.wallet.name);
    assert_eq!(wallet.wallet.addresses, restored_wallet.wallet.addresses);
}

#[test]
fn test_mining_integration() {
    let miner = miner_for("test_miner");

    let block = miner.mine_block(vec![], "0".repeat(64), 1, 4).unwrap();

    assert_eq!(block.header.height, 1);
    assert_eq!(block.transactions.len(), 1);
    assert!(block.transactions[0].is_coinbase());
    assert_eq!(block.transactions[0].outputs[0].address, "test_miner");
    assert!(verify_block_hash(&block));
    assert_eq!(miner.get_stats().blocks_mined, 1);
}

/// Full flow: mine to a wallet, wait for coinbase maturity, spend through the
/// mempool, mine the spend and check every balance.
#[test]
fn test_end_to_end_transaction_flow() {
    let (_dir, mut chain) = new_chain();

    let mut sender = Wallet::new("sender".to_string()).unwrap();
    let mut receiver = Wallet::new("receiver".to_string()).unwrap();
    let sender_address = sender.generate_new_address().unwrap();
    let receiver_address = receiver.generate_new_address().unwrap();

    let sender_miner = miner_for(&sender_address);
    mine_blocks(&mut chain, &sender_miner, 1);
    // Bury the first coinbase until it is spendable, crediting someone else.
    let other_miner = miner_for("other_miner");
    mine_blocks(&mut chain, &other_miner, COINBASE_MATURITY);
    assert_eq!(chain.get_chain_height(), COINBASE_MATURITY + 1);

    let reward = calculate_block_reward(1);
    assert_eq!(sender.get_balance(chain.get_utxo_set()), reward);

    let amount: Amount = 10 * 100_000_000;
    let fee: Amount = 10_000;
    let tx = sender
        .create_transaction(
            receiver_address.clone(),
            amount,
            fee,
            chain.get_utxo_set(),
            chain.get_chain_height(),
        )
        .unwrap();
    chain.add_transaction(tx.clone()).unwrap();
    assert_eq!(chain.get_chain_stats().mempool_size, 1);

    // A double spend of the same coin is rejected by the mempool.
    let double_spend = sender
        .create_transaction(
            "someone_else".to_string(),
            amount,
            fee,
            chain.get_utxo_set(),
            chain.get_chain_height(),
        )
        .unwrap();
    assert!(chain.add_transaction(double_spend).is_err());

    // Mine the transaction; the miner collects the fee.
    let fee_miner = miner_for("fee_miner");
    let template = chain.block_template(900_000, 1000);
    assert_eq!(template.transactions.len(), 1);
    let mut block = fee_miner
        .mine_block(
            template.transactions,
            template.previous_hash,
            template.height,
            template.difficulty,
        )
        .unwrap();
    assert_eq!(block.transactions.len(), 2);
    chain.add_block(block.clone()).unwrap();

    assert_eq!(chain.get_chain_stats().mempool_size, 0);
    assert_eq!(receiver.get_balance(chain.get_utxo_set()), amount);
    assert_eq!(
        sender.get_balance(chain.get_utxo_set()),
        reward - amount - fee
    );
    assert!(chain.get_transaction(&tx.id).is_some());
    assert!(chain.verify_chain().is_ok());

    // Replaying the same block is rejected.
    block.header.nonce = block.header.nonce.wrapping_add(0);
    assert!(chain.add_block(block).is_err());
}

#[test]
fn test_reopen_preserves_balances() {
    let temp_dir = TempDir::new().unwrap();
    let path = temp_dir.path().join("chain.db");
    {
        let mut chain = Blockchain::new(test_config(), &path).unwrap();
        mine_blocks(&mut chain, &miner_for("persisted"), 3);
    }
    let chain = Blockchain::new(test_config(), &path).unwrap();
    assert_eq!(chain.get_chain_height(), 3);
    assert_eq!(
        chain.get_balance("persisted"),
        3 * calculate_block_reward(1)
    );
    assert!(chain.verify_chain().is_ok());
}

#[test]
fn test_smart_contract_integration() {
    let mut vm = SmartContractVM::new().unwrap();

    // Garbage bytes are not a WebAssembly module.
    let invalid = ContractDeployment {
        code: vec![0xde, 0xad, 0xbe, 0xef],
        constructor_params: Vec::new(),
        deployer: "deployer_address".to_string(),
        gas_limit: 1_000_000,
        value: 0,
    };
    assert!(vm.deploy_contract(invalid).is_err());

    let address = vm
        .deploy_contract(ContractDeployment {
            code: SimpleContractCompiler::compile_simple_storage(),
            constructor_params: Vec::new(),
            deployer: "deployer_address".to_string(),
            gas_limit: 1_000_000,
            value: 0,
        })
        .unwrap();

    let result = vm
        .call_contract(ContractCall {
            contract_address: address.clone(),
            caller: "caller".to_string(),
            function_name: "add".to_string(),
            parameters: vec![ContractParameter::U64(7)],
            gas_limit: 100_000,
            value: 0,
        })
        .unwrap();
    assert!(result.success);
    assert_eq!(vm.get_storage_slot(&address, 0), Some(7));

    let cost = SmartContractVM::calculate_deployment_cost(&[0u8; 1000], 500_000);
    assert!(cost > 500_000);
}

#[test]
fn test_merkle_tree_integration() {
    use rust_blockchain::merkle_tree::MerkleTree;

    let txs: Vec<Transaction> = (1..=3)
        .map(|i| {
            TransactionBuilder::new()
                .add_output(i * 1000, format!("addr{i}"))
                .build()
        })
        .collect();
    let tx_ids: Vec<String> = txs.iter().map(|tx| tx.id.clone()).collect();

    let tree = MerkleTree::from_transaction_ids(&tx_ids).unwrap();
    assert_eq!(tree.size(), 3);
    assert!(tree.get_root_hash().is_some());

    for id in &tx_ids {
        let proof = tree.generate_proof(id).unwrap();
        assert!(MerkleTree::verify_proof(&proof));
    }
}

#[test]
fn test_utxo_management_integration() {
    use rust_blockchain::utxo::{UTXO, UTXOSet};
    use rust_blockchain::{OutPoint, TxOutput};

    let mut utxo_set = UTXOSet::new();
    utxo_set.add_utxo(UTXO {
        outpoint: OutPoint::new("tx1".to_string(), 0),
        output: TxOutput::new(5000, "address1".to_string()),
        height: 1,
        is_coinbase: false,
    });

    assert_eq!(utxo_set.size(), 1);
    assert_eq!(utxo_set.get_balance("address1"), 5000);
    assert_eq!(utxo_set.total_supply(), 5000);

    let spendable = utxo_set
        .find_spendable_utxos("address1", 3000, 100)
        .unwrap();
    let total_value: Amount = spendable.iter().map(|u| u.output.value).sum();
    assert!(total_value >= 3000);
}

#[test]
fn test_mempool_integration() {
    use rust_blockchain::mempool::{Mempool, MempoolConfig};
    use rust_blockchain::utxo::UTXOSet;

    let mut mempool = Mempool::new(MempoolConfig::default());
    let utxo_set = UTXOSet::new();

    let tx = Transaction::new_coinbase(BLOCK_REWARD, "miner_address".to_string(), 1);
    assert!(mempool.add_transaction(tx.clone(), &utxo_set, 1).is_err());
    assert!(!mempool.contains(&tx.id));
    assert_eq!(mempool.get_stats().transaction_count, 0);
}

#[test]
fn test_address_validation() {
    use rust_blockchain::wallet::validate_address;

    assert!(!validate_address("invalid_address").unwrap());
    assert!(!validate_address("").unwrap());
    assert!(!validate_address("123").unwrap());

    assert!(validate_address("1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa").unwrap());
    assert!(validate_address("3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLy").unwrap());
    assert!(validate_address(&KeyPair::new().unwrap().address()).unwrap());
}

#[test]
fn test_crypto_operations_integration() {
    let keypair = KeyPair::new().unwrap();
    let message = b"test message for signing";
    let signature = keypair.sign(message).unwrap();

    assert!(
        rust_blockchain::crypto::verify_signature(&keypair.public_key, message, &signature)
            .unwrap()
    );
    assert!(
        !rust_blockchain::crypto::verify_signature(
            &keypair.public_key,
            b"different message",
            &signature
        )
        .unwrap()
    );

    let hash = rust_blockchain::crypto::sha256(b"test data");
    let double_hash = rust_blockchain::crypto::double_sha256(b"test data");
    assert_eq!(hash.len(), 32);
    assert_eq!(double_hash.len(), 32);
    assert_ne!(hash, double_hash);
}

#[test]
fn test_persistence_integration() {
    use rust_blockchain::ChainState;
    use rust_blockchain::persistence::BlockchainDB;

    let temp_dir = TempDir::new().unwrap();
    let db = BlockchainDB::new(temp_dir.path().join("test_persistence.db")).unwrap();

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

    let tx = Transaction::new_coinbase(BLOCK_REWARD, "test_address".to_string(), 1);
    db.store_transaction(&tx).unwrap();
    assert_eq!(db.load_transaction(&tx.id).unwrap(), tx);

    assert_eq!(db.get_stats().unwrap().transaction_count, 1);
}

#[test]
fn test_difficulty_adjustment() {
    use chrono::{Duration, Utc};
    use rust_blockchain::mining::calculate_next_difficulty;

    let current_difficulty = 4;
    let interval = rust_blockchain::DIFFICULTY_ADJUSTMENT_INTERVAL;

    let fast_start = Utc::now() - Duration::seconds(300);
    assert!(
        calculate_next_difficulty(current_difficulty, fast_start, interval) > current_difficulty
    );

    let slow_start = Utc::now() - Duration::days(365);
    assert!(
        calculate_next_difficulty(current_difficulty, slow_start, interval) < current_difficulty
    );
}

#[test]
fn test_block_reward_halving() {
    assert_eq!(calculate_block_reward(0), BLOCK_REWARD);
    assert_eq!(
        calculate_block_reward(rust_blockchain::HALVING_INTERVAL),
        BLOCK_REWARD / 2
    );
    assert_eq!(
        calculate_block_reward(rust_blockchain::HALVING_INTERVAL * 2),
        BLOCK_REWARD / 4
    );
    assert_eq!(
        calculate_block_reward(rust_blockchain::HALVING_INTERVAL * 64),
        0
    );
}
