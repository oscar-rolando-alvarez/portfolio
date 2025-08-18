use criterion::{black_box, criterion_group, criterion_main, BenchmarkId, Criterion, Throughput};
use rust_blockchain::{
    blockchain::{Blockchain, BlockchainConfig},
    bip39_wallet::BIP39Wallet,
    crypto::{sha256, double_sha256, KeyPair},
    merkle_tree::MerkleTree,
    mining::{Miner, MiningConfig},
    smart_contracts::SmartContractVM,
    transaction::TransactionBuilder,
    utxo::{UTXOSet, UTXO},
    wallet::Wallet,
    Amount, OutPoint, TxOutput, BLOCK_REWARD,
};
use std::collections::HashMap;
use tempfile::TempDir;

fn crypto_benchmarks(c: &mut Criterion) {
    let mut group = c.benchmark_group("crypto");
    
    // SHA-256 benchmarks
    let data_sizes = vec![32, 256, 1024, 4096];
    for size in data_sizes {
        let data = vec![0u8; size];
        group.throughput(Throughput::Bytes(size as u64));
        group.bench_with_input(
            BenchmarkId::new("sha256", size),
            &data,
            |b, data| {
                b.iter(|| sha256(black_box(data)))
            },
        );
        
        group.bench_with_input(
            BenchmarkId::new("double_sha256", size),
            &data,
            |b, data| {
                b.iter(|| double_sha256(black_box(data)))
            },
        );
    }
    
    // Key generation benchmark
    group.bench_function("keypair_generation", |b| {
        b.iter(|| KeyPair::new().unwrap())
    });
    
    // Signing benchmark
    let keypair = KeyPair::new().unwrap();
    let message = b"test message for signing benchmark";
    group.bench_function("sign_message", |b| {
        b.iter(|| keypair.sign(black_box(message)).unwrap())
    });
    
    // Signature verification benchmark
    let signature = keypair.sign(message).unwrap();
    group.bench_function("verify_signature", |b| {
        b.iter(|| {
            rust_blockchain::crypto::verify_signature(
                black_box(&keypair.public_key),
                black_box(message),
                black_box(&signature),
            ).unwrap()
        })
    });
    
    group.finish();
}

fn merkle_tree_benchmarks(c: &mut Criterion) {
    let mut group = c.benchmark_group("merkle_tree");
    
    let transaction_counts = vec![1, 10, 100, 1000];
    
    for tx_count in transaction_counts {
        // Create test transaction IDs
        let tx_ids: Vec<String> = (0..tx_count)
            .map(|i| format!("tx_{:06}", i))
            .collect();
        
        group.throughput(Throughput::Elements(tx_count as u64));
        
        // Benchmark tree construction
        group.bench_with_input(
            BenchmarkId::new("construction", tx_count),
            &tx_ids,
            |b, tx_ids| {
                b.iter(|| MerkleTree::from_transaction_ids(black_box(tx_ids)).unwrap())
            },
        );
        
        // Benchmark proof generation
        let tree = MerkleTree::from_transaction_ids(&tx_ids).unwrap();
        if !tx_ids.is_empty() {
            group.bench_with_input(
                BenchmarkId::new("proof_generation", tx_count),
                &tx_ids[0],
                |b, tx_id| {
                    b.iter(|| tree.generate_proof(black_box(tx_id)).unwrap())
                },
            );
            
            // Benchmark proof verification
            let proof = tree.generate_proof(&tx_ids[0]).unwrap();
            group.bench_with_input(
                BenchmarkId::new("proof_verification", tx_count),
                &proof,
                |b, proof| {
                    b.iter(|| MerkleTree::verify_proof(black_box(proof)))
                },
            );
        }
    }
    
    group.finish();
}

fn transaction_benchmarks(c: &mut Criterion) {
    let mut group = c.benchmark_group("transactions");
    
    // Transaction creation benchmark
    group.bench_function("create_simple_transaction", |b| {
        b.iter(|| {
            TransactionBuilder::new()
                .add_input("prev_tx".to_string(), 0, vec![1, 2, 3])
                .add_output(1000, "address1".to_string())
                .build()
        })
    });
    
    // Transaction serialization benchmark
    let tx = TransactionBuilder::new()
        .add_input("prev_tx".to_string(), 0, vec![1, 2, 3])
        .add_output(1000, "address1".to_string())
        .build();
    
    group.bench_function("serialize_transaction", |b| {
        b.iter(|| tx.serialize().unwrap())
    });
    
    let serialized = tx.serialize().unwrap();
    group.bench_function("deserialize_transaction", |b| {
        b.iter(|| rust_blockchain::Transaction::deserialize(black_box(&serialized)).unwrap())
    });
    
    group.finish();
}

