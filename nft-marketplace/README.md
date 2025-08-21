# Advanced NFT Marketplace on Solana

A comprehensive, production-ready NFT marketplace built on the Solana blockchain with advanced features including real-time bidding, auction systems, royalty distribution, and analytics.

## 🚀 Features

### Core Marketplace
- **NFT Listing & Trading**: List, buy, and sell NFTs with customizable pricing
- **Offer System**: Make and accept offers on listed NFTs
- **Escrow System**: Secure escrow for all transactions
- **Fee Management**: Configurable marketplace fees with admin controls

### Advanced Features
- **Auction System**: Real-time bidding with automatic settlement
- **Royalty Distribution**: Automatic royalty payments to creators
- **Collection Management**: Create and manage NFT collections
- **Rarity Scoring**: Advanced rarity calculation and ranking
- **Analytics Dashboard**: Comprehensive marketplace metrics and insights

### Minting & Collections
- **Custom NFT Minting**: Mint NFTs with custom metadata and traits
- **Collection Creation**: Create verified collections with custom settings
- **Candy Machine Integration**: Automated minting with whitelist support
- **Batch Minting**: Efficient batch minting for large collections
- **Metadata Standards**: Full Metaplex compatibility

### Frontend Features
- **Multi-Wallet Support**: Phantom, Solflare, Ledger, and more
- **Real-time Updates**: WebSocket integration for live bidding
- **Advanced Search**: Fuzzy search with filters and sorting
- **Responsive Design**: Mobile-first responsive interface
- **Dark/Light Theme**: Theme switching with system preference

### Security & Performance
- **Security Audited**: Following Solana security best practices
- **Rate Limiting**: Protection against spam and abuse
- **Caching**: Redis caching for optimal performance
- **Monitoring**: Prometheus metrics and Grafana dashboards
- **Load Balancing**: Nginx reverse proxy configuration

## 🏗️ Architecture

### Programs (Smart Contracts)
```
programs/
├── marketplace/          # Core marketplace functionality
├── nft-minting/         # NFT creation and metadata
├── auction-system/      # Real-time auction mechanics
├── royalty-distribution/ # Creator royalty payments
├── collection-manager/   # Collection verification and management
└── escrow-system/       # Secure transaction escrow
```

### Frontend Application
```
app/
├── src/
│   ├── components/      # React components
│   ├── contexts/        # React contexts
│   ├── hooks/          # Custom hooks
│   ├── pages/          # Next.js pages
│   ├── services/       # API services
│   ├── utils/          # Utility functions
│   └── types/          # TypeScript types
```

### Infrastructure
```
├── docker-compose.yml   # Multi-service development environment
├── nginx/              # Reverse proxy configuration
├── monitoring/         # Prometheus & Grafana setup
└── scripts/           # Deployment and utility scripts
```

## 🛠️ Tech Stack

### Blockchain
- **Solana**: High-performance blockchain
- **Anchor**: Solana development framework
- **Metaplex**: NFT metadata standards
- **SPL Token**: Token program integration

### Frontend
- **Next.js 14**: React framework with App Router
- **TypeScript**: Type-safe development
- **Tailwind CSS**: Utility-first styling
- **Solana Web3.js**: Blockchain interaction
- **React Query**: Data fetching and caching
- **Zustand**: State management
- **Socket.IO**: Real-time communication

### Infrastructure
- **Docker**: Containerization
- **Nginx**: Reverse proxy and load balancing
- **Redis**: Caching and real-time data
- **PostgreSQL**: Analytics and metadata storage
- **IPFS**: Decentralized metadata storage
- **Prometheus**: Metrics collection
- **Grafana**: Monitoring dashboards

## 🚀 Quick Start

