use crate::error::{BlockchainError, Result};
use crate::{Block, Transaction};
use futures::StreamExt;
use libp2p::{
    gossipsub::{self, Gossipsub, GossipsubEvent, IdentTopic, MessageAuthenticity},
    identify::{Identify, IdentifyConfig, IdentifyEvent},
    kad::{Kademlia, KademliaEvent},
    mdns::{Mdns, MdnsEvent},
    noise,
    ping::{Ping, PingEvent},
    request_response::{RequestResponse, RequestResponseEvent, RequestResponseMessage},
    swarm::{NetworkBehaviour, SwarmEvent},
    tcp, yamux, Multiaddr, PeerId, Swarm, Transport,
};
use serde::{Deserialize, Serialize};
use std::collections::hash_map::DefaultHasher;
use std::collections::{HashMap, HashSet};
use std::hash::{Hash, Hasher};
use std::time::Duration;
use tokio::{select, sync::mpsc, time::interval};

const PROTOCOL_VERSION: &str = "/blockchain/1.0.0";
const BLOCK_TOPIC: &str = "blocks";
const TRANSACTION_TOPIC: &str = "transactions";
const PEER_DISCOVERY_TOPIC: &str = "peer_discovery";

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
#[behaviour(out_event = "BlockchainBehaviourEvent")]
pub struct BlockchainBehaviour {
    pub gossipsub: Gossipsub,
    pub mdns: Mdns,
    pub kademlia: Kademlia<libp2p::kad::store::MemoryStore>,
    pub request_response: RequestResponse<BlockchainCodec>,
    pub identify: Identify,
    pub ping: Ping,
}

#[derive(Debug)]
pub enum BlockchainBehaviourEvent {
    Gossipsub(GossipsubEvent),
    Mdns(MdnsEvent),
    Kademlia(KademliaEvent),
    RequestResponse(RequestResponseEvent<NetworkMessage, NetworkMessage>),
    Identify(IdentifyEvent),
    Ping(PingEvent),
}

impl From<GossipsubEvent> for BlockchainBehaviourEvent {
    fn from(event: GossipsubEvent) -> Self {
        BlockchainBehaviourEvent::Gossipsub(event)
    }
}

impl From<MdnsEvent> for BlockchainBehaviourEvent {
    fn from(event: MdnsEvent) -> Self {
        BlockchainBehaviourEvent::Mdns(event)
    }
}

impl From<KademliaEvent> for BlockchainBehaviourEvent {
    fn from(event: KademliaEvent) -> Self {
        BlockchainBehaviourEvent::Kademlia(event)
    }
}

impl From<RequestResponseEvent<NetworkMessage, NetworkMessage>> for BlockchainBehaviourEvent {
    fn from(event: RequestResponseEvent<NetworkMessage, NetworkMessage>) -> Self {
        BlockchainBehaviourEvent::RequestResponse(event)
    }
}

impl From<IdentifyEvent> for BlockchainBehaviourEvent {
    fn from(event: IdentifyEvent) -> Self {
        BlockchainBehaviourEvent::Identify(event)
    }
}

impl From<PingEvent> for BlockchainBehaviourEvent {
    fn from(event: PingEvent) -> Self {
        BlockchainBehaviourEvent::Ping(event)
    }
}

#[derive(Debug, Clone)]
pub struct BlockchainCodec;

impl libp2p::request_response::Codec for BlockchainCodec {
    type Protocol = libp2p::StreamProtocol;
    type Request = NetworkMessage;
    type Response = NetworkMessage;

    async fn read_request<T>(
        &mut self,
        _: &Self::Protocol,
        io: &mut T,
    ) -> std::io::Result<Self::Request>
    where
        T: futures::AsyncRead + Unpin + Send,
    {
        use futures::AsyncReadExt;
        let mut buf = Vec::new();
        let mut reader = io;
        reader.read_to_end(&mut buf).await?;
        
        bincode::deserialize(&buf)
            .map_err(|e| std::io::Error::new(std::io::ErrorKind::InvalidData, e))
    }

