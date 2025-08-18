# DeFi Lending Protocol on Solana

A comprehensive decentralized finance (DeFi) lending protocol built on Solana using the Anchor framework. This protocol enables users to lend, borrow, participate in governance, and utilize flash loans in a trustless environment.

## 🌟 Features

### Core Lending Features
- **Lending & Borrowing**: Supply assets to earn interest or borrow against collateral
- **Liquidity Pools**: Multiple token pools with dynamic interest rates
- **Collateral Management**: Over-collateralized loans with automated liquidations
- **Interest Rate Models**: Dynamic rates based on supply and demand

### Advanced Features
- **Flash Loans**: Instant, uncollateralized loans for arbitrage and liquidations
- **Governance Token**: Decentralized governance with voting and proposals
- **Yield Farming**: Additional rewards for liquidity providers
- **Price Oracles**: Integration with Pyth and Switchboard for accurate pricing
- **Liquidation Engine**: Automated liquidations to maintain protocol solvency

### Technical Features
- **Anchor Framework**: Type-safe Rust smart contracts
- **React Frontend**: Modern web interface with wallet integration
- **Comprehensive Testing**: Full test coverage with Anchor Test Suite
- **Docker Support**: Containerized deployment
- **Monitoring**: Built-in metrics and health checks

## 🏗️ Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Frontend      │    │   Anchor        │    │   Oracles       │
│   (React/Next)  │◄──►│   Programs      │◄──►│   (Pyth/Switch) │
└─────────────────┘    └─────────────────┘    └─────────────────┘
        │                       │                       │
        │                       │                       │
        ▼                       ▼                       ▼
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Wallet        │    │   Solana        │    │   Token         │
│   Integration   │    │   Blockchain    │    │   Accounts      │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

### Smart Contract Structure

- **Main Protocol** (`defi-lending-protocol`): Core lending logic
- **Governance Token** (`governance-token`): DAO governance functionality
- **Price Oracles**: External price feed integration
- **Interest Rate Models**: Dynamic rate calculations
- **Liquidation Engine**: Automated position liquidations

## 🚀 Quick Start

### Prerequisites

- **Rust** 1.75+
- **Solana CLI** 1.17.0+
- **Anchor CLI** 0.29.0+
- **Node.js** 18+
- **Docker** (optional)

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd defi-lending-protocol
   ```

2. **Install dependencies**
   ```bash
   # Install Rust dependencies
   anchor build
   
   # Install frontend dependencies
   cd app && npm install && cd ..
   ```

3. **Configure Solana CLI**
   ```bash
   # For devnet
   solana config set --url https://api.devnet.solana.com
   
   # Create a keypair (if you don't have one)
   solana-keygen new
   ```

4. **Deploy to devnet**
   ```bash
   chmod +x scripts/deploy.sh
   ./scripts/deploy.sh devnet
   ```

5. **Start the frontend**
   ```bash
   cd app
   npm run dev
   ```

### Docker Deployment

1. **Build and start all services**
   ```bash
   docker-compose up -d
   ```

2. **For local development with test validator**
   ```bash
   docker-compose --profile local up -d
   ```

3. **For production with monitoring**
   ```bash
   docker-compose --profile production --profile monitoring up -d
   ```

## 📚 Documentation

### Smart Contract Documentation

#### Protocol Initialization
```rust
// Initialize the main protocol
pub fn initialize_protocol(
    ctx: Context<InitializeProtocol>,
    admin: Pubkey,
    fee_rate: u64,
) -> Result<()>
```

#### Pool Management
```rust
// Create a new lending pool
pub fn initialize_pool(
    ctx: Context<InitializePool>,
    asset_mint: Pubkey,
    collateral_factor: u64,
    reserve_factor: u64,
    liquidation_threshold: u64,
    liquidation_bonus: u64,
) -> Result<()>
```

#### Core Operations
```rust
// Supply assets to earn interest
pub fn supply(ctx: Context<Supply>, amount: u64) -> Result<()>

// Borrow against collateral
pub fn borrow(ctx: Context<Borrow>, amount: u64) -> Result<()>

// Repay borrowed amount
pub fn repay(ctx: Context<Repay>, amount: u64) -> Result<()>

// Withdraw supplied assets
pub fn withdraw(ctx: Context<Withdraw>, amount: u64) -> Result<()>
```

#### Advanced Features
```rust
// Execute flash loan
pub fn flash_loan(
    ctx: Context<FlashLoan>,
    amount: u64,
    params: Vec<u8>,
) -> Result<()>

// Liquidate unhealthy positions
pub fn liquidate(
    ctx: Context<Liquidate>,
    debt_to_cover: u64,
    receive_a_token: bool,
) -> Result<()>
```

### Frontend Integration

#### Wallet Connection
```typescript
import { useWallet } from '@solana/wallet-adapter-react'
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui'

function App() {
  const { connected, publicKey } = useWallet()
  
  return (
    <div>
      <WalletMultiButton />
      {connected && <Dashboard />}
    </div>
  )
}
```

#### Program Interaction
```typescript
import { useProgram } from '../hooks/useProgram'

