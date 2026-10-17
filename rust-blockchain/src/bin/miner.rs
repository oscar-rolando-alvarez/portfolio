use clap::Parser;
use colored::Colorize;
use rust_blockchain::{
    blockchain::{Blockchain, BlockchainConfig},
    mining::{Miner, MiningConfig},
    wallet::Wallet,
};
use std::path::PathBuf;
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::{Duration, Instant};

/// Dedicated miner that extends the chain stored in a local data directory.
#[derive(Debug, Parser)]
#[command(name = "blockchain-miner", version, about)]
struct Args {
    /// Data directory path
    #[arg(short = 'd', long, value_name = "DIR", default_value = "./data")]
    data_dir: PathBuf,

    /// Mining reward address
    #[arg(short = 'a', long = "address", value_name = "ADDRESS")]
    miner_address: String,

    /// Number of mining threads
    #[arg(short = 't', long, value_name = "THREADS", default_value_t = 1)]
    threads: usize,

    /// Wallet file that should own the reward address (checked at startup)
    #[arg(short = 'w', long, value_name = "WALLET")]
    wallet: Option<PathBuf>,

    /// Chain difficulty in leading zero bits used for a new chain and the
    /// first adjustment period (must match the chain stored in --data-dir)
    #[arg(long, value_name = "BITS")]
    difficulty: Option<u32>,

    /// Number of blocks to mine (0 = run until interrupted)
    #[arg(long, value_name = "BLOCKS", default_value_t = 0)]
    target_blocks: u64,

    /// Statistics display interval in seconds
    #[arg(long, value_name = "SECONDS", default_value_t = 30)]
    stats_interval: u64,
}