    async fn read_response<T>(
        &mut self,
        _: &Self::Protocol,
        io: &mut T,
    ) -> std::io::Result<Self::Response>
    where
        T: futures::AsyncRead + Unpin + Send,
    {
        use futures::AsyncReadExt;
        let mut buf = Vec::new();
        let mut reader = io;
        reader.read_to_end(&mut buf).await?;
        
        bincode::deserialize(&buf)
            .map_err(|e| std::io::Error::new(std::io::ErrorKind::InvalidData, e))
    }

    async fn write_request<T>(
        &mut self,
        _: &Self::Protocol,
        io: &mut T,
        req: Self::Request,
    ) -> std::io::Result<()>
    where
        T: futures::AsyncWrite + Unpin + Send,
    {
        use futures::AsyncWriteExt;
        let data = bincode::serialize(&req)
            .map_err(|e| std::io::Error::new(std::io::ErrorKind::InvalidData, e))?;
        let mut writer = io;
        writer.write_all(&data).await?;
        writer.close().await?;
        Ok(())
    }

    async fn write_response<T>(
        &mut self,
        _: &Self::Protocol,
        io: &mut T,
        res: Self::Response,
    ) -> std::io::Result<()>
    where
        T: futures::AsyncWrite + Unpin + Send,
    {
        use futures::AsyncWriteExt;
        let data = bincode::serialize(&res)
            .map_err(|e| std::io::Error::new(std::io::ErrorKind::InvalidData, e))?;
        let mut writer = io;
        writer.write_all(&data).await?;
        writer.close().await?;
        Ok(())
    }
}

pub struct P2PNetwork {
    swarm: Swarm<BlockchainBehaviour>,
    command_receiver: mpsc::Receiver<NetworkCommand>,
    event_sender: mpsc::Sender<NetworkEvent>,
    connected_peers: HashSet<PeerId>,
    known_peers: HashMap<PeerId, PeerInfo>,
}

#[derive(Debug)]
pub enum NetworkCommand {
    StartListening(Multiaddr),
    Dial(Multiaddr),
    BroadcastBlock(Block),
    BroadcastTransaction(Transaction),
    RequestBlocks(PeerId, GetBlocksRequest),
    SendMessage(PeerId, NetworkMessage),
    GetConnectedPeers,
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

impl P2PNetwork {
    pub async fn new() -> Result<(Self, NetworkHandle)> {
        let local_key = libp2p::identity::Keypair::generate_ed25519();
        let local_peer_id = PeerId::from(local_key.public());

        // Create a gossipsub topic
        let block_topic = IdentTopic::new(BLOCK_TOPIC);
        let transaction_topic = IdentTopic::new(TRANSACTION_TOPIC);
        let peer_discovery_topic = IdentTopic::new(PEER_DISCOVERY_TOPIC);

        // Build the transport
        let transport = tcp::async_io::Transport::default()
            .upgrade(libp2p::core::upgrade::Version::V1)
            .authenticate(noise::NoiseAuthenticated::xx(&local_key).unwrap())
            .multiplex(yamux::YamuxConfig::default())
            .boxed();

        // Create Gossipsub
        let gossipsub_config = gossipsub::GossipsubConfigBuilder::default()
            .heartbeat_interval(Duration::from_secs(10))
            .validation_mode(gossipsub::ValidationMode::Strict)
            .build()
            .map_err(|e| BlockchainError::NetworkError(e.to_string()))?;

        let mut gossipsub = Gossipsub::new(
            MessageAuthenticity::Signed(local_key.clone()),
            gossipsub_config,
        )
        .map_err(|e| BlockchainError::NetworkError(e.to_string()))?;

        gossipsub.subscribe(&block_topic).unwrap();
        gossipsub.subscribe(&transaction_topic).unwrap();
        gossipsub.subscribe(&peer_discovery_topic).unwrap();

        // Create mDNS for local discovery
        let mdns = Mdns::new(Default::default())
            .await
            .map_err(|e| BlockchainError::NetworkError(e.to_string()))?;

        // Create Kademlia for DHT
        let store = libp2p::kad::store::MemoryStore::new(local_peer_id);
        let kademlia = Kademlia::new(local_peer_id, store);

        // Create request-response protocol
        let protocols = std::iter::once((
            libp2p::StreamProtocol::new(PROTOCOL_VERSION),
            libp2p::request_response::ProtocolSupport::Full,
        ));
        let cfg = libp2p::request_response::Config::default();
        let request_response = RequestResponse::new(BlockchainCodec, protocols, cfg);

        // Create identify protocol
        let identify_config = IdentifyConfig::new(PROTOCOL_VERSION.to_string(), local_key.public())
            .with_agent_version("blockchain-node/0.1.0".to_string());
        let identify = Identify::new(identify_config);

        // Create ping protocol
        let ping = Ping::new(libp2p::ping::Config::new().with_keep_alive(true));

        // Create behaviour
        let behaviour = BlockchainBehaviour {
            gossipsub,
            mdns,
            kademlia,
            request_response,
            identify,
            ping,
        };

        // Create swarm
        let swarm = Swarm::with_async_std_executor(transport, behaviour, local_peer_id);

        let (command_sender, command_receiver) = mpsc::channel(100);
        let (event_sender, event_receiver) = mpsc::channel(100);

        let network = Self {
            swarm,
            command_receiver,
            event_sender,
            connected_peers: HashSet::new(),
            known_peers: HashMap::new(),
        };

        let handle = NetworkHandle {
            command_sender,
            event_receiver,
            local_peer_id,
        };

        Ok((network, handle))
    }