fn utxo_benchmarks(c: &mut Criterion) {
    let mut group = c.benchmark_group("utxo");
    
    let utxo_counts = vec![100, 1000, 10000];
    
    for utxo_count in utxo_counts {
        // Create UTXO set
        let mut utxo_set = UTXOSet::new();
        for i in 0..utxo_count {
            let utxo = UTXO {
                outpoint: OutPoint::new(format!("tx_{}", i), 0),
                output: TxOutput::new(1000 + i as Amount, format!("address_{}", i % 100)),
                height: 1,
                is_coinbase: false,
            };
            utxo_set.add_utxo(utxo);
        }
        
        group.throughput(Throughput::Elements(utxo_count as u64));
        
        // Benchmark balance calculation
        group.bench_with_input(
            BenchmarkId::new("get_balance", utxo_count),
            &utxo_set,
            |b, utxo_set| {
                b.iter(|| utxo_set.get_balance(black_box("address_50")))
            },
        );
        
        // Benchmark UTXO finding
        group.bench_with_input(
            BenchmarkId::new("find_spendable_utxos", utxo_count),
            &utxo_set,
            |b, utxo_set| {
                b.iter(|| {
                    utxo_set.find_spendable_utxos(
                        black_box("address_50"),
                        black_box(5000),
                        black_box(100),
                    )
                })
            },
        );
        
        // Benchmark serialization
        group.bench_with_input(
            BenchmarkId::new("serialize_utxo_set", utxo_count),
            &utxo_set,
            |b, utxo_set| {
                b.iter(|| utxo_set.serialize().unwrap())
            },
        );
    }
    
    group.finish();
}

fn wallet_benchmarks(c: &mut Criterion) {
    let mut group = c.benchmark_group("wallet");
    
    // Wallet creation benchmark
    group.bench_function("create_wallet", |b| {
        b.iter(|| Wallet::new(black_box("test_wallet".to_string())).unwrap())
    });
    
    // BIP39 wallet creation benchmark
    group.bench_function("create_bip39_wallet", |b| {
        b.iter(|| {
            BIP39Wallet::new(
                black_box("test_wallet".to_string()),
                black_box(bip39::MnemonicType::Words12),
            ).unwrap()
        })
    });
    
    // Address generation benchmark
    let mut wallet = Wallet::new("test_wallet".to_string()).unwrap();
    group.bench_function("generate_address", |b| {
        b.iter(|| wallet.generate_new_address().unwrap())
    });
    
    // BIP39 address generation benchmark
    let mut bip39_wallet = BIP39Wallet::new(
        "test_wallet".to_string(),
        bip39::MnemonicType::Words12,
    ).unwrap();
    group.bench_function("generate_bip39_address", |b| {
        b.iter(|| bip39_wallet.generate_next_address().unwrap())
    });
    
    group.finish();
}

fn mining_benchmarks(c: &mut Criterion) {
    let mut group = c.benchmark_group("mining");
    group.sample_size(10); // Reduce sample size for expensive operations
    
    // Block hash calculation benchmark
    let temp_dir = TempDir::new().unwrap();
    let db_path = temp_dir.path().join("bench_blockchain.db");
    let config = BlockchainConfig::default();
    let blockchain = Blockchain::new(config, db_path.to_str().unwrap()).unwrap();
    
    if let Some(block) = blockchain.get_latest_block() {
        group.bench_function("calculate_block_hash", |b| {
            b.iter(|| blockchain.calculate_block_hash(black_box(block)))
        });
    }
    
    // Mining configuration creation
    group.bench_function("create_mining_config", |b| {
        b.iter(|| {
            MiningConfig {
                max_threads: black_box(1),
                target_difficulty: black_box(1),
                miner_address: black_box("test_miner".to_string()),
                extra_nonce: black_box(0),
            }
        })
    });
    
    // Note: Actual mining benchmarks would be too slow for regular CI
    // In a real benchmark suite, you might want to benchmark individual
    // components of the mining process with very low difficulty
    
    group.finish();
}

