use clap::{Arg, Command};
use colored::*;
use rust_blockchain::{
    api::start_api_server,
    blockchain::{Blockchain, BlockchainConfig},
    network::{P2PNetwork, NetworkEvent},
};
use std::path::Path;
use tokio;

#[tokio::main]
async fn main() {
    env_logger::init();

    let matches = Command::new("blockchain-node")
        .version("0.1.0")
        .author("Blockchain Developer")
        .about("Blockchain node with P2P networking and API server")
        .arg(
            Arg::new("data-dir")
                .short('d')
                .long("data-dir")
                .value_name("DIR")
                .help("Data directory path")
                .default_value("./data"),
        )
        .arg(
            Arg::new("p2p-port")
                .short('p')
                .long("p2p-port")
                .value_name("PORT")
                .help("P2P network port")
                .default_value("8333"),
        )
        .arg(
            Arg::new("api-port")
                .short('a')
                .long("api-port")
                .value_name("PORT")
                .help("API server port")
                .default_value("8080"),
        )
        .arg(
            Arg::new("api-host")
                .long("api-host")
                .value_name("HOST")
                .help("API server host")
                .default_value("127.0.0.1"),
        )
        .arg(
            Arg::new("network")
                .short('n')
                .long("network")
                .value_name("NETWORK")
                .help("Network type (mainnet, testnet)")
                .default_value("testnet"),
        )
        .arg(
            Arg::new("bootstrap")
                .short('b')
                .long("bootstrap")
                .value_name("ADDR")
                .help("Bootstrap peer address")
                .action(clap::ArgAction::Append),
        )
        .get_matches();

    let data_dir = matches.get_one::<String>("data-dir").unwrap();
    let p2p_port = matches.get_one::<String>("p2p-port").unwrap();
    let api_port = matches.get_one::<String>("api-port").unwrap();
    let api_host = matches.get_one::<String>("api-host").unwrap();
    let network_type = matches.get_one::<String>("network").unwrap();
    let bootstrap_peers: Vec<String> = matches
        .get_many::<String>("bootstrap")
        .unwrap_or_default()
        .cloned()
        .collect();

    // Create data directory if it doesn't exist
    std::fs::create_dir_all(data_dir).expect("Failed to create data directory");

    // Initialize blockchain
    let config = BlockchainConfig {
        network: network_type.clone(),
        ..Default::default()
    };

    let db_path = Path::new(data_dir).join("blockchain.db");
    let blockchain = match Blockchain::new(config, db_path.to_str().unwrap()) {
        Ok(blockchain) => {
            println!("{}", "Blockchain loaded successfully!".green());
            let stats = blockchain.get_chain_stats();
            println!("Height: {}", stats.height.to_string().cyan());
            println!("Difficulty: {}", stats.difficulty.to_string().cyan());
            blockchain
        }
        Err(e) => {
            println!("{}", format!("Failed to initialize blockchain: {}", e).red());
            std::process::exit(1);
        }
    };

    println!("{}", "Starting blockchain node...".bold().green());
    println!("Network: {}", network_type.cyan());
    println!("Data directory: {}", data_dir.cyan());
    println!("P2P port: {}", p2p_port.cyan());
    println!("API endpoint: {}:{}", api_host.cyan(), api_port.cyan());

    // Start P2P network
    let (mut network, mut network_handle) = match P2PNetwork::new().await {
        Ok((network, handle)) => {
            println!("{}", "P2P network initialized".green());
            (network, handle)
        }
        Err(e) => {
            println!("{}", format!("Failed to create P2P network: {}", e).red());
            std::process::exit(1);
        }
    };

    // Start listening on P2P port
    let p2p_addr: libp2p::Multiaddr = format!("/ip4/0.0.0.0/tcp/{}", p2p_port)
        .parse()
        .expect("Invalid P2P address");

    if let Err(e) = network_handle.start_listening(p2p_addr.clone()).await {
        println!("{}", format!("Failed to start P2P listener: {}", e).red());
        std::process::exit(1);
    }

    println!("P2P listening on: {}", p2p_addr.to_string().cyan());

    // Connect to bootstrap peers
    for peer_addr in bootstrap_peers {
        match peer_addr.parse::<libp2p::Multiaddr>() {
            Ok(addr) => {
                println!("Connecting to bootstrap peer: {}", addr.to_string().cyan());
                if let Err(e) = network_handle.dial_peer(addr).await {
                    println!("{}", format!("Failed to connect to bootstrap peer: {}", e).yellow());
                }
            }
            Err(e) => {
                println!("{}", format!("Invalid bootstrap peer address '{}': {}", peer_addr, e).yellow());
            }
        }
    }

    // Start API server
    let api_addr = format!("{}:{}", api_host, api_port);
    let api_blockchain = blockchain; // Move blockchain to API server
    let api_handle = tokio::spawn(async move {
        println!("Starting API server on: {}", api_addr.cyan());
        if let Err(e) = start_api_server(api_blockchain, &api_addr).await {
            println!("{}", format!("API server error: {}", e).red());
        }
    });

    // Handle network events
    let mut blockchain_for_events = None; // We'd need a way to share the blockchain state
    let event_handle = tokio::spawn(async move {
        while let Some(event) = network_handle.next_event().await {
            handle_network_event(event, &mut blockchain_for_events).await;
        }
    });

    // Run P2P network
    let p2p_handle = tokio::spawn(async move {
        network.run().await;
    });

    println!("{}", "Node started successfully!".bold().green());
    println!("Local Peer ID: {}", network_handle.local_peer_id.to_string().yellow());
    println!("Press Ctrl+C to stop the node");

    // Wait for shutdown signal or task completion
    tokio::select! {
        _ = api_handle => {
            println!("API server stopped");
        }
        _ = event_handle => {
            println!("Event handler stopped");
        }
        _ = p2p_handle => {
            println!("P2P network stopped");
        }
        _ = tokio::signal::ctrl_c() => {
            println!("\n{}", "Shutting down node...".yellow());
        }
    }

    println!("{}", "Node stopped".green());
}