### Prerequisites
- Node.js 18+
- Rust 1.70+
- Solana CLI 1.16+
- Anchor CLI 0.29+
- Docker & Docker Compose

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd nft-marketplace
   ```

2. **Install dependencies**
   ```bash
   # Install Anchor dependencies
   npm install
   
   # Install frontend dependencies
   cd app && npm install && cd ..
   ```

3. **Setup Solana environment**
   ```bash
   # Create new keypair (if needed)
   solana-keygen new --outfile ~/.config/solana/id.json
   
   # Set to devnet
   solana config set --url devnet
   
   # Airdrop SOL for testing
   solana airdrop 2
   ```

4. **Build and deploy programs**
   ```bash
   # Build all programs
   anchor build
   
   # Deploy to devnet
   ./scripts/deploy.sh devnet
   ```

5. **Start development environment**
   ```bash
   # Start all services
   docker-compose up -d
   
   # Start frontend development server
   cd app && npm run dev
   ```

6. **Access the application**
   - Frontend: http://localhost:3000
   - Analytics: http://localhost:3002
   - Grafana: http://localhost:3003

## 📖 Usage Guide

### For Creators

1. **Connect Wallet**
   - Click "Connect Wallet" and select your preferred wallet
   - Ensure you're on the correct network (devnet for testing)

2. **Create Collection**
   - Navigate to "Create" → "New Collection"
   - Upload collection image and metadata
   - Set royalty percentage and supply limits

3. **Mint NFTs**
   - Go to "Create" → "Mint NFT"
   - Upload artwork and set metadata
   - Add traits and rarity information
   - Choose collection (optional)

4. **Setup Candy Machine**
   - Navigate to "Create" → "Candy Machine"
   - Configure pricing, launch date, and whitelist
   - Upload metadata for batch minting

### For Traders

1. **Browse Marketplace**
   - Explore collections and individual NFTs
   - Use search and filters to find specific items
   - Check rarity scores and price history

2. **Purchase NFTs**
   - Click on any listed NFT
   - Review details and price
   - Click "Buy Now" and confirm transaction

3. **Make Offers**
   - On NFT detail page, click "Make Offer"
   - Set offer amount and expiration
   - Funds are escrowed until accepted or expired

4. **Participate in Auctions**
   - Find active auctions in the marketplace
   - Place bids in real-time
   - Monitor auction status and automatic settlement

### For Collectors

1. **List NFTs**
   - Go to your profile and select an NFT
   - Click "List for Sale"
   - Set price, duration, and offer settings

2. **Manage Listings**
   - View active listings in your profile
   - Update prices or cancel listings
   - Accept offers from potential buyers

3. **Track Portfolio**
   - Monitor your collection value
   - View transaction history
   - Analyze profit/loss metrics

## 🔧 Configuration

### Environment Variables

#### Frontend (.env.local)
```env
NEXT_PUBLIC_SOLANA_NETWORK=devnet
NEXT_PUBLIC_RPC_ENDPOINT=https://api.devnet.solana.com
NEXT_PUBLIC_MARKETPLACE_PROGRAM_ID=<program-id>
NEXT_PUBLIC_NFT_MINTING_PROGRAM_ID=<program-id>
NEXT_PUBLIC_WEBSOCKET_URL=ws://localhost:3001
```

#### Backend Services
```env
NODE_ENV=development
DATABASE_URL=postgresql://user:password@localhost:5432/nft_marketplace
REDIS_URL=redis://localhost:6379
SOLANA_RPC_URL=https://api.devnet.solana.com
```

### Program Configuration

Programs can be configured through initialization instructions:

```typescript
// Marketplace configuration
const marketplaceFee = 250; // 2.5%
const maxListingDuration = 30 * 24 * 60 * 60; // 30 days

// Collection settings
const royaltyPercentage = 500; // 5%
const maxSupply = 10000; // Optional supply limit
```

## 🧪 Testing

### Program Tests
```bash
# Run all program tests
anchor test

# Run specific program tests
anchor test --skip-deploy -- --grep "marketplace"
```

### Frontend Tests
```bash
cd app

# Run unit tests
npm test

# Run with coverage
npm run test:coverage

# Run E2E tests
npm run test:e2e
```

### Integration Tests
```bash
# Start test environment
docker-compose -f docker-compose.test.yml up -d

# Run integration tests
npm run test:integration
```

## 🚀 Deployment

### Development Deployment
```bash
# Deploy to devnet
./scripts/deploy.sh devnet

# Deploy to testnet
./scripts/deploy.sh testnet ~/.config/solana/testnet-keypair.json
```

### Production Deployment
```bash
# Deploy to mainnet (requires mainnet keypair)
./scripts/deploy.sh mainnet-beta ~/.config/solana/mainnet-keypair.json

# Deploy frontend to production
cd app && npm run build && npm start
```

### Docker Deployment
```bash
# Build and start all services
docker-compose up -d

# Scale specific services
docker-compose up -d --scale websocket=3

# View logs
docker-compose logs -f frontend
```

## 📊 Monitoring

### Metrics & Monitoring
- **Prometheus**: Metrics collection at http://localhost:9090
- **Grafana**: Dashboards at http://localhost:3003
- **Application Logs**: `docker-compose logs -f <service>`

### Key Metrics
- Transaction volume and count
- Active listings and sales
- User engagement metrics
- Program execution costs
- Real-time bidding activity

## 🔒 Security

### Security Features
- **Input Validation**: All user inputs validated
- **Access Controls**: Role-based permissions
- **Escrow Protection**: Secure fund handling
- **Rate Limiting**: Anti-spam protection
- **Audit Trail**: Complete transaction history

### Security Best Practices
- Regular security audits
- Multi-signature for admin functions
- Proper error handling
- Secure key management
- Regular dependency updates

See [SECURITY.md](./docs/SECURITY.md) for the complete security audit checklist.

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

Please read [CONTRIBUTING.md](./docs/CONTRIBUTING.md) for detailed contribution guidelines.

## 📚 Documentation

- [API Documentation](./docs/API.md)
- [Program Documentation](./docs/PROGRAMS.md)
- [Frontend Guide](./docs/FRONTEND.md)
- [Security Audit](./docs/SECURITY.md)
- [Deployment Guide](./docs/DEPLOYMENT.md)

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 📞 Business Contact

For business inquiries and professional services:

- **Name**: Oscar Alvarez
- **Email**: oralvarez@gmail.com

## 🆘 Support

- **Documentation**: Check the docs/ directory
- **Issues**: Create an issue on GitHub
- **Discord**: Join our community Discord

## 🙏 Acknowledgments

- Solana Foundation for the amazing blockchain platform
- Metaplex for NFT standards and tools
- Anchor framework for Solana development
- The open-source community for invaluable tools and libraries

---

Built with ❤️ for the Solana ecosystem