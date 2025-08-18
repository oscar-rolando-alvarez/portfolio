#!/bin/bash

set -e

echo "🚀 Starting DeFi Lending Protocol..."

# Environment setup
export NODE_ENV=${NODE_ENV:-production}
export PORT=${PORT:-3000}

# Check if programs are deployed
check_programs() {
    echo "📋 Checking program deployment..."
    
    if [ ! -d "target/deploy" ]; then
        echo "⚠️ Programs not found. Building..."
        anchor build
    fi
    
    echo "✅ Programs ready"
}

# Start services
start_services() {
    echo "🔧 Starting services..."
    
    # Start frontend
    cd app
    npm start &
    FRONTEND_PID=$!
    
    echo "✅ Frontend started on port $PORT (PID: $FRONTEND_PID)"
    
    # Keep container running
    wait $FRONTEND_PID
}

# Health check
health_check() {
    echo "🏥 Running health check..."
    
    # Wait for frontend to be ready
    timeout 60 bash -c 'until curl -f http://localhost:3000/health 2>/dev/null; do sleep 1; done' || {
        echo "❌ Health check failed"
        exit 1
    }
    
    echo "✅ All services healthy"
}

# Cleanup function
cleanup() {
    echo "🧹 Cleaning up..."
    if [ ! -z "$FRONTEND_PID" ]; then
        kill $FRONTEND_PID 2>/dev/null || true
    fi
}

# Set trap for cleanup
trap cleanup EXIT

# Main function
main() {
    check_programs
    start_services
    health_check
}

# Run if script is executed directly
if [ "${BASH_SOURCE[0]}" == "${0}" ]; then
    main "$@"
fi