async fn handle_network_event(
    event: NetworkEvent,
    _blockchain: &mut Option<Blockchain>, // In a real implementation, this would be properly shared
) {
    match event {
        NetworkEvent::PeerConnected(peer_id) => {
            println!("{}", format!("Peer connected: {}", peer_id).green());
        }
        NetworkEvent::PeerDisconnected(peer_id) => {
            println!("{}", format!("Peer disconnected: {}", peer_id).yellow());
        }
        NetworkEvent::BlockReceived(block, peer_id) => {
            println!(
                "{}",
                format!(
                    "Received block #{} from peer {}",
                    block.header.height,
                    peer_id.to_string().chars().take(8).collect::<String>()
                ).blue()
            );
            
            // In a real implementation, you would:
            // 1. Validate the block
            // 2. Add it to the blockchain if valid
            // 3. Propagate to other peers if necessary
        }
        NetworkEvent::TransactionReceived(transaction, peer_id) => {
            println!(
                "{}",
                format!(
                    "Received transaction {} from peer {}",
                    transaction.id.chars().take(8).collect::<String>(),
                    peer_id.to_string().chars().take(8).collect::<String>()
                ).blue()
            );
            
            // In a real implementation, you would:
            // 1. Validate the transaction
            // 2. Add it to the mempool if valid
            // 3. Propagate to other peers if necessary
        }
        NetworkEvent::BlocksReceived(blocks, peer_id) => {
            println!(
                "{}",
                format!(
                    "Received {} blocks from peer {}",
                    blocks.len(),
                    peer_id.to_string().chars().take(8).collect::<String>()
                ).blue()
            );
        }
        NetworkEvent::MessageReceived(message, peer_id) => {
            println!(
                "{}",
                format!(
                    "Received message from peer {}: {:?}",
                    peer_id.to_string().chars().take(8).collect::<String>(),
                    message
                ).blue()
            );
        }
        NetworkEvent::ListenerStarted(addr) => {
            println!("{}", format!("Network listener started on: {}", addr).green());
        }
        NetworkEvent::Error(error) => {
            println!("{}", format!("Network error: {}", error).red());
        }
    }
}