    pub async fn run(&mut self) {
        let mut heartbeat_interval = interval(Duration::from_secs(30));

        loop {
            select! {
                command = self.command_receiver.recv() => {
                    if let Some(command) = command {
                        self.handle_command(command).await;
                    }
                }
                event = self.swarm.select_next_some() => {
                    self.handle_swarm_event(event).await;
                }
                _ = heartbeat_interval.tick() => {
                    self.handle_heartbeat().await;
                }
            }
        }
    }

    async fn handle_command(&mut self, command: NetworkCommand) {
        match command {
            NetworkCommand::StartListening(addr) => {
                match self.swarm.listen_on(addr.clone()) {
                    Ok(_) => {
                        self.send_event(NetworkEvent::ListenerStarted(addr)).await;
                    }
                    Err(e) => {
                        self.send_event(NetworkEvent::Error(format!("Failed to listen: {}", e))).await;
                    }
                }
            }
            NetworkCommand::Dial(addr) => {
                if let Err(e) = self.swarm.dial(addr) {
                    self.send_event(NetworkEvent::Error(format!("Failed to dial: {}", e))).await;
                }
            }
            NetworkCommand::BroadcastBlock(block) => {
                let message = NetworkMessage::NewBlock(block);
                self.broadcast_message(BLOCK_TOPIC, message).await;
            }
            NetworkCommand::BroadcastTransaction(tx) => {
                let message = NetworkMessage::NewTransaction(tx);
                self.broadcast_message(TRANSACTION_TOPIC, message).await;
            }
            NetworkCommand::RequestBlocks(peer_id, request) => {
                let message = NetworkMessage::GetBlocks(request);
                self.send_request(peer_id, message).await;
            }
            NetworkCommand::SendMessage(peer_id, message) => {
                self.send_request(peer_id, message).await;
            }
            NetworkCommand::GetConnectedPeers => {
                // Handle connected peers request
            }
        }
    }