function LendingInterface() {
  const { program } = useProgram()
  
  const supply = async (amount: number) => {
    await program.methods
      .supply(new BN(amount))
      .accounts({
        // ... accounts
      })
      .rpc()
  }
}
```

## 🔧 Configuration

### Environment Variables

#### Frontend (`.env.local`)
```env
NEXT_PUBLIC_RPC_URL=https://api.devnet.solana.com
NEXT_PUBLIC_NETWORK=devnet
NEXT_PUBLIC_PROGRAM_ID=DLendpNGzTTDdRsQHBJyYgQV9qR8JwKyFfvKSzWE8hT
```

#### Docker (`.env`)
```env
NODE_ENV=production
POSTGRES_PASSWORD=secure_password
REDIS_PASSWORD=secure_password
SOLANA_NETWORK=devnet
```

### Program Configuration

#### Interest Rate Models
```rust
InterestRateStrategy {
    optimal_utilization_rate: 8000, // 80%
    base_variable_borrow_rate: 0,   // 0%
    variable_rate_slope1: 400,      // 4%
    variable_rate_slope2: 6000,     // 60%
    stable_rate_slope1: 200,        // 2%
    stable_rate_slope2: 6000,       // 60%
}
```

#### Pool Parameters
```rust
ReserveConfig {
    ltv: 7500,                    // 75% Loan-to-Value
    liquidation_threshold: 8000,   // 80% Liquidation threshold
    liquidation_bonus: 1000,       // 10% Liquidation bonus
    reserve_factor: 1000,          // 10% Reserve factor
    borrowing_enabled: true,
    stable_borrowing_enabled: true,
}
```

## 🧪 Testing

### Run All Tests
```bash
anchor test
```

### Run Specific Test Suite
```bash
# Protocol tests
anchor test --skip-deploy -- --grep "Protocol"

# Lending tests
anchor test --skip-deploy -- --grep "Lending"

# Governance tests
anchor test --skip-deploy -- --grep "Governance"
```

### Frontend Tests
```bash
cd app
npm test
```

### Integration Tests
```bash
# Start local validator
solana-test-validator

# Run integration tests
npm run test:integration
```

## 🔐 Security Considerations

### Smart Contract Security

1. **Access Controls**
   - Admin-only functions protected with proper checks
   - User authorization validated for all operations
   - Role-based permissions for protocol management

2. **Mathematical Safety**
   - All arithmetic operations use checked math
   - Overflow protection in interest calculations
   - Precision handling for decimal operations

3. **Oracle Security**
   - Price staleness checks
   - Confidence interval validation
   - Multiple oracle support for redundancy

4. **Liquidation Protection**
   - Health factor monitoring
   - Automated liquidation triggers
   - Liquidation bonus caps

### Frontend Security

1. **Wallet Integration**
   - Secure wallet adapter implementation
   - Transaction verification before signing
   - User confirmation for all operations

2. **Input Validation**
   - Client-side input sanitization
   - Amount validation and limits
   - Error handling and user feedback

### Operational Security

1. **Key Management**
   - Secure keypair generation
   - Multi-signature for admin operations
   - Hardware wallet support

2. **Monitoring**
   - Real-time health monitoring
   - Alert system for anomalies
   - Automated backup procedures

## 📊 Monitoring and Analytics

### Built-in Metrics

- **Protocol TVL** (Total Value Locked)
- **Utilization Rates** per pool
- **Interest Rates** (supply and borrow)
- **Health Factors** of positions
- **Liquidation Events**
- **Flash Loan Usage**

### Grafana Dashboard

Access monitoring dashboard at `http://localhost:3001` (when running with monitoring profile)

Default credentials: `admin/admin`

### Health Checks

```bash
# Check protocol health
curl http://localhost:3000/api/health

# Check specific pool health
curl http://localhost:3000/api/pools/USDC/health
```

## 🚀 Deployment

### Development Deployment

1. **Local Test Validator**
   ```bash
   # Start test validator
   solana-test-validator
   
   # Deploy programs
   ./scripts/deploy.sh localnet
   ```

2. **Devnet Deployment**
   ```bash
   # Deploy to devnet
   ./scripts/deploy.sh devnet
   
   # Verify deployment
   solana program show DLendpNGzTTDdRsQHBJyYgQV9qR8JwKyFfvKSzWE8hT
   ```

### Production Deployment

1. **Mainnet Deployment**
   ```bash
   # Deploy to mainnet (requires sufficient SOL)
   ./scripts/deploy.sh mainnet
   ```

2. **Frontend Deployment**
   ```bash
   # Build optimized frontend
   cd app && npm run build
   
   # Deploy to Vercel/Netlify
   npx vercel deploy
   ```

## 🤝 Contributing

### Development Workflow

1. **Fork the repository**
2. **Create a feature branch**
   ```bash
   git checkout -b feature/awesome-feature
   ```
3. **Make changes and test**
   ```bash
   anchor test
   npm test
   ```
4. **Commit changes**
   ```bash
   git commit -m "feat: add awesome feature"
   ```
5. **Push and create PR**
   ```bash
   git push origin feature/awesome-feature
   ```

### Code Standards

- **Rust**: Follow Rust standard conventions
- **TypeScript**: Use ESLint and Prettier
- **Commits**: Follow conventional commit format
- **Testing**: Maintain >90% test coverage

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- **Solana Foundation** for the blockchain infrastructure
- **Anchor Framework** for smart contract development
- **Pyth Network** for price oracle services
- **Switchboard** for additional oracle functionality

## 📞 Support

- **Documentation**: [Link to docs]
- **Discord**: [Discord invite]
- **Twitter**: [@DefiLendingProtocol]
- **Email**: support@defilending.io

## 🗺️ Roadmap

### Q1 2024
- ✅ Core lending protocol
- ✅ Basic governance
- ✅ Frontend interface

### Q2 2024
- 🔄 Flash loan marketplace
- 🔄 Cross-chain bridging
- 🔄 Mobile application

### Q3 2024
- ⏳ Leveraged trading
- ⏳ Insurance pools
- ⏳ Advanced analytics

### Q4 2024
- ⏳ Institutional features
- ⏳ Layer 2 integration
- ⏳ Global expansion

---

**Built with ❤️ on Solana**