fn blockchain_benchmarks(c: &mut Criterion) {
    let mut group = c.benchmark_group("blockchain");
    group.sample_size(10); // Reduce sample size for expensive operations
    
    // Blockchain creation benchmark
    group.bench_function("create_blockchain", |b| {
        b.iter(|| {
            let temp_dir = TempDir::new().unwrap();
            let db_path = temp_dir.path().join("bench_blockchain.db");
            let config = BlockchainConfig::default();
            Blockchain::new(config, db_path.to_str().unwrap()).unwrap()
        })
    });
    
    // Block validation benchmark (using genesis block)
    let temp_dir = TempDir::new().unwrap();
    let db_path = temp_dir.path().join("bench_blockchain.db");
    let config = BlockchainConfig::default();
    let blockchain = Blockchain::new(config, db_path.to_str().unwrap()).unwrap();
    
    if let Some(genesis_block) = blockchain.get_block_by_height(0) {
        group.bench_function("validate_block", |b| {
            b.iter(|| blockchain.validate_block(black_box(genesis_block)).unwrap())
        });
    }
    
    // Chain stats calculation
    group.bench_function("get_chain_stats", |b| {
        b.iter(|| blockchain.get_chain_stats())
    });
    
    group.finish();
}

fn smart_contract_benchmarks(c: &mut Criterion) {
    let mut group = c.benchmark_group("smart_contracts");
    group.sample_size(10);
    
    // VM creation benchmark
    group.bench_function("create_vm", |b| {
        b.iter(|| SmartContractVM::new().unwrap())
    });
    
    // Gas cost calculation benchmark
    let code_sizes = vec![100, 1000, 10000];
    for size in code_sizes {
        let code = vec![0u8; size];
        group.bench_with_input(
            BenchmarkId::new("calculate_deployment_cost", size),
            &code,
            |b, code| {
                b.iter(|| {
                    SmartContractVM::calculate_deployment_cost(
                        black_box(code),
                        black_box(1000000),
                    )
                })
            },
        );
    }
    
    group.finish();
}

fn serialization_benchmarks(c: &mut Criterion) {
    let mut group = c.benchmark_group("serialization");
    
    // Transaction serialization with different sizes
    let input_counts = vec![1, 10, 100];
    let output_counts = vec![1, 10, 100];
    
    for inputs in &input_counts {
        for outputs in &output_counts {
            let mut builder = TransactionBuilder::new();
            
            // Add inputs
            for i in 0..*inputs {
                builder = builder.add_input(format!("tx_{}", i), 0, vec![1, 2, 3]);
            }
            
            // Add outputs
            for i in 0..*outputs {
                builder = builder.add_output(1000, format!("address_{}", i));
            }
            
            let tx = builder.build();
            let size = inputs * outputs;
            
            group.throughput(Throughput::Elements(size as u64));
            group.bench_with_input(
                BenchmarkId::new("serialize_transaction", format!("{}i_{}o", inputs, outputs)),
                &tx,
                |b, tx| {
                    b.iter(|| tx.serialize().unwrap())
                },
            );
        }
    }
    
    group.finish();
}

fn memory_benchmarks(c: &mut Criterion) {
    let mut group = c.benchmark_group("memory");
    
    // Memory usage of different data structures
    let sizes = vec![1000, 10000, 100000];
    
    for size in sizes {
        group.bench_with_input(
            BenchmarkId::new("hashmap_creation", size),
            &size,
            |b, &size| {
                b.iter(|| {
                    let mut map = HashMap::new();
                    for i in 0..size {
                        map.insert(black_box(format!("key_{}", i)), black_box(i));
                    }
                    map
                })
            },
        );
    }
    
    group.finish();
}

criterion_group!(
    benches,
    crypto_benchmarks,
    merkle_tree_benchmarks,
    transaction_benchmarks,
    utxo_benchmarks,
    wallet_benchmarks,
    mining_benchmarks,
    blockchain_benchmarks,
    smart_contract_benchmarks,
    serialization_benchmarks,
    memory_benchmarks
);

criterion_main!(benches);