    async fn handle_swarm_event(&mut self, event: SwarmEvent<BlockchainBehaviourEvent>) {
        match event {
            SwarmEvent::Behaviour(BlockchainBehaviourEvent::Gossipsub(event)) => {
                self.handle_gossipsub_event(event).await;
            }
            SwarmEvent::Behaviour(BlockchainBehaviourEvent::Mdns(event)) => {
                self.handle_mdns_event(event).await;
            }
            SwarmEvent::Behaviour(BlockchainBehaviourEvent::RequestResponse(event)) => {
                self.handle_request_response_event(event).await;
            }
            SwarmEvent::Behaviour(BlockchainBehaviourEvent::Identify(event)) => {
                self.handle_identify_event(event).await;
            }
            SwarmEvent::ConnectionEstablished { peer_id, .. } => {
                self.connected_peers.insert(peer_id);
                self.send_event(NetworkEvent::PeerConnected(peer_id)).await;
            }
            SwarmEvent::ConnectionClosed { peer_id, .. } => {
                self.connected_peers.remove(&peer_id);
                self.send_event(NetworkEvent::PeerDisconnected(peer_id)).await;
            }
            _ => {}
        }
    }

    async fn handle_gossipsub_event(&mut self, event: GossipsubEvent) {
        match event {
            GossipsubEvent::Message {
                propagation_source,
                message,
                ..
            } => {
                if let Ok(network_message) = bincode::deserialize::<NetworkMessage>(&message.data) {
                    match network_message {
                        NetworkMessage::NewBlock(block) => {
                            self.send_event(NetworkEvent::BlockReceived(block, propagation_source)).await;
                        }
                        NetworkMessage::NewTransaction(tx) => {
                            self.send_event(NetworkEvent::TransactionReceived(tx, propagation_source)).await;
                        }
                        _ => {
                            self.send_event(NetworkEvent::MessageReceived(network_message, propagation_source)).await;
                        }
                    }
                }
            }
            _ => {}
        }
    }

    async fn handle_mdns_event(&mut self, event: MdnsEvent) {
        match event {
            MdnsEvent::Discovered(list) => {
                for (peer_id, multiaddr) in list {
                    if let Err(e) = self.swarm.dial(multiaddr) {
                        log::warn!("Failed to dial discovered peer {}: {}", peer_id, e);
                    }
                }
            }
            MdnsEvent::Expired(list) => {
                for (peer_id, _) in list {
                    log::info!("mDNS expired for peer: {}", peer_id);
                }
            }
        }
    }

    async fn handle_request_response_event(
        &mut self,
        event: RequestResponseEvent<NetworkMessage, NetworkMessage>,
    ) {
        match event {
            RequestResponseEvent::Message { peer, message } => match message {
                RequestResponseMessage::Request { request, channel, .. } => {
                    let response = self.handle_request(request).await;
                    if let Err(e) = self.swarm.behaviour_mut().request_response.send_response(channel, response) {
                        log::warn!("Failed to send response: {}", e);
                    }
                }
                RequestResponseMessage::Response { response, .. } => {
                    self.send_event(NetworkEvent::MessageReceived(response, peer)).await;
                }
            },
            RequestResponseEvent::OutboundFailure { peer, error, .. } => {
                log::warn!("Outbound request to {} failed: {:?}", peer, error);
            }
            RequestResponseEvent::InboundFailure { peer, error, .. } => {
                log::warn!("Inbound request from {} failed: {:?}", peer, error);
            }
            _ => {}
        }
    }

    async fn handle_identify_event(&mut self, event: IdentifyEvent) {
        match event {
            IdentifyEvent::Received { peer_id, info } => {
                let peer_info = PeerInfo {
                    peer_id: peer_id.to_string(),
                    addresses: info.listen_addrs.iter().map(|addr| addr.to_string()).collect(),
                    protocol_version: info.protocol_version,
                    chain_height: 0, // Would need to get this from somewhere
                };
                self.known_peers.insert(peer_id, peer_info);
            }
            _ => {}
        }
    }

    async fn handle_request(&mut self, request: NetworkMessage) -> NetworkMessage {
        match request {
            NetworkMessage::GetBlocks(_request) => {
                // TODO: Implement block fetching from blockchain
                NetworkMessage::BlocksResponse(Vec::new())
            }
            NetworkMessage::GetPeers => {
                let peers: Vec<PeerInfo> = self.known_peers.values().cloned().collect();
                NetworkMessage::PeersResponse(peers)
            }
            NetworkMessage::Ping => NetworkMessage::Pong,
            _ => NetworkMessage::Pong, // Default response
        }
    }

