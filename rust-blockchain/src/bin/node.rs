use clap::Parser;
use colored::Colorize;
use rust_blockchain::node::{self, NodeOptions};
use std::path::PathBuf;

/// Blockchain node with P2P networking and an HTTP API server.
#[derive(Debug, Parser)]
#[command(name = "blockchain-node", version, about)]
struct Args {
    /// Data directory path
    #[arg(short = 'd', long, value_name = "DIR", default_value = "./data")]
    data_dir: PathBuf,

    /// P2P listen port
    #[arg(short = 'p', long, value_name = "PORT", default_value_t = 8333)]
    p2p_port: u16,

    /// P2P listen interface
    #[arg(long, value_name = "HOST", default_value = "0.0.0.0")]
    p2p_host: String,

    /// API server port
    #[arg(short = 'a', long, value_name = "PORT", default_value_t = 8080)]
    api_port: u16,

    /// API server host
    #[arg(long, value_name = "HOST", default_value = "127.0.0.1")]
    api_host: String,

    /// Network name (mainnet, testnet, ...)
    #[arg(short = 'n', long, value_name = "NETWORK", default_value = "testnet")]
    network: String,

    /// Chain difficulty in leading zero bits (must match across peers)
    #[arg(long, value_name = "BITS")]
    difficulty: Option<u32>,

    /// Bootstrap peer multiaddress, e.g. /dns4/node/tcp/8333 (repeatable)
    #[arg(short = 'b', long = "bootstrap", value_name = "MULTIADDR")]
    bootstrap: Vec<String>,

    /// Disable mDNS local peer discovery
    #[arg(long)]
    no_mdns: bool,
}

#[tokio::main]
async fn main() {
    env_logger::Builder::from_env(env_logger::Env::default().default_filter_or("info")).init();
    let args = Args::parse();

    println!("{}", "Starting blockchain node".bold().green());
    println!(
        "P2P: {}:{}",
        args.p2p_host,
        args.p2p_port.to_string().cyan()
    );
    println!(
        "API: http://{}:{}",
        args.api_host,
        args.api_port.to_string().cyan()
    );

    let options = NodeOptions {
        data_dir: args.data_dir,
        network: args.network,
        difficulty: args.difficulty,
        p2p_host: args.p2p_host,
        p2p_port: args.p2p_port,
        api_host: args.api_host,
        api_port: args.api_port,
        bootstrap: args.bootstrap,
        enable_mdns: !args.no_mdns,
    };

    if let Err(e) = node::run(options).await {
        eprintln!("{}", format!("Node error: {e}").red());
        std::process::exit(1);
    }
    println!("{}", "Node stopped".green());
}
