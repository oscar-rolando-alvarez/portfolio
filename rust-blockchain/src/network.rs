//! Peer-to-peer networking on top of libp2p.
//!
//! Blocks and transactions are flooded with gossipsub, peers are discovered
//! with mDNS and Kademlia, and chain synchronisation uses a CBOR
//! request/response protocol.

use crate::blockchain::Blockchain;
use crate::error::{BlockchainError, Result};
use crate::{Block, Transaction};
use futures::StreamExt;
use libp2p::{
    Multiaddr, PeerId, StreamProtocol, Swarm, gossipsub, identify, kad, mdns, noise, ping,
    request_response::{self, ProtocolSupport},
    swarm::{NetworkBehaviour, SwarmEvent, behaviour::toggle::Toggle},
    tcp, yamux,
};
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tokio::sync::{mpsc, oneshot};

pub const PROTOCOL_VERSION: &str = "/blockchain/1.0.0";
const SYNC_PROTOCOL: &str = "/blockchain/sync/1.0.0";
const BLOCK_TOPIC: &str = "blocks";
const TRANSACTION_TOPIC: &str = "transactions";
/// Maximum number of blocks served for a single `GetBlocks` request.
pub const MAX_BLOCKS_PER_REQUEST: u32 = 500;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum NetworkMessage {
    NewBlock(Block),
    NewTransaction(Transaction),
    GetBlocks(GetBlocksRequest),
    BlocksResponse(Vec<Block>),
    GetPeers,
    PeersResponse(Vec<PeerInfo>),
    Ping,
    Pong,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GetBlocksRequest {
    pub start_height: u64,
    pub count: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PeerInfo {
    pub peer_id: String,
    pub addresses: Vec<String>,
    pub protocol_version: String,
    pub chain_height: u64,
}

#[derive(NetworkBehaviour)]
pub struct BlockchainBehaviour {
    pub gossipsub: gossipsub::Behaviour,
    pub mdns: Toggle<mdns::tokio::Behaviour>,
    pub kademlia: kad::Behaviour<kad::store::MemoryStore>,
    pub request_response: request_response::cbor::Behaviour<NetworkMessage, NetworkMessage>,
    pub identify: identify::Behaviour,
    pub ping: ping::Behaviour,
}

/// Options for building a [`P2PNetwork`].
#[derive(Debug, Clone)]
pub struct NetworkConfig {
    /// Enable local peer discovery with mDNS.
    pub enable_mdns: bool,
    pub gossipsub_heartbeat: Duration,
    pub idle_connection_timeout: Duration,
}

impl Default for NetworkConfig {
    fn default() -> Self {
        Self {
            enable_mdns: true,
            gossipsub_heartbeat: Duration::from_secs(1),
            idle_connection_timeout: Duration::from_secs(60),
        }
    }
}

#[derive(Debug)]
pub enum NetworkCommand {
    StartListening(Multiaddr),
    Dial(Multiaddr),
    BroadcastBlock(Block),
    BroadcastTransaction(Transaction),
    RequestBlocks(PeerId, GetBlocksRequest),
    SendMessage(PeerId, NetworkMessage),
    GetConnectedPeers(oneshot::Sender<Vec<PeerId>>),
}

#[derive(Debug, Clone)]
pub enum NetworkEvent {
    PeerConnected(PeerId),
    PeerDisconnected(PeerId),
    BlockReceived(Block, PeerId),
    TransactionReceived(Transaction, PeerId),
    BlocksReceived(Vec<Block>, PeerId),
    MessageReceived(NetworkMessage, PeerId),
    ListenerStarted(Multiaddr),
    Error(String),
}

pub struct P2PNetwork {
    swarm: Swarm<BlockchainBehaviour>,
    command_receiver: mpsc::Receiver<NetworkCommand>,
    event_sender: mpsc::Sender<NetworkEvent>,
    connected_peers: HashSet<PeerId>,
    known_peers: HashMap<PeerId, PeerInfo>,
    blockchain: Option<Arc<Mutex<Blockchain>>>,
}

fn net_err(e: impl std::fmt::Display) -> BlockchainError {
    BlockchainError::NetworkError(e.to_string())
}

fn encode_message(message: &NetworkMessage) -> Result<Vec<u8>> {
    Ok(serde_json::to_vec(message)?)
}

fn decode_message(data: &[u8]) -> Result<NetworkMessage> {
    Ok(serde_json::from_slice(data)?)
}

fn build_behaviour(
    key: &libp2p::identity::Keypair,
    config: &NetworkConfig,
) -> Result<BlockchainBehaviour> {
    let peer_id = key.public().to_peer_id();

    let gossipsub_config = gossipsub::ConfigBuilder::default()
        .heartbeat_interval(config.gossipsub_heartbeat)
        .validation_mode(gossipsub::ValidationMode::Strict)
        .message_id_fn(|message: &gossipsub::Message| {
            gossipsub::MessageId::from(crate::crypto::sha256(&message.data))
        })
        .build()
        .map_err(net_err)?;
    let mut gossipsub = gossipsub::Behaviour::new(
        gossipsub::MessageAuthenticity::Signed(key.clone()),
        gossipsub_config,
    )
    .map_err(net_err)?;
    for topic in [BLOCK_TOPIC, TRANSACTION_TOPIC] {
        gossipsub
            .subscribe(&gossipsub::IdentTopic::new(topic))
            .map_err(net_err)?;
    }

    let mdns = if config.enable_mdns {
        match mdns::tokio::Behaviour::new(mdns::Config::default(), peer_id) {
            Ok(mdns) => Some(mdns),
            Err(e) => {
                log::warn!("mDNS unavailable, continuing without local discovery: {e}");
                None
            }
        }
    } else {
        None
    };

    let kademlia = kad::Behaviour::new(peer_id, kad::store::MemoryStore::new(peer_id));

    let request_response = request_response::cbor::Behaviour::new(
        [(StreamProtocol::new(SYNC_PROTOCOL), ProtocolSupport::Full)],
        request_response::Config::default().with_request_timeout(Duration::from_secs(30)),
    );

    let identify = identify::Behaviour::new(
        identify::Config::new(PROTOCOL_VERSION.to_string(), key.public())
            .with_agent_version(format!("rust-blockchain/{}", env!("CARGO_PKG_VERSION"))),
    );

    Ok(BlockchainBehaviour {
        gossipsub,
        mdns: Toggle::from(mdns),
        kademlia,
        request_response,
        identify,
        ping: ping::Behaviour::new(ping::Config::new()),
    })
}

impl P2PNetwork {
    /// Create a network with a fresh identity and default settings.
    pub async fn new() -> Result<(Self, NetworkHandle)> {
        Self::with_config(NetworkConfig::default())
    }

    pub fn with_config(config: NetworkConfig) -> Result<(Self, NetworkHandle)> {
        let mut behaviour_error = None;
        let swarm = libp2p::SwarmBuilder::with_new_identity()
            .with_tokio()
            .with_tcp(
                tcp::Config::default().nodelay(true),
                noise::Config::new,
                yamux::Config::default,
            )
            .map_err(net_err)?
            .with_dns()
            .map_err(net_err)?
            .with_behaviour(|key| match build_behaviour(key, &config) {
                Ok(behaviour) => Ok(behaviour),
                Err(e) => {
                    let message = e.to_string();
                    behaviour_error = Some(e);
                    Err(message.into())
                }
            })
            .map_err(|e| behaviour_error.take().unwrap_or_else(|| net_err(e)))?
            .with_swarm_config(|c| c.with_idle_connection_timeout(config.idle_connection_timeout))
            .build();

        let local_peer_id = *swarm.local_peer_id();
        let (command_sender, command_receiver) = mpsc::channel(256);
        let (event_sender, event_receiver) = mpsc::channel(256);

        let network = Self {
            swarm,
            command_receiver,
            event_sender,
            connected_peers: HashSet::new(),
            known_peers: HashMap::new(),
            blockchain: None,
        };

        let handle = NetworkHandle {
            commander: NetworkCommander { command_sender },
            event_receiver,
            local_peer_id,
        };

        Ok((network, handle))
    }

    /// Serve `GetBlocks` requests from this shared chain.
    pub fn with_blockchain(mut self, blockchain: Arc<Mutex<Blockchain>>) -> Self {
        self.blockchain = Some(blockchain);
        self
    }

    pub fn local_peer_id(&self) -> PeerId {
        *self.swarm.local_peer_id()
    }

    /// Drive the swarm until every [`NetworkHandle`] / [`NetworkCommander`] is dropped.
    pub async fn run(&mut self) {
        let mut maintenance = tokio::time::interval(Duration::from_secs(30));

        loop {
            tokio::select! {
                command = self.command_receiver.recv() => match command {
                    Some(command) => self.handle_command(command).await,
                    None => break,
                },
                event = self.swarm.select_next_some() => self.handle_swarm_event(event).await,
                _ = maintenance.tick() => self.handle_heartbeat(),
            }
        }
    }

    async fn handle_command(&mut self, command: NetworkCommand) {
        match command {
            NetworkCommand::StartListening(addr) => {
                if let Err(e) = self.swarm.listen_on(addr) {
                    self.send_event(NetworkEvent::Error(format!("Failed to listen: {e}")))
                        .await;
                }
            }
            NetworkCommand::Dial(addr) => {
                if let Err(e) = self.swarm.dial(addr) {
                    self.send_event(NetworkEvent::Error(format!("Failed to dial: {e}")))
                        .await;
                }
            }
            NetworkCommand::BroadcastBlock(block) => {
                self.broadcast_message(BLOCK_TOPIC, &NetworkMessage::NewBlock(block))
                    .await;
            }
            NetworkCommand::BroadcastTransaction(tx) => {
                self.broadcast_message(TRANSACTION_TOPIC, &NetworkMessage::NewTransaction(tx))
                    .await;
            }
            NetworkCommand::RequestBlocks(peer_id, request) => {
                self.send_request(peer_id, NetworkMessage::GetBlocks(request));
            }
            NetworkCommand::SendMessage(peer_id, message) => {
                self.send_request(peer_id, message);
            }
            NetworkCommand::GetConnectedPeers(reply) => {
                let _ = reply.send(self.connected_peers.iter().copied().collect());
            }
        }
    }

    async fn handle_swarm_event(&mut self, event: SwarmEvent<BlockchainBehaviourEvent>) {
        match event {
            SwarmEvent::Behaviour(BlockchainBehaviourEvent::Gossipsub(event)) => {
                self.handle_gossipsub_event(event).await;
            }
            SwarmEvent::Behaviour(BlockchainBehaviourEvent::Mdns(event)) => {
                self.handle_mdns_event(event);
            }
            SwarmEvent::Behaviour(BlockchainBehaviourEvent::RequestResponse(event)) => {
                self.handle_request_response_event(event).await;
            }
            SwarmEvent::Behaviour(BlockchainBehaviourEvent::Identify(event)) => {
                self.handle_identify_event(event);
            }
            SwarmEvent::Behaviour(BlockchainBehaviourEvent::Kademlia(_))
            | SwarmEvent::Behaviour(BlockchainBehaviourEvent::Ping(_)) => {}
            SwarmEvent::NewListenAddr { address, .. } => {
                self.send_event(NetworkEvent::ListenerStarted(address))
                    .await;
            }
            SwarmEvent::ConnectionEstablished {
                peer_id,
                num_established,
                ..
            } => {
                if num_established.get() == 1 && self.connected_peers.insert(peer_id) {
                    self.send_event(NetworkEvent::PeerConnected(peer_id)).await;
                }
            }
            SwarmEvent::ConnectionClosed {
                peer_id,
                num_established,
                ..
            } => {
                if num_established == 0 && self.connected_peers.remove(&peer_id) {
                    self.send_event(NetworkEvent::PeerDisconnected(peer_id))
                        .await;
                }
            }
            SwarmEvent::OutgoingConnectionError { peer_id, error, .. } => {
                log::debug!("Outgoing connection to {peer_id:?} failed: {error}");
            }
            _ => {}
        }
    }

    async fn handle_gossipsub_event(&mut self, event: gossipsub::Event) {
        let gossipsub::Event::Message {
            propagation_source,
            message,
            ..
        } = event
        else {
            return;
        };

        match decode_message(&message.data) {
            Ok(NetworkMessage::NewBlock(block)) => {
                self.send_event(NetworkEvent::BlockReceived(block, propagation_source))
                    .await;
            }
            Ok(NetworkMessage::NewTransaction(tx)) => {
                self.send_event(NetworkEvent::TransactionReceived(tx, propagation_source))
                    .await;
            }
            Ok(other) => {
                self.send_event(NetworkEvent::MessageReceived(other, propagation_source))
                    .await;
            }
            Err(e) => log::warn!("Dropping undecodable gossip message: {e}"),
        }
    }

    fn handle_mdns_event(&mut self, event: mdns::Event) {
        match event {
            mdns::Event::Discovered(list) => {
                for (peer_id, multiaddr) in list {
                    self.swarm
                        .behaviour_mut()
                        .kademlia
                        .add_address(&peer_id, multiaddr.clone());
                    if !self.connected_peers.contains(&peer_id)
                        && let Err(e) = self.swarm.dial(multiaddr)
                    {
                        log::warn!("Failed to dial discovered peer {peer_id}: {e}");
                    }
                }
            }
            mdns::Event::Expired(list) => {
                for (peer_id, _) in list {
                    log::info!("mDNS record expired for peer {peer_id}");
                }
            }
        }
    }

    async fn handle_request_response_event(
        &mut self,
        event: request_response::Event<NetworkMessage, NetworkMessage>,
    ) {
        match event {
            request_response::Event::Message { peer, message, .. } => match message {
                request_response::Message::Request {
                    request, channel, ..
                } => {
                    let response = self.handle_request(request);
                    if self
                        .swarm
                        .behaviour_mut()
                        .request_response
                        .send_response(channel, response)
                        .is_err()
                    {
                        log::warn!("Failed to send response to {peer}: channel closed");
                    }
                }
                request_response::Message::Response { response, .. } => {
                    let event = match response {
                        NetworkMessage::BlocksResponse(blocks) => {
                            NetworkEvent::BlocksReceived(blocks, peer)
                        }
                        other => NetworkEvent::MessageReceived(other, peer),
                    };
                    self.send_event(event).await;
                }
            },
            request_response::Event::OutboundFailure { peer, error, .. } => {
                log::warn!("Outbound request to {peer} failed: {error}");
            }
            request_response::Event::InboundFailure { peer, error, .. } => {
                log::warn!("Inbound request from {peer} failed: {error}");
            }
            request_response::Event::ResponseSent { .. } => {}
        }
    }

    fn handle_identify_event(&mut self, event: identify::Event) {
        if let identify::Event::Received { peer_id, info, .. } = event {
            for addr in &info.listen_addrs {
                self.swarm
                    .behaviour_mut()
                    .kademlia
                    .add_address(&peer_id, addr.clone());
            }
            self.known_peers.insert(
                peer_id,
                PeerInfo {
                    peer_id: peer_id.to_string(),
                    addresses: info.listen_addrs.iter().map(ToString::to_string).collect(),
                    protocol_version: info.protocol_version,
                    chain_height: 0,
                },
            );
        }
    }

    fn handle_request(&self, request: NetworkMessage) -> NetworkMessage {
        match request {
            NetworkMessage::GetBlocks(request) => {
                let count = request.count.min(MAX_BLOCKS_PER_REQUEST) as usize;
                let blocks = self
                    .blockchain
                    .as_ref()
                    .and_then(|chain| chain.lock().ok())
                    .map(|chain| chain.get_blocks_from(request.start_height, count))
                    .unwrap_or_default();
                NetworkMessage::BlocksResponse(blocks)
            }
            NetworkMessage::GetPeers => {
                NetworkMessage::PeersResponse(self.known_peers.values().cloned().collect())
            }
            _ => NetworkMessage::Pong,
        }
    }

    fn handle_heartbeat(&mut self) {
        if !self.connected_peers.is_empty() {
            let _ = self.swarm.behaviour_mut().kademlia.bootstrap();
        }
    }

    async fn broadcast_message(&mut self, topic: &str, message: &NetworkMessage) {
        let data = match encode_message(message) {
            Ok(data) => data,
            Err(e) => {
                log::warn!("Failed to encode message: {e}");
                return;
            }
        };

        if let Err(e) = self
            .swarm
            .behaviour_mut()
            .gossipsub
            .publish(gossipsub::IdentTopic::new(topic), data)
        {
            self.send_event(NetworkEvent::Error(format!("Failed to publish: {e}")))
                .await;
        }
    }

    fn send_request(&mut self, peer_id: PeerId, message: NetworkMessage) {
        self.swarm
            .behaviour_mut()
            .request_response
            .send_request(&peer_id, message);
    }

    async fn send_event(&mut self, event: NetworkEvent) {
        if self.event_sender.send(event).await.is_err() {
            log::debug!("Network event receiver dropped");
        }
    }
}

/// Cloneable sender for issuing commands to a running [`P2PNetwork`].
#[derive(Debug, Clone)]
pub struct NetworkCommander {
    command_sender: mpsc::Sender<NetworkCommand>,
}

impl NetworkCommander {
    async fn send(&self, command: NetworkCommand) -> Result<()> {
        self.command_sender.send(command).await.map_err(net_err)
    }

    /// Non-async variant usable from blocking threads; fails if the queue is full.
    pub fn try_send(&self, command: NetworkCommand) -> Result<()> {
        self.command_sender.try_send(command).map_err(net_err)
    }

    pub async fn start_listening(&self, addr: Multiaddr) -> Result<()> {
        self.send(NetworkCommand::StartListening(addr)).await
    }

    pub async fn dial_peer(&self, addr: Multiaddr) -> Result<()> {
        self.send(NetworkCommand::Dial(addr)).await
    }

    pub async fn broadcast_block(&self, block: Block) -> Result<()> {
        self.send(NetworkCommand::BroadcastBlock(block)).await
    }

    pub async fn broadcast_transaction(&self, transaction: Transaction) -> Result<()> {
        self.send(NetworkCommand::BroadcastTransaction(transaction))
            .await
    }

    pub async fn request_blocks(&self, peer_id: PeerId, request: GetBlocksRequest) -> Result<()> {
        self.send(NetworkCommand::RequestBlocks(peer_id, request))
            .await
    }

    pub async fn send_message(&self, peer_id: PeerId, message: NetworkMessage) -> Result<()> {
        self.send(NetworkCommand::SendMessage(peer_id, message))
            .await
    }

    pub async fn connected_peers(&self) -> Result<Vec<PeerId>> {
        let (tx, rx) = oneshot::channel();
        self.send(NetworkCommand::GetConnectedPeers(tx)).await?;
        rx.await.map_err(net_err)
    }
}

/// Command sender plus event stream for a [`P2PNetwork`].
pub struct NetworkHandle {
    commander: NetworkCommander,
    event_receiver: mpsc::Receiver<NetworkEvent>,
    pub local_peer_id: PeerId,
}

impl NetworkHandle {
    pub fn commander(&self) -> NetworkCommander {
        self.commander.clone()
    }

    pub async fn start_listening(&self, addr: Multiaddr) -> Result<()> {
        self.commander.start_listening(addr).await
    }

    pub async fn dial_peer(&self, addr: Multiaddr) -> Result<()> {
        self.commander.dial_peer(addr).await
    }

    pub async fn broadcast_block(&self, block: Block) -> Result<()> {
        self.commander.broadcast_block(block).await
    }

    pub async fn broadcast_transaction(&self, transaction: Transaction) -> Result<()> {
        self.commander.broadcast_transaction(transaction).await
    }

    pub async fn request_blocks(&self, peer_id: PeerId, request: GetBlocksRequest) -> Result<()> {
        self.commander.request_blocks(peer_id, request).await
    }

    pub async fn connected_peers(&self) -> Result<Vec<PeerId>> {
        self.commander.connected_peers().await
    }

    pub async fn next_event(&mut self) -> Option<NetworkEvent> {
        self.event_receiver.recv().await
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::blockchain::BlockchainConfig;
    use tokio::time::{Instant, timeout};

    fn local_config() -> NetworkConfig {
        NetworkConfig {
            enable_mdns: false,
            gossipsub_heartbeat: Duration::from_millis(100),
            ..Default::default()
        }
    }

    async fn wait_for<F, T>(handle: &mut NetworkHandle, mut pred: F) -> T
    where
        F: FnMut(NetworkEvent) -> Option<T>,
    {
        timeout(Duration::from_secs(30), async {
            loop {
                let event = handle.next_event().await.expect("network stopped");
                if let Some(value) = pred(event) {
                    return value;
                }
            }
        })
        .await
        .expect("timed out waiting for network event")
    }

    async fn spawn_node(
        blockchain: Option<Arc<Mutex<Blockchain>>>,
    ) -> (NetworkHandle, Multiaddr, tokio::task::JoinHandle<()>) {
        let (mut network, mut handle) = P2PNetwork::with_config(local_config()).unwrap();
        if let Some(chain) = blockchain {
            network = network.with_blockchain(chain);
        }
        let task = tokio::spawn(async move { network.run().await });
        handle
            .start_listening("/ip4/127.0.0.1/tcp/0".parse().unwrap())
            .await
            .unwrap();
        let addr = wait_for(&mut handle, |e| match e {
            NetworkEvent::ListenerStarted(addr) => Some(addr),
            _ => None,
        })
        .await;
        (handle, addr, task)
    }

    #[tokio::test]
    async fn test_network_creation() {
        let (network, handle) = P2PNetwork::with_config(local_config()).unwrap();
        assert_eq!(network.local_peer_id(), handle.local_peer_id);
        assert!(!handle.local_peer_id.to_string().is_empty());
    }

    #[tokio::test]
    async fn test_default_network_creation() {
        // mDNS may be unavailable in sandboxes; creation must still succeed.
        let result = P2PNetwork::new().await;
        assert!(result.is_ok());
    }

    #[test]
    fn test_network_message_serialization() {
        let tx = Transaction::new_coinbase(10, "a".to_string(), 1);
        let message = NetworkMessage::NewTransaction(tx.clone());
        match decode_message(&encode_message(&message).unwrap()).unwrap() {
            NetworkMessage::NewTransaction(decoded) => assert_eq!(decoded, tx),
            other => panic!("unexpected message {other:?}"),
        }
        assert!(decode_message(b"not json").is_err());
    }

    #[test]
    fn test_peer_info_creation() {
        let peer_info = PeerInfo {
            peer_id: "test_peer".to_string(),
            addresses: vec!["/ip4/127.0.0.1/tcp/8000".to_string()],
            protocol_version: PROTOCOL_VERSION.to_string(),
            chain_height: 100,
        };
        assert_eq!(peer_info.peer_id, "test_peer");
        assert_eq!(peer_info.chain_height, 100);
    }

    /// Two in-process nodes on loopback: connect, gossip a transaction and
    /// sync blocks over request/response.
    #[tokio::test]
    async fn test_two_local_nodes_gossip_and_sync() {
        let dir = tempfile::tempdir().unwrap();
        let config = BlockchainConfig {
            genesis_difficulty: 4,
            ..Default::default()
        };
        let chain = Blockchain::new(config, dir.path().join("a.db")).unwrap();
        let genesis_hash = chain.get_best_block_hash().to_string();
        let chain = Arc::new(Mutex::new(chain));

        let (a, a_addr, _a_task) = spawn_node(Some(chain)).await;
        let (mut b, _b_addr, _b_task) = spawn_node(None).await;

        b.dial_peer(a_addr).await.unwrap();
        let a_peer = a.local_peer_id;
        wait_for(&mut b, |e| match e {
            NetworkEvent::PeerConnected(p) if p == a_peer => Some(()),
            _ => None,
        })
        .await;
        assert_eq!(b.connected_peers().await.unwrap(), vec![a_peer]);

        // Sync: B asks A for its blocks.
        b.request_blocks(
            a_peer,
            GetBlocksRequest {
                start_height: 0,
                count: 10,
            },
        )
        .await
        .unwrap();
        let blocks = wait_for(&mut b, |e| match e {
            NetworkEvent::BlocksReceived(blocks, p) if p == a_peer => Some(blocks),
            _ => None,
        })
        .await;
        assert_eq!(blocks.len(), 1);
        assert_eq!(blocks[0].hash(), genesis_hash);

        // Gossip: retry until the subscription handshake has completed.
        let tx = Transaction::new_coinbase(1, "gossip".to_string(), 7);
        let deadline = Instant::now() + Duration::from_secs(30);
        let received = loop {
            a.broadcast_transaction(tx.clone()).await.unwrap();
            let got = timeout(Duration::from_millis(500), async {
                loop {
                    match b.next_event().await {
                        Some(NetworkEvent::TransactionReceived(t, _)) => break Some(t),
                        Some(_) => continue,
                        None => break None,
                    }
                }
            })
            .await;
            if let Ok(Some(t)) = got {
                break t;
            }
            assert!(Instant::now() < deadline, "transaction was never gossiped");
        };
        assert_eq!(received.id, tx.id);
    }
}
