use clap::{Arg, Command};
use colored::*;
use rust_blockchain::{
    blockchain::{Blockchain, BlockchainConfig},
    mining::{Miner, MiningConfig},
    wallet::Wallet,
};
use std::path::Path;
use std::time::{Duration, Instant};
use tokio::{self, time::sleep};

#[tokio::main]
async fn main() {
    env_logger::init();

    let matches = Command::new("blockchain-miner")
        .version("0.1.0")
        .author("Blockchain Developer")
        .about("Dedicated blockchain miner")
        .arg(
            Arg::new("data-dir")
                .short('d')
                .long("data-dir")
                .value_name("DIR")
                .help("Data directory path")
                .default_value("./data"),
        )
        .arg(
            Arg::new("miner-address")
                .short('a')
                .long("address")
                .value_name("ADDRESS")
                .help("Mining reward address")
                .required(true),
        )
        .arg(
            Arg::new("threads")
                .short('t')
                .long("threads")
                .value_name("THREADS")
                .help("Number of mining threads")
                .default_value("1"),
        )
        .arg(
            Arg::new("wallet")
                .short('w')
                .long("wallet")
                .value_name("WALLET")
                .help("Wallet file for mining rewards"),
        )
        .arg(
            Arg::new("difficulty")
                .long("difficulty")
                .value_name("DIFFICULTY")
                .help("Override mining difficulty")
                .value_parser(clap::value_parser!(u32)),
        )
        .arg(
            Arg::new("target-blocks")
                .long("target-blocks")
                .value_name("BLOCKS")
                .help("Number of blocks to mine (0 = infinite)")
                .default_value("0")
                .value_parser(clap::value_parser!(u64)),
        )
        .arg(
            Arg::new("stats-interval")
                .long("stats-interval")
                .value_name("SECONDS")
                .help("Statistics display interval in seconds")
                .default_value("30")
                .value_parser(clap::value_parser!(u64)),
        )
        .get_matches();

    let data_dir = matches.get_one::<String>("data-dir").unwrap();
    let miner_address = matches.get_one::<String>("miner-address").unwrap();
    let threads: usize = matches
        .get_one::<String>("threads")
        .unwrap()
        .parse()
        .expect("Invalid thread count");
    let wallet_file = matches.get_one::<String>("wallet");
    let override_difficulty = matches.get_one::<u32>("difficulty").copied();
    let target_blocks = *matches.get_one::<u64>("target-blocks").unwrap();
    let stats_interval = *matches.get_one::<u64>("stats-interval").unwrap();

    // Validate wallet if provided
    if let Some(wallet_path) = wallet_file {
        match Wallet::load_from_file(wallet_path) {
            Ok(wallet) => {
                if !wallet.contains_address(miner_address) {
                    println!(
                        "{}",
                        format!(
                            "Warning: Address {} not found in wallet {}",
                            miner_address, wallet_path
                        ).yellow()
                    );
                }
                println!("Using wallet: {}", wallet_path.cyan());
            }
            Err(e) => {
                println!("{}", format!("Failed to load wallet: {}", e).red());
                std::process::exit(1);
            }
        }
    }

    // Create data directory if it doesn't exist
    std::fs::create_dir_all(data_dir).expect("Failed to create data directory");

    // Initialize blockchain
    let config = BlockchainConfig::default();
    let db_path = Path::new(data_dir).join("blockchain.db");
    let mut blockchain = match Blockchain::new(config, db_path.to_str().unwrap()) {
        Ok(blockchain) => {
            println!("{}", "Blockchain loaded successfully!".green());
            let stats = blockchain.get_chain_stats();
            println!("Current height: {}", stats.height.to_string().cyan());
            println!("Current difficulty: {}", stats.difficulty.to_string().cyan());
            blockchain
        }
        Err(e) => {
            println!("{}", format!("Failed to initialize blockchain: {}", e).red());
            std::process::exit(1);
        }
    };

    // Create mining configuration
    let difficulty = override_difficulty.unwrap_or_else(|| blockchain.get_difficulty());
    let mining_config = MiningConfig {
        max_threads: threads,
        target_difficulty: difficulty,
        miner_address: miner_address.clone(),
        extra_nonce: 0,
    };

    let miner = Miner::new(mining_config);

    println!("{}", "Starting mining operation...".bold().green());
    println!("Miner address: {}", miner_address.cyan());
    println!("Mining threads: {}", threads.to_string().cyan());
    println!("Target difficulty: {}", difficulty.to_string().cyan());
    if target_blocks > 0 {
        println!("Target blocks: {}", target_blocks.to_string().cyan());
    } else {
        println!("Target blocks: {}", "infinite".cyan());
    }
    println!("Statistics interval: {} seconds", stats_interval.to_string().cyan());
    println!();

    let start_time = Instant::now();
    let mut blocks_mined = 0u64;
    let mut last_stats_time = Instant::now();
    let mut last_block_count = blocks_mined;

    loop {
        // Check if we've reached the target
        if target_blocks > 0 && blocks_mined >= target_blocks {
            println!("{}", "Target blocks reached!".green().bold());
            break;
        }

        // Get pending transactions
        let transactions = blockchain.get_transactions_for_mining(950_000, 1000);
        let tx_count = transactions.len();

        // Get previous block hash
        let previous_hash = if let Some(latest_block) = blockchain.get_latest_block() {
            blockchain.calculate_block_hash(latest_block)
        } else {
            "0".repeat(64)
        };

        let current_height = blockchain.get_chain_height() + 1;
        let current_difficulty = blockchain.get_difficulty();

        println!(
            "Mining block #{} with {} transactions (difficulty: {})",
            current_height.to_string().cyan(),
            tx_count.to_string().yellow(),
            current_difficulty.to_string().magenta()
        );

        let block_start_time = Instant::now();

        // Mine the block
        match miner.mine_block(transactions, previous_hash, current_height, current_difficulty) {
            Ok(block) => {
                let mining_time = block_start_time.elapsed();
                let block_hash = blockchain.calculate_block_hash(&block);

                println!("{}", "Block mined successfully!".green().bold());
                println!("Block height: {}", block.header.height.to_string().cyan());
                println!("Block hash: {}", block_hash.yellow());
                println!("Nonce: {}", block.header.nonce.to_string().cyan());
                println!("Mining time: {:.2}s", mining_time.as_secs_f64().to_string().cyan());
                println!("Transactions: {}", block.transactions.len().to_string().cyan());

                // Add block to blockchain
                match blockchain.add_block(block) {
                    Ok(_) => {
                        blocks_mined += 1;
                        println!("{}", "Block added to blockchain!".green());
                        
                        // Calculate hash rate
                        let total_time = start_time.elapsed();
                        let avg_hash_rate = miner.get_hash_rate();
                        
                        println!(
                            "Total blocks mined: {} (avg rate: {:.2} H/s)",
                            blocks_mined.to_string().cyan(),
                            avg_hash_rate.to_string().yellow()
                        );
                    }
                    Err(e) => {
                        println!("{}", format!("Failed to add block: {}", e).red());
                        // Continue mining despite this error
                    }
                }
            }
            Err(e) => {
                println!("{}", format!("Mining failed: {}", e).red());
                
                // Wait a bit before retrying
                sleep(Duration::from_secs(1)).await;
                continue;
            }
        }

        // Display periodic statistics
        if last_stats_time.elapsed() >= Duration::from_secs(stats_interval) {
            display_mining_stats(
                &miner,
                blocks_mined,
                last_block_count,
                start_time.elapsed(),
                last_stats_time.elapsed(),
            );
            
            last_stats_time = Instant::now();
            last_block_count = blocks_mined;
        }

        // Clean up mempool periodically
        blockchain.cleanup_mempool();

        println!(); // Add spacing between mining attempts
    }

    // Final statistics
    let total_time = start_time.elapsed();
    println!("{}", "Mining session completed!".bold().green());
    println!("Total blocks mined: {}", blocks_mined.to_string().cyan());
    println!("Total time: {:.2} minutes", (total_time.as_secs() as f64 / 60.0).to_string().cyan());
    
    if blocks_mined > 0 {
        let avg_time_per_block = total_time.as_secs_f64() / blocks_mined as f64;
        println!("Average time per block: {:.2} seconds", avg_time_per_block.to_string().cyan());
    }

    let final_stats = miner.get_stats();
    println!("Final hash rate: {:.2} H/s", final_stats.hash_rate.to_string().yellow());
    println!("Total hashes: {}", final_stats.total_hashes.to_string().yellow());
}

