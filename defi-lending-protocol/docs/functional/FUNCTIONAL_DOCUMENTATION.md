# DeFi Lending Protocol - Functional Documentation

## Table of Contents

1. [Protocol Overview](#protocol-overview)
2. [Core DeFi Features](#core-defi-features)
3. [Lending and Borrowing Workflows](#lending-and-borrowing-workflows)
4. [Liquidation Processes](#liquidation-processes)
5. [Governance and Voting](#governance-and-voting)
6. [Yield Farming and Rewards](#yield-farming-and-rewards)
7. [Flash Loan Usage](#flash-loan-usage)
8. [User Roles and Permissions](#user-roles-and-permissions)
9. [Risk Management Features](#risk-management-features)
10. [Protocol Parameters](#protocol-parameters)
11. [Economic Model](#economic-model)
12. [User Interface Guide](#user-interface-guide)

## Protocol Overview

The DeFi Lending Protocol is a decentralized finance platform built on Solana that enables users to:

- **Supply Assets**: Deposit tokens to earn interest and provide liquidity
- **Borrow Assets**: Take loans against supplied collateral
- **Participate in Governance**: Vote on protocol parameters and upgrades
- **Earn Rewards**: Receive governance tokens through yield farming
- **Access Flash Loans**: Borrow large amounts without collateral for arbitrage
- **Liquidate Positions**: Maintain protocol solvency by liquidating risky positions

### Key Benefits

- **High Performance**: Built on Solana for fast, low-cost transactions
- **Decentralized**: No central authority controls the protocol
- **Transparent**: All operations are recorded on-chain
- **Composable**: Integrates with other DeFi protocols
- **Governance**: Token holders control protocol evolution
- **Yield Opportunities**: Multiple ways to earn returns

## Core DeFi Features

### 1. Money Markets

The protocol operates money markets for multiple assets:

**Supported Assets**:
- **USDC** (USD Coin) - Stablecoin with 6 decimals
- **SOL** (Solana) - Native blockchain token with 9 decimals
- **USDT** (Tether) - Stablecoin with 6 decimals
- **BTC** (Bitcoin) - Wrapped Bitcoin with 8 decimals

**Market Parameters**:
- **Supply APY**: Variable rate based on utilization
- **Borrow APY**: Higher than supply rate to incentivize lending
- **Utilization Rate**: Percentage of available assets currently borrowed
- **Reserve Factor**: Percentage of interest going to protocol treasury

### 2. Interest Rate Model

**Dual-Slope Model**:
- **Optimal Utilization**: 80% for most assets
- **Below Optimal**: Gradual rate increase (4% slope)
- **Above Optimal**: Steep rate increase (60% slope) to encourage repayment

**Rate Calculation Example** (USDC):
```
At 50% Utilization:
- Borrow Rate: 2.5% APY
- Supply Rate: 2.25% APY (after 10% reserve factor)

At 90% Utilization:
- Borrow Rate: 34% APY
- Supply Rate: 27.5% APY (after 10% reserve factor)
```

### 3. Collateralization System

**Loan-to-Value (LTV) Ratios**:
- USDC: 75% - Borrow up to $75 for every $100 supplied
- SOL: 65% - Borrow up to $65 for every $100 supplied
- BTC: 70% - Borrow up to $70 for every $100 supplied

**Liquidation Thresholds**:
- USDC: 80% - Position becomes liquidatable at 80% debt ratio
- SOL: 75% - Position becomes liquidatable at 75% debt ratio
- BTC: 75% - Position becomes liquidatable at 75% debt ratio

### 4. Health Factor System

**Health Factor Calculation**:
```
Health Factor = (Total Collateral Value × Liquidation Threshold) / Total Debt Value
```

**Health Status**:
- **>150%**: Very Safe - Low liquidation risk
- **120-150%**: Safe - Moderate risk
- **105-120%**: Risky - High liquidation risk
- **100-105%**: Critical - Immediate liquidation risk
- **<100%**: Liquidatable - Position can be liquidated

## Lending and Borrowing Workflows

### Supply Workflow

1. **Connect Wallet**: Connect Solana wallet (Phantom, Solflare, etc.)
2. **Select Asset**: Choose from supported tokens (USDC, SOL, USDT, BTC)
3. **Enter Amount**: Specify amount to supply
4. **Review Transaction**: Check APY, gas fees, and transaction details
5. **Approve Transaction**: Sign transaction with wallet
6. **Receive aTokens**: Get interest-bearing receipt tokens
7. **Earn Interest**: Interest accrues automatically every second

**Supply Benefits**:
- Earn passive income through interest
- aTokens appreciate in value over time
- Maintain liquidity - withdraw anytime
- Use as collateral for borrowing

### Borrowing Workflow

1. **Supply Collateral**: Must have supplied assets first
2. **Select Borrow Asset**: Choose asset to borrow
3. **Check Borrowing Power**: View available borrowing capacity
4. **Enter Borrow Amount**: Specify amount within limits
5. **Choose Rate Type**: Select variable or stable rate
6. **Review Health Factor**: Ensure position remains safe
7. **Execute Borrow**: Receive borrowed tokens
8. **Monitor Position**: Watch health factor and rates

**Borrowing Limits**:
```
Maximum Borrow = Collateral Value × LTV Ratio

Example:
- Supply: $1,000 USDC
- LTV: 75%
- Max Borrow: $750 in any supported asset
```

### Repayment Process

1. **View Debt**: Check current debt amount including accrued interest
2. **Select Repay Amount**: Choose partial or full repayment
3. **Approve Token Spend**: Allow protocol to access tokens
4. **Execute Repayment**: Debt tokens are burned
5. **Improved Health**: Health factor increases
6. **Unlock Collateral**: Ability to withdraw more collateral

## Liquidation Processes

### Liquidation Triggers

**Automatic Liquidation** occurs when:
- Health Factor drops below 100%
- Collateral value decreases due to price drops
- Debt value increases due to accrued interest
- Oracle price updates reveal position is underwater

### Liquidation Mechanics

**Process Flow**:
1. **Health Check**: Liquidator identifies unhealthy position
2. **Debt Calculation**: Determine maximum liquidatable debt (50% of total)
3. **Price Validation**: Verify current oracle prices
4. **Execute Liquidation**: Pay debt and receive collateral + bonus
5. **Position Update**: User's debt and collateral are reduced

**Liquidation Example**:
```
User Position:
- Collateral: 100 SOL ($8,000)
- Debt: 7,000 USDC
- Health Factor: 0.95 (95% - below 100%)

Liquidation:
- Max Liquidatable Debt: 3,500 USDC (50%)
- Collateral Seized: ~50 SOL ($4,000)
- Liquidation Bonus: 15% = $600
- Liquidator Profit: $600 bonus
```

### Liquidation Protection

**For Borrowers**:
- Monitor health factor regularly
- Set up alerts for price movements
- Maintain conservative borrowing ratios
- Repay debt or add collateral when needed

**Risk Indicators**:
- Health factor approaching 120%
- High market volatility
- Collateral price declining
- Interest rates increasing

## Governance and Voting

### Governance Token (DLEND)

**Token Utilities**:
- Voting power in protocol governance
- Earning rewards through staking
- Fee discounts on protocol usage
- Revenue sharing from protocol fees

**Token Distribution**:
- 40% - Yield farming rewards (4 years)
- 25% - Development team (3-year vesting)
- 20% - Community treasury
- 10% - Early investors (2-year vesting)
- 5% - Advisors and partnerships

### Voting Process

**Proposal Creation**:
1. **Minimum Threshold**: 100,000 DLEND tokens required
2. **Proposal Details**: Title, description, and technical implementation
3. **Voting Period**: 7 days for community participation
4. **Quorum Requirement**: Minimum participation for validity

**Voting Mechanism**:
1. **Stake Tokens**: Lock DLEND tokens for voting power
2. **Vote Choices**: For, Against, or Abstain
3. **Voting Power**: Based on staked amount and lock duration
4. **Delegation**: Option to delegate voting power to others

**Execution Process**:
1. **Proposal Passes**: Must have majority support and meet quorum
2. **Timelock Period**: 2-day delay before execution
3. **Guardian Review**: Emergency cancellation for malicious proposals
4. **Implementation**: Automatic execution of approved changes

### Governance Areas

**Protocol Parameters**:
- Interest rate models
- Loan-to-value ratios
- Liquidation thresholds and bonuses
- Reserve factors
- Oracle configurations

**Protocol Upgrades**:
- New asset listings
- Smart contract improvements
- Fee structure changes
- Security enhancements

**Treasury Management**:
- Protocol fee allocation
- Development funding
- Marketing and partnerships
- Emergency fund management

## Yield Farming and Rewards

### Liquidity Mining Program

**Reward Distribution**:
- **50%** to liquidity suppliers
- **50%** to borrowers
- Rewards distributed per pool based on usage
- Higher rewards for riskier/new assets

**Calculation Method**:
```
User Rewards = (User Share × Pool Rewards × Time) / Total Pool Share

Example:
- Pool: 1,000 DLEND tokens per day
- User supplies 10% of pool liquidity
- User earns: 100 DLEND tokens per day
```

### Staking Rewards

**Governance Staking**:
- Lock DLEND tokens for enhanced voting power
- Earn additional DLEND rewards
- Longer lock periods = higher multipliers

**Lock Period Multipliers**:
- 1 month: 1.0x multiplier
- 3 months: 1.25x multiplier
- 6 months: 1.5x multiplier
- 12 months: 2.0x multiplier

**Staking Benefits**:
- Increased voting power
- Higher reward rates
- Protocol fee sharing
- Early access to new features

### Reward Claiming

**Claim Process**:
1. **Accrue Rewards**: Rewards accumulate over time
2. **View Balance**: Check earned but unclaimed rewards
3. **Claim Tokens**: Execute claim transaction
4. **Receive DLEND**: Tokens transferred to wallet
5. **Compound Option**: Automatically stake claimed rewards

## Flash Loan Usage

### Flash Loan Mechanics

**Zero-Collateral Borrowing**:
- Borrow any amount of available liquidity
- Must repay within the same transaction
- 0.09% fee charged on the borrowed amount
- Failed repayment reverts entire transaction

### Use Cases

**1. Arbitrage**:
```
Example:
1. Flash loan 100,000 USDC
2. Buy SOL on DEX A at $80
3. Sell SOL on DEX B at $81
4. Repay loan + fee (90 USDC)
5. Profit: $910 (after fees and gas)
```

**2. Collateral Swapping**:
```
Example:
1. Flash loan 50,000 USDC
2. Repay existing debt
3. Withdraw collateral
4. Supply new collateral type
5. Borrow USDC to repay flash loan
```

**3. Liquidation with Leverage**:
```
Example:
1. Flash loan liquidation amount
2. Liquidate unhealthy position
3. Sell collateral received
4. Repay flash loan
5. Keep liquidation bonus
```

### Flash Loan Integration

**For Developers**:
- Implement flash loan receiver interface
- Handle borrowed funds within callback
- Ensure repayment within same transaction
- Account for fees in profit calculations

**Safety Considerations**:
- Transaction may fail if repayment insufficient
- Gas costs can affect profitability
- Market conditions may change during execution
- Smart contract risks in complex strategies

## User Roles and Permissions

### User Types

**1. Liquidity Providers (Suppliers)**:
- Supply assets to earn interest
- Receive aTokens representing deposits
- Can withdraw supplied assets anytime (subject to utilization)
- Earn protocol governance tokens

**Permissions**:
- Supply assets to any pool
- Withdraw available liquidity
- Use deposits as collateral
- Claim yield farming rewards

**2. Borrowers**:
- Borrow assets against collateral
- Pay variable or stable interest rates
- Must maintain healthy collateral ratios
- Can repay debt anytime

**Permissions**:
- Borrow up to LTV limits
- Choose interest rate mode
- Repay debt partially or fully
- Manage collateral positions

**3. Liquidators**:
- Monitor unhealthy positions
- Execute liquidations for bonuses
- Provide crucial service to protocol
- Earn rewards for maintaining solvency

**Permissions**:
- Liquidate positions below health threshold
- Receive liquidation bonuses
- Access liquidation data
- Execute flash loan liquidations

**4. Governance Participants**:
- Hold and stake DLEND tokens
- Vote on protocol proposals
- Propose changes to protocol
- Earn governance rewards

**Permissions**:
- Create proposals (with minimum tokens)
- Vote on active proposals
- Delegate voting power
- Claim governance rewards

### Access Control System

**Protocol Administrator**:
- Initialize protocol parameters
- Add new asset pools
- Emergency pause/unpause
- Update oracle configurations

**Emergency Admin**:
- Emergency pause protocol
- Handle security incidents
- Coordinate with team
- Implement emergency fixes

**Guardian**:
- Cancel malicious proposals
- Protect governance process
- Monitor for attacks
- Coordinate with community

## Risk Management Features

### Protocol-Level Risks

**1. Smart Contract Risk**:
- **Mitigation**: Comprehensive audits, formal verification
- **Insurance**: Integration with DeFi insurance protocols
- **Upgrades**: Governance-controlled improvements
- **Bug Bounties**: Incentivize security research

**2. Oracle Risk**:
- **Primary**: Pyth Network price feeds
- **Secondary**: Switchboard as backup
- **Validation**: Price deviation and staleness checks
- **Circuit Breakers**: Pause trading on anomalous prices

**3. Liquidation Risk**:
- **Incentives**: Attractive liquidation bonuses
- **Automation**: Keeper network for reliable liquidations
- **Thresholds**: Conservative liquidation parameters
- **Monitoring**: Real-time position tracking

### User-Level Risks

**1. Liquidation Risk**:
- **Education**: Clear health factor explanation
- **Alerts**: Notifications for risky positions
- **Tools**: Risk calculators and simulators
- **Recommendations**: Suggested safe borrowing ratios

**2. Interest Rate Risk**:
- **Transparency**: Clear rate model explanation
- **Options**: Stable vs variable rate choices
- **Monitoring**: Rate change notifications
- **Flexibility**: Easy switching between rate types

**3. Asset Risk**:
- **Diversification**: Multiple asset support
- **Parameters**: Conservative LTV ratios
- **Monitoring**: Continuous price tracking
- **Adjustments**: Dynamic parameter updates

### Risk Parameters

**Conservative Settings**:
```
Asset: USDC (Stablecoin)
- LTV: 75%
- Liquidation Threshold: 80%
- Liquidation Bonus: 10%
- Reserve Factor: 10%

Asset: SOL (Volatile)
- LTV: 65%
- Liquidation Threshold: 75%
- Liquidation Bonus: 15%
- Reserve Factor: 15%
```

## Protocol Parameters

### Interest Rate Configuration

**USDC Pool**:
- Optimal Utilization: 80%
- Base Rate: 0%
- Slope 1: 4%
- Slope 2: 60%
- Stable Rate Spread: 2%

**SOL Pool**:
- Optimal Utilization: 70%
- Base Rate: 0%
- Slope 1: 7%
- Slope 2: 300%
- Stable Rate Spread: 3%

### Risk Parameters by Asset

| Parameter | USDC | SOL | USDT | BTC |
|-----------|------|-----|------|-----|
| LTV | 75% | 65% | 75% | 70% |
| Liquidation Threshold | 80% | 75% | 80% | 75% |
| Liquidation Bonus | 10% | 15% | 10% | 12% |
| Reserve Factor | 10% | 15% | 10% | 15% |
| Decimal Places | 6 | 9 | 6 | 8 |

### Fee Structure

**Protocol Fees**:
- Reserve Factor: 10-15% of interest paid
- Flash Loan Fee: 0.09% of borrowed amount
- Liquidation Bonus: 5-20% depending on asset
- Governance Staking: No fees

**Gas Costs** (Approximate):
- Supply: 0.001 SOL
- Borrow: 0.002 SOL
- Repay: 0.001 SOL
- Liquidate: 0.003 SOL
- Flash Loan: 0.002 SOL

### Oracle Configuration

**Price Feed Settings**:
- Maximum Age: 5 minutes
- Confidence Threshold: 1%
- Update Frequency: Real-time
- Fallback Mechanism: Secondary oracle

**Supported Oracles**:
- Pyth Network (Primary)
- Switchboard (Secondary)
- Chainlink (Future integration)

## Economic Model

### Revenue Streams

**1. Interest Spread**:
- Difference between borrowing and lending rates
- Reserve factor captures portion for protocol
- Funds protocol development and security

**2. Flash Loan Fees**:
- 0.09% fee on all flash loans
- High-volume, low-risk revenue source
- Supports liquidity without permanent capital

**3. Liquidation Fees**:
- Small fee on liquidation bonuses
- Incentivizes healthy ecosystem
- Funds liquidation infrastructure

### Token Economics

**DLEND Token Supply**: 100,000,000 tokens

**Emission Schedule**:
- Year 1: 40% of rewards (decreasing rate)
- Year 2: 30% of rewards
- Year 3: 20% of rewards
- Year 4: 10% of rewards
- After Year 4: Governance-determined

**Value Accrual**:
- Fee sharing to stakers
- Governance voting rights
- Protocol ownership
- Future upgrade benefits

### Sustainability Model

**Long-term Viability**:
- Diversified revenue streams
- Conservative risk parameters
- Community governance
- Continuous innovation

**Growth Strategy**:
- New asset listings
- Cross-chain expansion
- Institutional partnerships
- DeFi integrations

## User Interface Guide

### Getting Started

**1. Wallet Connection**:
- Install Phantom, Solflare, or compatible wallet
- Visit protocol website
- Click "Connect Wallet"
- Approve connection in wallet

**2. First Deposit**:
- Navigate to "Supply" section
- Select asset (USDC recommended for beginners)
- Enter amount to supply
- Review transaction details
- Confirm transaction

**3. Earning Interest**:
- View your aTokens in wallet
- Check earnings in dashboard
- Interest compounds automatically
- Withdraw anytime (subject to utilization)

### Dashboard Overview

**Portfolio Section**:
- Total supplied value
- Total borrowed value
- Net APY across positions
- Health factor status

**Markets Section**:
- Available assets
- Current APY rates
- Utilization rates
- Your positions

**Rewards Section**:
- Earned DLEND tokens
- Staking rewards
- Claimable amounts
- Staking options

### Advanced Features

**Borrowing Interface**:
```
Collateral: $10,000 USDC
Available to Borrow: $7,500 (75% LTV)
Health Factor: 1.5 (Safe)

Borrow Options:
- SOL: 5.2% APY Variable
- USDT: 3.8% APY Variable
- BTC: 4.1% APY Variable
```

**Risk Management Tools**:
- Health factor calculator
- Liquidation price alerts
- Position simulator
- Risk recommendations

**Governance Interface**:
- Active proposals
- Voting history
- Staking dashboard
- Delegation options

### Mobile Experience

**Responsive Design**:
- Optimized for mobile browsers
- Touch-friendly interface
- Quick actions for common tasks
- Real-time notifications

**Key Features**:
- Portfolio overview
- Quick supply/borrow
- Health monitoring
- Reward claiming

---

This functional documentation provides comprehensive guidance for users to understand and interact with the DeFi Lending Protocol. The platform offers sophisticated financial services while maintaining user-friendly interfaces and robust risk management features, making it accessible to both beginners and experienced DeFi users.