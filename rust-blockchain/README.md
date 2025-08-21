# Rust Blockchain

A comprehensive, functional blockchain implementation in Rust demonstrating key concepts of distributed ledger technology, cryptocurrency, and smart contracts.

[![Rust](https://img.shields.io/badge/rust-1.75%2B-orange.svg)](https://www.rust-lang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Docker](https://img.shields.io/badge/docker-supported-blue.svg)](https://www.docker.com/)

## 🌟 Features

### Core Blockchain Components
- ✅ **Block Structure** - Headers with metadata and transaction lists
- ✅ **Proof-of-Work** - Adjustable difficulty consensus mechanism
- ✅ **Merkle Trees** - Efficient transaction verification
- ✅ **UTXO Model** - Unspent Transaction Output tracking
- ✅ **Digital Signatures** - secp256k1 cryptographic security
- ✅ **SHA-256 Hashing** - Industry-standard cryptographic hashing

### P2P Networking
- ✅ **libp2p Integration** - Modern peer-to-peer networking
- ✅ **Peer Discovery** - Automatic network node discovery
- ✅ **Message Propagation** - Efficient block and transaction broadcasting
- ✅ **Network Synchronization** - Blockchain state synchronization
- ✅ **NAT Traversal** - Connection through firewalls and NAT

### Wallet Functionality
- ✅ **Key Management** - Secure key pair generation and storage
- ✅ **Address Generation** - Bitcoin-style address creation
- ✅ **Transaction Signing** - Cryptographic transaction authorization
- ✅ **Balance Calculation** - Real-time balance tracking
- ✅ **BIP39 Mnemonic** - Standard wallet backup and recovery

### Smart Contracts
- ✅ **WebAssembly VM** - Contract execution environment
- ✅ **Gas Mechanism** - Computational cost management
- ✅ **Contract Deployment** - On-chain code deployment
- ✅ **State Management** - Persistent contract storage

### Mining System
- ✅ **Multi-threaded Mining** - Parallel proof-of-work computation
- ✅ **Difficulty Adjustment** - Automatic network difficulty scaling
- ✅ **Block Rewards** - Incentive system with halvings
- ✅ **Mining Statistics** - Performance monitoring and reporting

### REST API
- ✅ **Block Explorer** - Web interface for blockchain browsing
- ✅ **Transaction Submission** - HTTP transaction broadcasting
- ✅ **Wallet Operations** - RESTful wallet management
- ✅ **Network Information** - Node status and statistics
- ✅ **Mining Control** - Remote mining management

## 🚀 Quick Start

### Prerequisites

- Rust 1.75+ 
- Docker (optional, for containerized deployment)
- Git

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/your-username/rust-blockchain.git
   cd rust-blockchain
   ```

2. **Build the project**
   ```bash
   cargo build --release
   ```

3. **Run tests**
   ```bash
   cargo test
   ```

### Basic Usage

#### 1. Initialize a Blockchain

```bash
# Initialize a new blockchain
./target/release/blockchain-cli blockchain init --data-dir ./data --network testnet

# Check blockchain info
./target/release/blockchain-cli blockchain info --data-dir ./data
```

#### 2. Create a Wallet

```bash
# Create a new BIP39 wallet
./target/release/blockchain-cli wallet create --name my-wallet --words 12

# Restore from mnemonic
./target/release/blockchain-cli wallet restore --name restored-wallet --mnemonic "word1 word2 ... word12"

# Check balance
./target/release/blockchain-cli wallet balance --wallet my-wallet.wallet --data-dir ./data
```

#### 3. Start a Node

```bash
# Start a blockchain node with API and P2P
./target/release/blockchain-node \
  --data-dir ./data \
  --api-port 8080 \
  --p2p-port 8333 \
  --network testnet
```

#### 4. Mine Blocks

```bash
# Start mining
./target/release/blockchain-miner \
  --data-dir ./data \
  --address your_mining_address \
  --threads 4
```

#### 5. Send Transactions

```bash
# Send coins
./target/release/blockchain-cli wallet send \
  --wallet my-wallet.wallet \
  --to recipient_address \
  --amount 1000000000 \
  --fee 1000 \
  --data-dir ./data
```

## 🐳 Docker Deployment

### Quick Start with Docker

```bash
# Basic node
./scripts/docker-setup.sh

# Development environment
./scripts/docker-setup.sh dev

# Production with monitoring
./scripts/docker-setup.sh monitoring

# Multi-node network
./scripts/docker-setup.sh multi-node

# With mining enabled
./scripts/docker-setup.sh mining
```

### Docker Compose Profiles

- **Default**: Single blockchain node
- **Development**: Hot-reload development environment
- **Production**: Load-balanced production setup
- **Mining**: Node with dedicated miner
- **Multi-node**: 3-node network for testing
- **Monitoring**: Prometheus + Grafana monitoring

## 📚 API Documentation

### REST API Endpoints

The blockchain node exposes a comprehensive REST API:

#### Blockchain Information
```http
GET /api/v1/chain/info
GET /api/v1/blocks/latest?limit=10
GET /api/v1/block/height/{height}
GET /api/v1/block/hash/{hash}
```

#### Transactions
```http
POST /api/v1/transaction
GET /api/v1/mempool
```

#### Wallet Operations
```http
POST /api/v1/wallet
POST /api/v1/wallet/restore
GET /api/v1/wallets
GET /api/v1/wallet/{name}/balance
POST /api/v1/wallet/{name}/address
POST /api/v1/send
```

#### Mining
```http
POST /api/v1/mining/start
POST /api/v1/mining/stop
GET /api/v1/mining/stats
```

#### Smart Contracts
```http
POST /api/v1/contract/deploy
POST /api/v1/contract/call
GET /api/v1/contract/{address}
```

### Example API Usage

```bash
# Get blockchain info
curl http://localhost:8080/api/v1/chain/info

# Create a wallet
curl -X POST http://localhost:8080/api/v1/wallet \
  -H "Content-Type: application/json" \
  -d '{"name": "test-wallet", "mnemonic_type": "words12"}'

# Get latest blocks
curl http://localhost:8080/api/v1/blocks/latest?limit=5

# Submit a transaction
curl -X POST http://localhost:8080/api/v1/transaction \
  -H "Content-Type: application/json" \
  -d @transaction.json
```

## 🏗️ Architecture

### System Overview

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   CLI Tools     │    │   REST API      │    │   P2P Network   │
├─────────────────┤    ├─────────────────┤    ├─────────────────┤
│ • blockchain-cli│    │ • Block Explorer│    │ • libp2p        │
│ • Wallet Mgmt   │    │ • Transactions  │    │ • Peer Discovery│
│ • Mining        │    │ • Wallet Ops    │    │ • Gossip        │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         └───────────────────────┼───────────────────────┘
                                 │
                    ┌─────────────────┐
                    │  Core Blockchain │
                    ├─────────────────┤
                    │ • Blocks/Txs    │
                    │ • UTXO Set      │
                    │ • Mempool       │
                    │ • Consensus     │
                    └─────────────────┘
                                 │
         ┌───────────────────────┼───────────────────────┐
         │                       │                       │
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│ Smart Contracts │    │   Persistence   │    │     Mining      │
├─────────────────┤    ├─────────────────┤    ├─────────────────┤
│ • WASM VM       │    │ • RocksDB       │    │ • Proof of Work │
│ • Gas Metering  │    │ • State Storage │    │ • Difficulty    │
│ • Contract State│    │ • UTXO Index    │    │ • Block Assembly│
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

### Core Components

#### Blockchain (`src/blockchain.rs`)
- Chain state management
- Block validation and storage
- UTXO set maintenance
- Difficulty adjustment

#### Cryptography (`src/crypto.rs`)
- secp256k1 key pairs
- Digital signatures
- SHA-256 hashing
- Address generation

#### Transactions (`src/transaction.rs`)
- UTXO-based transactions
- Input/output validation
- Fee calculation
- Signature verification

#### Mining (`src/mining.rs`)
- Multi-threaded proof-of-work
- Block assembly
- Difficulty targeting
- Reward calculation

#### P2P Network (`src/network.rs`)
- libp2p integration
- Peer discovery (mDNS, Kademlia)
- Message propagation (Gossipsub)
- Network synchronization

#### Smart Contracts (`src/smart_contracts.rs`)
- WebAssembly runtime
- Gas metering
- Contract deployment
- State persistence

### Data Structures

#### Block Structure
```rust
pub struct Block {
    pub header: BlockHeader,
    pub transactions: Vec<Transaction>,
}

pub struct BlockHeader {
    pub version: u32,
    pub previous_hash: Hash,
    pub merkle_root: Hash,
    pub timestamp: DateTime<Utc>,
    pub difficulty: u32,
    pub nonce: u64,
    pub height: u64,
}
```

#### Transaction Structure
```rust
pub struct Transaction {
    pub id: Hash,
    pub inputs: Vec<TxInput>,
    pub outputs: Vec<TxOutput>,
    pub lock_time: u64,
    pub timestamp: DateTime<Utc>,
    pub fee: Amount,
    pub signature: Option<Signature>,
}
```

## 🔧 Configuration

### Environment Variables

```bash
# Logging
export RUST_LOG=info                    # Log level
export RUST_BACKTRACE=1                # Enable backtraces

# Network
export BLOCKCHAIN_NETWORK=testnet      # Network type
export P2P_PORT=8333                   # P2P port
export API_PORT=8080                   # API port

# Mining
export MINING_THREADS=4                # Mining threads
export MINING_DIFFICULTY=1             # Initial difficulty

# Persistence
export DATA_DIR=./data                  # Data directory
export DB_CACHE_SIZE=100MB              # Database cache
```

### Configuration Files

#### Blockchain Config (`blockchain.toml`)
```toml
[network]
name = "testnet"
magic_bytes = [0x0b, 0x11, 0x09, 0x07]
default_port = 8333

[consensus]
target_block_time = 600  # 10 minutes
difficulty_adjustment_interval = 2016
max_block_size = 1048576  # 1MB

[mining]
block_reward = 5000000000  # 50 BTC
halving_interval = 210000
coinbase_maturity = 100
```

## 🧪 Testing

### Unit Tests
```bash
# Run all tests
cargo test

# Run specific module tests
cargo test blockchain
cargo test crypto
cargo test mining

# Run with output
cargo test -- --nocapture
```

### Integration Tests
```bash
# Run integration tests
cargo test --test integration_tests

# Run specific integration test
cargo test --test integration_tests test_end_to_end_transaction_flow
```

### Benchmark Tests
```bash
# Run benchmarks
cargo bench

# Run specific benchmark
cargo bench crypto_benchmarks

# Generate HTML report
cargo bench -- --output-format html
```

### Docker Tests
```bash
# Run tests in Docker
./scripts/docker-setup.sh test

# Run with specific profile
docker-compose -f docker-compose.test.yml up
```

## 📊 Performance

### Benchmarks

| Operation | Throughput | Latency |
|-----------|------------|---------|
| SHA-256 (1KB) | 150 MB/s | 6.7 μs |
| Key Generation | 1,200 ops/s | 833 μs |
| Signature | 800 ops/s | 1.25 ms |
| Verification | 1,100 ops/s | 909 μs |
| Merkle Tree (1000 tx) | 50 trees/s | 20 ms |
| Transaction Validation | 2,000 tx/s | 500 μs |
| Block Validation | 100 blocks/s | 10 ms |

### Optimization Tips

1. **Database Tuning**
   - Increase RocksDB cache size
   - Enable bloom filters
   - Tune compaction settings

2. **Mining Performance**
   - Use all available CPU cores
   - Optimize nonce search patterns
   - Consider GPU mining (future)

3. **Network Optimization**
   - Configure connection limits
   - Tune gossip parameters
   - Use compression

4. **Memory Management**
   - Monitor UTXO set size
   - Implement UTXO pruning
   - Cache frequently accessed data

## 🛠️ Development

### Building from Source

```bash
# Clone repository
git clone https://github.com/your-username/rust-blockchain.git
cd rust-blockchain

# Install dependencies
cargo fetch

# Build debug version
cargo build

# Build optimized release
cargo build --release

# Install CLI tools globally
cargo install --path .
```

### Development Environment

```bash
# Start development environment
./scripts/docker-setup.sh dev

# Run with hot reload
cargo watch -x "run --bin blockchain-node"

# Format code
cargo fmt

# Lint code
cargo clippy

# Check for outdated dependencies
cargo outdated
```

### Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Run the test suite
6. Submit a pull request

#### Code Style
- Follow Rust standard formatting (`cargo fmt`)
- Run Clippy lints (`cargo clippy`)
- Add documentation for public APIs
- Include unit tests for new functionality

## 🔒 Security

### Cryptographic Security
- Uses industry-standard secp256k1 curves
- SHA-256 for all hashing operations
- Proper key derivation (BIP32/BIP44)
- Secure random number generation

### Network Security
- Encrypted P2P communications
- Peer authentication
- DoS protection mechanisms
- Rate limiting

### Best Practices
- Never expose private keys
- Use hardware security modules for production
- Regular security audits
- Keep dependencies updated

## 🚨 Known Limitations

This is an educational/demonstration blockchain with several limitations:

1. **Consensus**: Basic Proof-of-Work (no advanced consensus)
2. **Scalability**: Limited transaction throughput
3. **Smart Contracts**: Basic WASM VM (not Ethereum-compatible)
4. **Production**: Not audited for production use
5. **Networking**: Basic P2P (no advanced routing)

## 📝 Roadmap

### Phase 1: Core Features ✅
- [x] Basic blockchain implementation
- [x] UTXO model
- [x] P2P networking
- [x] Wallet functionality
- [x] Mining system
- [x] REST API

### Phase 2: Advanced Features 🚧
- [ ] Light client support
- [ ] Multi-signature transactions
- [ ] Advanced scripting
- [ ] Layer 2 solutions
- [ ] Cross-chain bridges

### Phase 3: Optimization 📋
- [ ] Database optimizations
- [ ] Network improvements
- [ ] Smart contract enhancements
- [ ] Performance tuning
- [ ] Security hardening

## 📖 Learning Resources

### Blockchain Fundamentals
- [Bitcoin Whitepaper](https://bitcoin.org/bitcoin.pdf)
- [Mastering Bitcoin](https://github.com/bitcoinbook/bitcoinbook)
- [Blockchain Basics](https://www.oreilly.com/library/view/blockchain-basics/9781484226038/)

### Rust Development
- [The Rust Book](https://doc.rust-lang.org/book/)
- [Rust by Example](https://doc.rust-lang.org/rust-by-example/)
- [Rustlings](https://github.com/rust-lang/rustlings)

### Cryptography
- [Practical Cryptography](https://cryptopals.com/)
- [Cryptography Engineering](https://www.schneier.com/books/cryptography_engineering/)

## 📞 Business Contact

For business inquiries and professional services:

- **Name**: Oscar Alvarez
- **Email**: oralvarez@gmail.com

## 🤝 Support

- 📚 [Documentation](./docs/)
- 🐛 [Issue Tracker](https://github.com/your-username/rust-blockchain/issues)
- 💬 [Discussions](https://github.com/your-username/rust-blockchain/discussions)

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- [Bitcoin Core](https://github.com/bitcoin/bitcoin) - Inspiration and reference
- [libp2p](https://libp2p.io/) - P2P networking library
- [RocksDB](https://rocksdb.org/) - Storage engine
- [secp256k1](https://github.com/rust-bitcoin/rust-secp256k1) - Cryptographic library
- [actix-web](https://actix.rs/) - Web framework

---

**⚠️ Disclaimer**: This blockchain implementation is for educational purposes only. Do not use in production environments without proper security audits and testing.