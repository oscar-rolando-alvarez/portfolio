//! Full node runtime: shared chain + P2P networking + HTTP API.

use crate::api::{AppState, start_api_server_with_state};
use crate::blockchain::{Blockchain, BlockchainConfig};
use crate::error::{BlockchainError, Result};
use crate::network::{
    GetBlocksRequest, MAX_BLOCKS_PER_REQUEST, NetworkCommander, NetworkConfig, NetworkEvent,
    P2PNetwork,
};
use actix_web::web::Data;
use libp2p::{Multiaddr, PeerId};
use std::path::PathBuf;
use std::sync::{Arc, Mutex, MutexGuard};

/// Settings for [`run`].
#[derive(Debug, Clone)]
pub struct NodeOptions {
    pub data_dir: PathBuf,
    pub network: String,
    /// Overrides [`BlockchainConfig::genesis_difficulty`] when set.
    pub difficulty: Option<u32>,
    pub p2p_host: String,
    pub p2p_port: u16,
    pub api_host: String,
    pub api_port: u16,
    pub bootstrap: Vec<String>,
    pub enable_mdns: bool,
}

impl Default for NodeOptions {
    fn default() -> Self {
        Self {
            data_dir: PathBuf::from("./data"),
            network: "testnet".to_string(),
            difficulty: None,
            p2p_host: "0.0.0.0".to_string(),
            p2p_port: 8333,
            api_host: "127.0.0.1".to_string(),
            api_port: 8080,
            bootstrap: Vec::new(),
            enable_mdns: true,
        }
    }
}

fn lock(chain: &Mutex<Blockchain>) -> MutexGuard<'_, Blockchain> {
    chain
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
}

/// Run a node until Ctrl+C or until one of its components stops.
pub async fn run(options: NodeOptions) -> Result<()> {
    std::fs::create_dir_all(&options.data_dir)?;

    let mut config = BlockchainConfig {
        network: options.network.clone(),
        ..Default::default()
    };
    if let Some(bits) = options.difficulty {
        config.genesis_difficulty = bits;
    }

    let blockchain = Blockchain::new(config, options.data_dir.join("blockchain.db"))?;
    let stats = blockchain.get_chain_stats();
    log::info!(
        "Blockchain loaded: network={} height={} difficulty={} data_dir={}",
        options.network,
        stats.height,
        stats.difficulty,
        options.data_dir.display()
    );
    let blockchain = Arc::new(Mutex::new(blockchain));

    let (network, mut handle) = P2PNetwork::with_config(NetworkConfig {
        enable_mdns: options.enable_mdns,
        ..Default::default()
    })?;
    let mut network = network.with_blockchain(Arc::clone(&blockchain));
    let commander = handle.commander();
    log::info!("Local peer id: {}", handle.local_peer_id);
    let p2p_task = tokio::spawn(async move { network.run().await });

    let p2p_addr: Multiaddr = format!("/ip4/{}/tcp/{}", options.p2p_host, options.p2p_port)
        .parse()
        .map_err(|e| BlockchainError::NetworkError(format!("Invalid P2P listen address: {e}")))?;
    commander.start_listening(p2p_addr).await?;

    for peer in &options.bootstrap {
        match peer.parse::<Multiaddr>() {
            Ok(addr) => {
                log::info!("Dialing bootstrap peer {addr}");
                if let Err(e) = commander.dial_peer(addr).await {
                    log::warn!("Failed to dial bootstrap peer: {e}");
                }
            }
            Err(e) => log::warn!("Invalid bootstrap address '{peer}': {e}"),
        }
    }

    let app_state =
        Data::new(AppState::from_shared(Arc::clone(&blockchain)).with_network(commander.clone()));
    let api_addr = format!("{}:{}", options.api_host, options.api_port);
    log::info!("API listening on http://{api_addr}");
    // The actix server future is !Send, so it is driven on this task instead of spawned.
    let api_server = start_api_server_with_state(app_state, &api_addr);

    let events_chain = Arc::clone(&blockchain);
    let event_task = tokio::spawn(async move {
        while let Some(event) = handle.next_event().await {
            handle_network_event(event, &events_chain, &commander).await;
        }
    });

    tokio::select! {
        result = api_server => match result {
            Ok(()) => log::info!("API server stopped"),
            Err(e) => return Err(e.into()),
        },
        _ = event_task => log::info!("Event handler stopped"),
        _ = p2p_task => log::info!("P2P network stopped"),
        _ = tokio::signal::ctrl_c() => log::info!("Shutting down node"),
    }

    Ok(())
}

fn short(peer_id: &PeerId) -> String {
    let id = peer_id.to_string();
    id[id.len().saturating_sub(8)..].to_string()
}

async fn request_sync(commander: &NetworkCommander, chain: &Mutex<Blockchain>, peer: PeerId) {
    let start_height = lock(chain).get_chain_height() + 1;
    let request = GetBlocksRequest {
        start_height,
        count: MAX_BLOCKS_PER_REQUEST,
    };
    if let Err(e) = commander.request_blocks(peer, request).await {
        log::warn!("Failed to request blocks from {peer}: {e}");
    }
}

/// Apply a network event to the shared chain.
pub async fn handle_network_event(
    event: NetworkEvent,
    chain: &Mutex<Blockchain>,
    commander: &NetworkCommander,
) {
    match event {
        NetworkEvent::PeerConnected(peer_id) => {
            log::info!("Peer connected: {peer_id}");
            request_sync(commander, chain, peer_id).await;
        }
        NetworkEvent::PeerDisconnected(peer_id) => log::info!("Peer disconnected: {peer_id}"),
        NetworkEvent::BlockReceived(block, peer_id) => {
            let height = block.header.height;
            let (result, tip) = {
                let mut chain = lock(chain);
                let result = chain.add_block(block);
                (result, chain.get_chain_height())
            };
            match result {
                Ok(()) => log::info!("Accepted block #{height} from {}", short(&peer_id)),
                Err(e) if height > tip + 1 => {
                    log::info!("Block #{height} is ahead of tip #{tip} ({e}); syncing");
                    request_sync(commander, chain, peer_id).await;
                }
                Err(e) => log::debug!("Ignored block #{height}: {e}"),
            }
        }
        NetworkEvent::TransactionReceived(transaction, peer_id) => {
            let txid = transaction.id.clone();
            match lock(chain).add_transaction(transaction) {
                Ok(()) => log::info!("Accepted transaction {txid} from {}", short(&peer_id)),
                Err(e) => log::debug!("Ignored transaction {txid}: {e}"),
            }
        }
        NetworkEvent::BlocksReceived(blocks, peer_id) => {
            let received = blocks.len();
            let accepted = {
                let mut chain = lock(chain);
                blocks
                    .into_iter()
                    .filter(|block| chain.add_block(block.clone()).is_ok())
                    .count()
            };
            if received > 0 {
                log::info!(
                    "Synced {accepted}/{received} blocks from {}",
                    short(&peer_id)
                );
            }
            if accepted > 0 && received as u32 == MAX_BLOCKS_PER_REQUEST {
                request_sync(commander, chain, peer_id).await;
            }
        }
        NetworkEvent::MessageReceived(message, peer_id) => {
            log::debug!("Message from {}: {message:?}", short(&peer_id));
        }
        NetworkEvent::ListenerStarted(addr) => log::info!("P2P listening on {addr}"),
        NetworkEvent::Error(error) => log::warn!("Network error: {error}"),
    }
}
