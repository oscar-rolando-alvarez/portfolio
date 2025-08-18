#!/bin/bash

# NFT Marketplace Deployment Script
# This script deploys all Anchor programs to the specified Solana network

set -e

# Configuration
NETWORK=${1:-devnet}
KEYPAIR_PATH=${2:-~/.config/solana/id.json}

echo "🚀 Starting NFT Marketplace deployment to $NETWORK"
echo "Using keypair: $KEYPAIR_PATH"

# Validate network
if [[ ! "$NETWORK" =~ ^(devnet|testnet|mainnet-beta)$ ]]; then
    echo "❌ Invalid network. Use: devnet, testnet, or mainnet-beta"
    exit 1
fi

# Check if Solana CLI is installed
if ! command -v solana &> /dev/null; then
    echo "❌ Solana CLI not found. Please install it first."
    exit 1
fi

# Check if Anchor CLI is installed
if ! command -v anchor &> /dev/null; then
    echo "❌ Anchor CLI not found. Please install it first."
    exit 1
fi

# Set Solana config
echo "🔧 Configuring Solana CLI..."
solana config set --url $NETWORK
solana config set --keypair $KEYPAIR_PATH

# Get wallet address
WALLET_ADDRESS=$(solana address)
echo "📍 Deploying from wallet: $WALLET_ADDRESS"

# Check wallet balance
BALANCE=$(solana balance --lamports)
REQUIRED_BALANCE=100000000 # 0.1 SOL in lamports

if [ "$BALANCE" -lt "$REQUIRED_BALANCE" ]; then
    echo "❌ Insufficient balance. You need at least 0.1 SOL for deployment."
    if [ "$NETWORK" = "devnet" ]; then
        echo "💰 Requesting airdrop..."
        solana airdrop 2
        sleep 5
    else
        exit 1
    fi
fi

# Build all programs
echo "🏗️ Building Anchor programs..."
anchor build

# Update program IDs
echo "📝 Updating program IDs..."
anchor keys list > .program-keys.txt

# Deploy programs in order
echo "🚀 Deploying programs..."

echo "1️⃣ Deploying Marketplace program..."
anchor deploy --program-name marketplace --provider.cluster $NETWORK

echo "2️⃣ Deploying NFT Minting program..."
anchor deploy --program-name nft-minting --provider.cluster $NETWORK

echo "3️⃣ Deploying Auction System program..."
anchor deploy --program-name auction-system --provider.cluster $NETWORK

echo "4️⃣ Deploying Royalty Distribution program..."
anchor deploy --program-name royalty-distribution --provider.cluster $NETWORK

echo "5️⃣ Deploying Collection Manager program..."
anchor deploy --program-name collection-manager --provider.cluster $NETWORK

echo "6️⃣ Deploying Escrow System program..."
anchor deploy --program-name escrow-system --provider.cluster $NETWORK

# Initialize marketplace
echo "🎯 Initializing marketplace..."
anchor run initialize-marketplace --provider.cluster $NETWORK

# Verify deployment
echo "✅ Verifying deployment..."
echo "Program addresses:"
anchor keys list

# Save deployment info
DEPLOY_DATE=$(date)
DEPLOY_INFO_FILE="deployments/$NETWORK-$(date +%Y%m%d-%H%M%S).json"
mkdir -p deployments

cat > "$DEPLOY_INFO_FILE" << EOF
{
  "network": "$NETWORK",
  "deployedAt": "$DEPLOY_DATE",
  "deployerWallet": "$WALLET_ADDRESS",
  "programs": $(anchor keys list --json),
  "commit": "$(git rev-parse HEAD)",
  "branch": "$(git branch --show-current)"
}
EOF

echo "📄 Deployment info saved to: $DEPLOY_INFO_FILE"

# Update frontend environment
echo "🔧 Updating frontend environment..."
cat > "app/.env.local" << EOF
NEXT_PUBLIC_SOLANA_NETWORK=$NETWORK
NEXT_PUBLIC_RPC_ENDPOINT=$(solana config get | grep "RPC URL" | awk '{print $3}')
NEXT_PUBLIC_MARKETPLACE_PROGRAM_ID=$(anchor keys list | grep "marketplace" | awk '{print $2}')
NEXT_PUBLIC_NFT_MINTING_PROGRAM_ID=$(anchor keys list | grep "nft_minting" | awk '{print $2}')
NEXT_PUBLIC_AUCTION_PROGRAM_ID=$(anchor keys list | grep "auction_system" | awk '{print $2}')
EOF

echo "✅ NFT Marketplace deployed successfully to $NETWORK!"
echo "🌐 Frontend environment updated"
echo "🔗 View on Solana Explorer: https://explorer.solana.com/address/$WALLET_ADDRESS?cluster=$NETWORK"

# Start the frontend if requested
read -p "🚀 Start the frontend development server? (y/n): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "Starting frontend..."
    cd app && npm run dev
fi