    async fn handle_heartbeat(&mut self) {
        // Periodic maintenance tasks
        // - Clean up old peer information
        // - Send heartbeat messages
        // - Update routing tables
    }

    async fn broadcast_message(&mut self, topic: &str, message: NetworkMessage) {
        let topic = IdentTopic::new(topic);
        let data = bincode::serialize(&message).unwrap_or_default();
        
        if let Err(e) = self.swarm.behaviour_mut().gossipsub.publish(topic, data) {
            log::warn!("Failed to publish message: {}", e);
        }
    }

    async fn send_request(&mut self, peer_id: PeerId, message: NetworkMessage) {
        self.swarm.behaviour_mut().request_response.send_request(&peer_id, message);
    }

    async fn send_event(&mut self, event: NetworkEvent) {
        if let Err(e) = self.event_sender.send(event).await {
            log::warn!("Failed to send network event: {}", e);
        }
    }
}

pub struct NetworkHandle {
    command_sender: mpsc::Sender<NetworkCommand>,
    event_receiver: mpsc::Receiver<NetworkEvent>,
    pub local_peer_id: PeerId,
}

impl NetworkHandle {
    pub async fn start_listening(&self, addr: Multiaddr) -> Result<()> {
        self.command_sender
            .send(NetworkCommand::StartListening(addr))
            .await
            .map_err(|e| BlockchainError::NetworkError(e.to_string()))?;
        Ok(())
    }

    pub async fn dial_peer(&self, addr: Multiaddr) -> Result<()> {
        self.command_sender
            .send(NetworkCommand::Dial(addr))
            .await
            .map_err(|e| BlockchainError::NetworkError(e.to_string()))?;
        Ok(())
    }

    pub async fn broadcast_block(&self, block: Block) -> Result<()> {
        self.command_sender
            .send(NetworkCommand::BroadcastBlock(block))
            .await
            .map_err(|e| BlockchainError::NetworkError(e.to_string()))?;
        Ok(())
    }

    pub async fn broadcast_transaction(&self, transaction: Transaction) -> Result<()> {
        self.command_sender
            .send(NetworkCommand::BroadcastTransaction(transaction))
            .await
            .map_err(|e| BlockchainError::NetworkError(e.to_string()))?;
        Ok(())
    }

    pub async fn request_blocks(&self, peer_id: PeerId, request: GetBlocksRequest) -> Result<()> {
        self.command_sender
            .send(NetworkCommand::RequestBlocks(peer_id, request))
            .await
            .map_err(|e| BlockchainError::NetworkError(e.to_string()))?;
        Ok(())
    }

    pub async fn next_event(&mut self) -> Option<NetworkEvent> {
        self.event_receiver.recv().await
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_network_creation() {
        let result = P2PNetwork::new().await;
        assert!(result.is_ok());

        let (_network, handle) = result.unwrap();
        assert!(!handle.local_peer_id.to_string().is_empty());
    }

    #[test]
    fn test_network_message_serialization() {
        let message = NetworkMessage::Ping;
        let serialized = bincode::serialize(&message).unwrap();
        let deserialized: NetworkMessage = bincode::deserialize(&serialized).unwrap();
        
        match deserialized {
            NetworkMessage::Ping => assert!(true),
            _ => assert!(false),
        }
    }

    #[test]
    fn test_peer_info_creation() {
        let peer_info = PeerInfo {
            peer_id: "test_peer".to_string(),
            addresses: vec!["127.0.0.1:8000".to_string()],
            protocol_version: PROTOCOL_VERSION.to_string(),
            chain_height: 100,
        };

        assert_eq!(peer_info.peer_id, "test_peer");
        assert_eq!(peer_info.chain_height, 100);
    }
}