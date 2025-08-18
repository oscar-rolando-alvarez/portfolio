#!/bin/bash

# Blockchain Docker Setup Script
# This script helps set up the blockchain environment using Docker

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_color() {
    printf "${1}${2}${NC}\n"
}

print_color $BLUE "🔗 Blockchain Docker Setup"
echo

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    print_color $RED "❌ Docker is not installed. Please install Docker first."
    exit 1
fi

# Check if Docker Compose is installed
if ! command -v docker-compose &> /dev/null; then
    print_color $RED "❌ Docker Compose is not installed. Please install Docker Compose first."
    exit 1
fi

# Function to show usage
show_usage() {
    echo "Usage: $0 [COMMAND] [OPTIONS]"
    echo
    echo "Commands:"
    echo "  dev                    Start development environment"
    echo "  prod                   Start production environment"
    echo "  mining                 Start with mining enabled"
    echo "  multi-node            Start multi-node network"
    echo "  monitoring            Start with monitoring (Prometheus + Grafana)"
    echo "  stop                  Stop all services"
    echo "  clean                 Clean up containers and volumes"
    echo "  logs [service]        Show logs for all services or specific service"
    echo "  build                 Build the blockchain image"
    echo "  test                  Run tests in Docker"
    echo
    echo "Options:"
    echo "  --detached, -d        Run in detached mode"
    echo "  --help, -h           Show this help message"
}

# Create necessary directories
create_directories() {
    print_color $YELLOW "📁 Creating necessary directories..."
    mkdir -p logs ssl grafana/dashboards grafana/datasources
    
    # Create basic nginx config if it doesn't exist
    if [ ! -f nginx.conf ]; then
        cat > nginx.conf << 'EOF'
events {
    worker_connections 1024;
}

http {
    upstream blockchain_nodes {
        server blockchain-node:8080;
        server blockchain-peer1:8080 backup;
        server blockchain-peer2:8080 backup;
    }

    server {
        listen 80;
        location / {
            proxy_pass http://blockchain_nodes;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
        }
    }
}
EOF
        print_color $GREEN "✅ Created nginx.conf"
    fi

    # Create basic prometheus config if it doesn't exist
    if [ ! -f prometheus.yml ]; then
        cat > prometheus.yml << 'EOF'
global:
  scrape_interval: 15s

scrape_configs:
  - job_name: 'blockchain-nodes'
    static_configs:
      - targets: ['blockchain-node:8080', 'blockchain-peer1:8080', 'blockchain-peer2:8080']
EOF
        print_color $GREEN "✅ Created prometheus.yml"
    fi
}

# Build the Docker image
build_image() {
    print_color $YELLOW "🔨 Building blockchain Docker image..."
    docker build -t blockchain:latest .
    print_color $GREEN "✅ Image built successfully"
}

# Start development environment
start_dev() {
    print_color $YELLOW "🚀 Starting development environment..."
    create_directories
    docker-compose -f docker-compose.dev.yml up $1
}

# Start production environment
start_prod() {
    print_color $YELLOW "🚀 Starting production environment..."
    create_directories
    build_image
    docker-compose --profile production up $1
}

# Start with mining
start_mining() {
    print_color $YELLOW "⛏️  Starting blockchain with mining..."
    create_directories
    build_image
    docker-compose --profile mining up $1
}

# Start multi-node network
start_multi_node() {
    print_color $YELLOW "🌐 Starting multi-node network..."
    create_directories
    build_image
    docker-compose --profile multi-node up $1
}

# Start with monitoring
start_monitoring() {
    print_color $YELLOW "📊 Starting blockchain with monitoring..."
    create_directories
    build_image
    docker-compose --profile monitoring up $1
}

# Stop all services
stop_services() {
    print_color $YELLOW "🛑 Stopping all services..."
    docker-compose down
    docker-compose -f docker-compose.dev.yml down
    print_color $GREEN "✅ All services stopped"
}

# Clean up
clean_up() {
    print_color $YELLOW "🧹 Cleaning up containers and volumes..."
    docker-compose down -v --remove-orphans
    docker-compose -f docker-compose.dev.yml down -v --remove-orphans
    docker system prune -f
    print_color $GREEN "✅ Cleanup completed"
}

# Show logs
show_logs() {
    if [ -n "$1" ]; then
        print_color $BLUE "📋 Showing logs for service: $1"
        docker-compose logs -f "$1"
    else
        print_color $BLUE "📋 Showing logs for all services"
        docker-compose logs -f
    fi
}

# Run tests
run_tests() {
    print_color $YELLOW "🧪 Running tests in Docker..."
    docker build -t blockchain-test -f Dockerfile.test .
    docker run --rm blockchain-test
    print_color $GREEN "✅ Tests completed"
}

# Parse command line arguments
DETACHED=""
COMMAND=""

while [[ $# -gt 0 ]]; do
    case $1 in
        --detached|-d)
            DETACHED="-d"
            shift
            ;;
        --help|-h)
            show_usage
            exit 0
            ;;
        dev|prod|mining|multi-node|monitoring|stop|clean|logs|build|test)
            COMMAND="$1"
            shift
            break
            ;;
        *)
            print_color $RED "❌ Unknown option: $1"
            show_usage
            exit 1
            ;;
    esac
done

# Execute command
case $COMMAND in
    dev)
        start_dev "$DETACHED"
        ;;
    prod)
        start_prod "$DETACHED"
        ;;
    mining)
        start_mining "$DETACHED"
        ;;
    multi-node)
        start_multi_node "$DETACHED"
        ;;
    monitoring)
        start_monitoring "$DETACHED"
        ;;
    stop)
        stop_services
        ;;
    clean)
        clean_up
        ;;
    logs)
        show_logs "$1"
        ;;
    build)
        build_image
        ;;
    test)
        run_tests
        ;;
    "")
        print_color $YELLOW "🔗 Starting basic blockchain node..."
        create_directories
        build_image
        docker-compose up $DETACHED
        ;;
    *)
        print_color $RED "❌ Unknown command: $COMMAND"
        show_usage
        exit 1
        ;;
esac