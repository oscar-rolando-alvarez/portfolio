#!/bin/bash

set -e

echo "🚀 Deploying DeFi Lending Protocol..."

# Check if required tools are installed
check_dependencies() {
    echo "📋 Checking dependencies..."
    
    if ! command -v anchor &> /dev/null; then
        echo "❌ Anchor CLI not found. Please install Anchor."
        exit 1
    fi
    
    if ! command -v solana &> /dev/null; then
        echo "❌ Solana CLI not found. Please install Solana CLI."
        exit 1
    fi
    
    echo "✅ Dependencies check passed"
}

# Set network configuration
setup_network() {
    local network=${1:-devnet}
    echo "🌐 Setting up network: $network"
    
    case $network in
        "localnet")
            solana config set --url localhost
            ;;
        "devnet")
            solana config set --url https://api.devnet.solana.com
            ;;
        "mainnet")
            solana config set --url https://api.mainnet-beta.solana.com
            ;;
        *)
            echo "❌ Invalid network: $network"
            exit 1
            ;;
    esac
    
    echo "✅ Network configured: $network"
}

# Deploy programs
deploy_programs() {
    echo "📦 Building and deploying programs..."
    
    # Build programs
    anchor build
    
    # Deploy programs
    anchor deploy
    
    echo "✅ Programs deployed successfully"
}

# Initialize protocol
initialize_protocol() {
    echo "🏗️ Initializing protocol..."
    
    # Run initialization script
    anchor run initialize
    
    echo "✅ Protocol initialized"
}

# Setup frontend
setup_frontend() {
    echo "🌐 Setting up frontend..."
    
    cd app
    
    # Install dependencies
    npm install
    
    # Build frontend
    npm run build
    
    cd ..
    
    echo "✅ Frontend built"
}

# Main deployment function
main() {
    local network=${1:-devnet}
    local skip_frontend=${2:-false}
    
    echo "🎯 Starting deployment to $network"
    
    check_dependencies
    setup_network $network
    deploy_programs
    initialize_protocol
    
    if [ "$skip_frontend" != "true" ]; then
        setup_frontend
    fi
    
    echo "🎉 Deployment completed successfully!"
    echo ""
    echo "📝 Next steps:"
    echo "1. Update frontend configuration with deployed program IDs"
    echo "2. Setup oracle price feeds"
    echo "3. Configure governance parameters"
    echo "4. Test all functionality"
    echo ""
    echo "🔗 Useful commands:"
    echo "  - Start frontend: npm run dev (in app directory)"
    echo "  - Run tests: anchor test"
    echo "  - Check program logs: solana logs"
}

# Run deployment
main "$@"