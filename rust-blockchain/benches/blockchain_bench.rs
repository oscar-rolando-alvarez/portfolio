use criterion::{BenchmarkId, Criterion, Throughput, criterion_group, criterion_main};
use rust_blockchain::{
    Amount, OutPoint, TxOutput,
    bip39_wallet::{BIP39Wallet, WordCount},
    blockchain::{Blockchain, BlockchainConfig},
    crypto::{KeyPair, double_sha256, sha256},
    merkle_tree::MerkleTree,
    mining::{Miner, MiningConfig},
    smart_contracts::{ContractCall, ContractDeployment, SimpleContractCompiler, SmartContractVM},
    transaction::TransactionBuilder,
    utxo::{UTXO, UTXOSet},
    wallet::Wallet,
};
use std::hint::black_box;
use tempfile::TempDir;

fn bench_config() -> BlockchainConfig {
    BlockchainConfig {
        genesis_difficulty: 8,
        ..Default::default()
    }
}

fn crypto_benchmarks(c: &mut Criterion) {
    let mut group = c.benchmark_group("crypto");

    for size in [32usize, 256, 1024, 4096] {
        let data = vec![0u8; size];
        group.throughput(Throughput::Bytes(size as u64));
        group.bench_with_input(BenchmarkId::new("sha256", size), &data, |b, data| {
            b.iter(|| sha256(black_box(data)))
        });
        group.bench_with_input(BenchmarkId::new("double_sha256", size), &data, |b, data| {
            b.iter(|| double_sha256(black_box(data)))
        });
    }

    group.bench_function("keypair_generation", |b| b.iter(|| KeyPair::new().unwrap()));

    let keypair = KeyPair::new().unwrap();
    let message = b"test message for signing benchmark";
    group.bench_function("sign_message", |b| {
        b.iter(|| keypair.sign(black_box(message)).unwrap())
    });

    let signature = keypair.sign(message).unwrap();
    group.bench_function("verify_signature", |b| {
        b.iter(|| {
            rust_blockchain::crypto::verify_signature(
                black_box(&keypair.public_key),
                black_box(message),
                black_box(&signature),
            )
            .unwrap()
        })
    });

    group.finish();
}

fn merkle_tree_benchmarks(c: &mut Criterion) {
    let mut group = c.benchmark_group("merkle_tree");

    for tx_count in [1usize, 10, 100, 1000] {
        let tx_ids: Vec<String> = (0..tx_count)
            .map(|i| hex::encode(sha256(format!("tx_{i}").as_bytes())))
            .collect();
        group.throughput(Throughput::Elements(tx_count as u64));

        group.bench_with_input(
            BenchmarkId::new("construction", tx_count),
            &tx_ids,
            |b, tx_ids| b.iter(|| MerkleTree::from_transaction_ids(black_box(tx_ids)).unwrap()),
        );

        let tree = MerkleTree::from_transaction_ids(&tx_ids).unwrap();
        group.bench_with_input(
            BenchmarkId::new("proof_generation", tx_count),
            &tx_ids[0],
            |b, tx_id| b.iter(|| tree.generate_proof(black_box(tx_id)).unwrap()),
        );

        let proof = tree.generate_proof(&tx_ids[0]).unwrap();
        group.bench_with_input(
            BenchmarkId::new("proof_verification", tx_count),
            &proof,
            |b, proof| b.iter(|| MerkleTree::verify_proof(black_box(proof))),
        );
    }

    group.finish();
}

fn transaction_benchmarks(c: &mut Criterion) {
    let mut group = c.benchmark_group("transactions");

    group.bench_function("create_simple_transaction", |b| {
        b.iter(|| {
            TransactionBuilder::new()
                .add_input("prev_tx".to_string(), 0, vec![1, 2, 3])
                .add_output(1000, "address1".to_string())
                .build()
        })
    });

    let tx = TransactionBuilder::new()
        .add_input("prev_tx".to_string(), 0, vec![1, 2, 3])
        .add_output(1000, "address1".to_string())
        .build();
    group.bench_function("serialize_transaction", |b| {
        b.iter(|| black_box(&tx).serialize().unwrap())
    });

    let serialized = tx.serialize().unwrap();
    group.bench_function("deserialize_transaction", |b| {
        b.iter(|| rust_blockchain::Transaction::deserialize(black_box(&serialized)).unwrap())
    });

    group.finish();
}

fn utxo_benchmarks(c: &mut Criterion) {
    let mut group = c.benchmark_group("utxo");

    for utxo_count in [100usize, 1000, 10_000] {
        let mut utxo_set = UTXOSet::new();
        for i in 0..utxo_count {
            utxo_set.add_utxo(UTXO {
                outpoint: OutPoint::new(format!("tx_{i}"), 0),
                output: TxOutput::new(1000 + i as Amount, format!("address_{}", i % 100)),
                height: 1,
                is_coinbase: false,
            });
        }
        group.throughput(Throughput::Elements(utxo_count as u64));

        group.bench_with_input(
            BenchmarkId::new("get_balance", utxo_count),
            &utxo_set,
            |b, set| b.iter(|| set.get_balance(black_box("address_50"))),
        );
        group.bench_with_input(
            BenchmarkId::new("find_spendable_utxos", utxo_count),
            &utxo_set,
            |b, set| {
                b.iter(|| set.find_spendable_utxos(black_box("address_50"), black_box(1000), 100))
            },
        );
        group.bench_with_input(
            BenchmarkId::new("serialize_utxo_set", utxo_count),
            &utxo_set,
            |b, set| b.iter(|| set.serialize().unwrap()),
        );
    }

    group.finish();
}