fn main() {
    env_logger::Builder::from_env(env_logger::Env::default().default_filter_or("info")).init();
    let args = Args::parse();

    if let Some(wallet_path) = &args.wallet {
        match Wallet::load_from_file(wallet_path) {
            Ok(wallet) => {
                if !wallet.contains_address(&args.miner_address) {
                    println!(
                        "{}",
                        format!(
                            "Warning: address {} not found in wallet {}",
                            args.miner_address,
                            wallet_path.display()
                        )
                        .yellow()
                    );
                }
                println!("Using wallet: {}", wallet_path.display().to_string().cyan());
            }
            Err(e) => {
                eprintln!("{}", format!("Failed to load wallet: {e}").red());
                std::process::exit(1);
            }
        }
    }

    if let Err(e) = std::fs::create_dir_all(&args.data_dir) {
        eprintln!("{}", format!("Failed to create data directory: {e}").red());
        std::process::exit(1);
    }

    let mut config = BlockchainConfig::default();
    if let Some(bits) = args.difficulty {
        config.genesis_difficulty = bits;
    }
    let mut blockchain = match Blockchain::new(config, args.data_dir.join("blockchain.db")) {
        Ok(blockchain) => blockchain,
        Err(e) => {
            eprintln!("{}", format!("Failed to initialize blockchain: {e}").red());
            std::process::exit(1);
        }
    };

    let stats = blockchain.get_chain_stats();
    println!("{}", "Blockchain loaded".green());
    println!("Current height: {}", stats.height.to_string().cyan());
    println!(
        "Next difficulty: {}",
        stats.next_difficulty.to_string().cyan()
    );

    let miner = Arc::new(Miner::new(MiningConfig {
        max_threads: args.threads.max(1),
        target_difficulty: stats.next_difficulty,
        miner_address: args.miner_address.clone(),
        extra_nonce: 0,
    }));

    let interrupted = Arc::new(AtomicBool::new(false));
    {
        let miner = Arc::clone(&miner);
        let interrupted = Arc::clone(&interrupted);
        if let Err(e) = ctrlc_stop(move || {
            interrupted.store(true, Ordering::SeqCst);
            miner.stop_mining();
        }) {
            log::warn!("Could not install Ctrl+C handler: {e}");
        }
    }

    println!("{}", "Starting mining".bold().green());
    println!("Miner address: {}", args.miner_address.cyan());
    println!("Mining threads: {}", args.threads.to_string().cyan());
    if args.target_blocks > 0 {
        println!("Target blocks: {}", args.target_blocks.to_string().cyan());
    } else {
        println!("Target blocks: {}", "unlimited".cyan());
    }
    println!();

    let start_time = Instant::now();
    let mut blocks_mined = 0u64;
    let mut last_stats_time = Instant::now();
    let mut last_block_count = 0u64;

    while (args.target_blocks == 0 || blocks_mined < args.target_blocks)
        && !interrupted.load(Ordering::SeqCst)
    {
        let template = blockchain.block_template(950_000, 1000);
        println!(
            "Mining block #{} with {} transactions (difficulty: {})",
            template.height.to_string().cyan(),
            template.transactions.len().to_string().yellow(),
            template.difficulty.to_string().magenta()
        );

        let block_start = Instant::now();
        match miner.mine_block(
            template.transactions,
            template.previous_hash,
            template.height,
            template.difficulty,
        ) {
            Ok(block) => {
                let hash = block.hash();
                let nonce = block.header.nonce;
                match blockchain.add_block(block) {
                    Ok(()) => {
                        blocks_mined += 1;
                        println!(
                            "{} hash={} nonce={} time={:.2}s",
                            "Block mined".green().bold(),
                            hash.yellow(),
                            nonce,
                            block_start.elapsed().as_secs_f64()
                        );
                    }
                    Err(e) => println!("{}", format!("Failed to add block: {e}").red()),
                }
            }
            Err(e) => {
                println!("{}", format!("Mining stopped: {e}").yellow());
                break;
            }
        }

        if last_stats_time.elapsed() >= Duration::from_secs(args.stats_interval) {
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

        blockchain.cleanup_mempool();
    }

    let total_time = start_time.elapsed();
    let final_stats = miner.get_stats();
    println!();
    println!("{}", "Mining session completed".bold().green());
    println!("Total blocks mined: {}", blocks_mined.to_string().cyan());
    println!("Total time: {:.2}s", total_time.as_secs_f64());
    if blocks_mined > 0 {
        println!(
            "Average time per block: {:.2}s",
            total_time.as_secs_f64() / blocks_mined as f64
        );
    }
    println!("Last hash rate: {:.2} H/s", final_stats.hash_rate);
    println!("Total hashes: {}", final_stats.total_hashes);
}

/// Install a Ctrl+C handler on a small background runtime.
fn ctrlc_stop(on_signal: impl FnOnce() + Send + 'static) -> std::io::Result<()> {
    let runtime = tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()?;
    std::thread::Builder::new()
        .name("signal".to_string())
        .spawn(move || {
            runtime.block_on(async {
                if tokio::signal::ctrl_c().await.is_ok() {
                    on_signal();
                }
            });
        })?;
    Ok(())
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
    let blocks_per_hour = if interval_time.as_secs_f64() > 0.0 {
        blocks_in_interval as f64 * 3600.0 / interval_time.as_secs_f64()
    } else {
        0.0
    };

    println!("{}", "=== Mining Statistics ===".bold().blue());
    println!("Hash rate: {:.2} H/s", stats.hash_rate);
    println!("Total blocks mined: {total_blocks}");
    println!("Blocks in last interval: {blocks_in_interval}");
    println!("Estimated blocks/hour: {blocks_per_hour:.2}");
    println!("Total hashes: {}", stats.total_hashes);
    println!(
        "Total mining time: {:.2} minutes",
        total_time.as_secs_f64() / 60.0
    );
    println!("Current difficulty: {}", stats.current_difficulty);
    if let Some(last_block_time) = stats.last_block_time {
        let since = chrono::Utc::now()
            .signed_duration_since(last_block_time)
            .num_seconds();
        println!("Time since last block: {since}s");
    }
    println!("{}", "=========================".bold().blue());
}