fn display_mining_stats(
    miner: &Miner,
    total_blocks: u64,
    last_block_count: u64,
    total_time: Duration,
    interval_time: Duration,
) {
    let stats = miner.get_stats();
    let blocks_in_interval = total_blocks - last_block_count;
    let blocks_per_hour = if interval_time.as_secs() > 0 {
        (blocks_in_interval as f64) * 3600.0 / interval_time.as_secs() as f64
    } else {
        0.0
    };

    println!("{}", "=== Mining Statistics ===".bold().blue());
    println!("Current hash rate: {:.2} H/s", stats.hash_rate.to_string().yellow());
    println!("Total blocks mined: {}", total_blocks.to_string().cyan());
    println!("Blocks in last interval: {}", blocks_in_interval.to_string().cyan());
    println!("Estimated blocks/hour: {:.2}", blocks_per_hour.to_string().cyan());
    println!("Total hashes: {}", stats.total_hashes.to_string().yellow());
    println!("Total mining time: {:.2} minutes", (total_time.as_secs() as f64 / 60.0).to_string().cyan());
    println!("Current difficulty: {}", stats.current_difficulty.to_string().magenta());
    
    if let Some(last_block_time) = stats.last_block_time {
        let time_since_last = chrono::Utc::now()
            .signed_duration_since(last_block_time)
            .num_seconds();
        println!("Time since last block: {}s", time_since_last.to_string().cyan());
    }
    
    println!("{}", "========================".bold().blue());
}