fn wallet_benchmarks(c: &mut Criterion) {
    let mut group = c.benchmark_group("wallet");

    group.bench_function("create_wallet", |b| {
        b.iter(|| Wallet::new(black_box("test_wallet".to_string())).unwrap())
    });

    group.sample_size(10);
    group.bench_function("create_bip39_wallet", |b| {
        b.iter(|| {
            BIP39Wallet::new(black_box("test_wallet".to_string()), WordCount::Words12).unwrap()
        })
    });

    let mut wallet = Wallet::new("test_wallet".to_string()).unwrap();
    group.bench_function("generate_address", |b| {
        b.iter(|| wallet.generate_new_address().unwrap())
    });

    let mut bip39_wallet = BIP39Wallet::new("test_wallet".to_string(), WordCount::Words12).unwrap();
    group.bench_function("generate_bip39_address", |b| {
        b.iter(|| bip39_wallet.generate_next_address().unwrap())
    });

    group.finish();
}

fn mining_benchmarks(c: &mut Criterion) {
    let mut group = c.benchmark_group("mining");
    group.sample_size(10);

    let temp_dir = TempDir::new().unwrap();
    let blockchain = Blockchain::new(bench_config(), temp_dir.path().join("bench.db")).unwrap();
    let genesis = blockchain.get_latest_block().unwrap().clone();
    group.bench_function("calculate_block_hash", |b| {
        b.iter(|| black_box(&genesis).hash())
    });

    let miner = Miner::new(MiningConfig {
        max_threads: 1,
        target_difficulty: 8,
        miner_address: "bench_miner".to_string(),
        extra_nonce: 0,
    });
    let tip = blockchain.get_best_block_hash().to_string();
    group.bench_function("mine_block_difficulty_8", |b| {
        b.iter(|| miner.mine_block(vec![], tip.clone(), 1, 8).unwrap())
    });

    group.finish();
}

fn blockchain_benchmarks(c: &mut Criterion) {
    let mut group = c.benchmark_group("blockchain");
    group.sample_size(10);

    group.bench_function("create_blockchain", |b| {
        b.iter(|| {
            let temp_dir = TempDir::new().unwrap();
            Blockchain::new(bench_config(), temp_dir.path().join("bench.db")).unwrap()
        })
    });

    let temp_dir = TempDir::new().unwrap();
    let blockchain = Blockchain::new(bench_config(), temp_dir.path().join("bench.db")).unwrap();
    group.bench_function("verify_chain", |b| {
        b.iter(|| blockchain.verify_chain().unwrap())
    });
    group.bench_function("get_chain_stats", |b| {
        b.iter(|| blockchain.get_chain_stats())
    });

    group.finish();
}

fn smart_contract_benchmarks(c: &mut Criterion) {
    let mut group = c.benchmark_group("smart_contracts");
    group.sample_size(10);

    group.bench_function("create_vm", |b| b.iter(|| SmartContractVM::new().unwrap()));

    let mut vm = SmartContractVM::new().unwrap();
    let address = vm
        .deploy_contract(ContractDeployment {
            code: SimpleContractCompiler::compile_simple_storage(),
            constructor_params: Vec::new(),
            deployer: "bench".to_string(),
            gas_limit: 1_000_000,
            value: 0,
        })
        .unwrap();
    group.bench_function("call_increment", |b| {
        b.iter(|| {
            vm.call_contract(ContractCall {
                contract_address: address.clone(),
                caller: "bench".to_string(),
                function_name: "increment".to_string(),
                parameters: Vec::new(),
                gas_limit: 100_000,
                value: 0,
            })
            .unwrap()
        })
    });

    for size in [100usize, 1000, 10_000] {
        let code = vec![0u8; size];
        group.bench_with_input(
            BenchmarkId::new("calculate_deployment_cost", size),
            &code,
            |b, code| {
                b.iter(|| SmartContractVM::calculate_deployment_cost(black_box(code), 1_000_000))
            },
        );
    }

    group.finish();
}

fn serialization_benchmarks(c: &mut Criterion) {
    let mut group = c.benchmark_group("serialization");

    for inputs in [1usize, 10, 100] {
        for outputs in [1usize, 10, 100] {
            let mut builder = TransactionBuilder::new();
            for i in 0..inputs {
                builder = builder.add_input(format!("tx_{i}"), 0, vec![1, 2, 3]);
            }
            for i in 0..outputs {
                builder = builder.add_output(1000, format!("address_{i}"));
            }
            let tx = builder.build();

            group.throughput(Throughput::Elements((inputs * outputs) as u64));
            group.bench_with_input(
                BenchmarkId::new("serialize_transaction", format!("{inputs}i_{outputs}o")),
                &tx,
                |b, tx| b.iter(|| tx.serialize().unwrap()),
            );
        }
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
    serialization_benchmarks
);
criterion_main!(benches);
