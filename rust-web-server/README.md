# 🚀 High-Performance Rust Web Server

A production-ready, high-performance web server built with Rust and Actix-Web, designed to handle 10k+ concurrent connections efficiently.

## ✨ Features

### Core Server Features
- **Actix-Web Framework** with async/await support
- **Advanced Connection Pooling** (Database and Redis)
- **Custom Middleware** for rate limiting, authentication, and CORS
- **WebSocket Support** for real-time communication
- **Server-Sent Events (SSE)** for streaming data
- **Graceful Shutdown** handling
- **Health Checks** and readiness probes
- **Comprehensive Metrics** collection (Prometheus format)
- **Structured Logging** with tracing

### Performance Features
- **10k+ Concurrent Connections** support
- **Connection Pooling** with r2d2/deadpool
- **Optimized Response Caching**
- **HTTP/2 Support**
- **Static File Serving** with compression
- **Request/Response Compression** (gzip, brotli)
- **Load Balancing** ready

### Advanced Features
- **JWT Authentication** middleware
- **Rate Limiting** with token bucket algorithm
- **Request Validation** and sanitization
- **File Upload Handling** with streaming
- **GraphQL Endpoint** support (optional)
- **OpenAPI Documentation** generation
- **Database Migrations** with sqlx
- **Background Task Processing**

## 🏗️ Architecture

```
├── src/
│   ├── main.rs              # Application entry point
│   ├── config.rs            # Configuration management
│   ├── error.rs             # Error handling
│   ├── handlers/            # Request handlers
│   │   ├── auth.rs          # Authentication endpoints
│   │   ├── health.rs        # Health check endpoints
│   │   ├── metrics.rs       # Metrics endpoints
│   │   ├── upload.rs        # File upload handling
│   │   ├── websocket.rs     # WebSocket handlers
│   │   └── sse.rs           # Server-Sent Events
│   ├── middleware/          # Custom middleware
│   │   ├── auth.rs          # JWT authentication
│   │   ├── rate_limit.rs    # Rate limiting
│   │   └── metrics.rs       # Metrics collection
│   ├── models/              # Data models
│   │   ├── auth.rs          # Authentication models
│   │   └── user.rs          # User models
│   ├── routes/              # Route definitions
│   ├── services/            # Business logic services
│   │   ├── database.rs      # Database service
│   │   ├── cache.rs         # Redis cache service
│   │   └── metrics.rs       # Metrics service
│   └── utils/               # Utility functions
├── migrations/              # Database migrations
├── k8s/                     # Kubernetes manifests
├── load-tests/              # Load testing scripts
├── benches/                 # Benchmark tests
└── tests/                   # Integration tests
```

## 🚀 Quick Start

### Prerequisites

- Rust 1.75+ 
- PostgreSQL 15+
- Redis 7+
- Docker (optional)
- Kubernetes (optional)

### Local Development

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd rust-web-server
   ```

2. **Set up environment variables**
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

3. **Install dependencies**
   ```bash
   cargo build
   ```

4. **Set up database**
   ```bash
   # Start PostgreSQL and Redis (using Docker)
   docker-compose up -d postgres redis
   
   # Run migrations
   cargo run -- migrate
   ```

5. **Start the server**
   ```bash
   cargo run
   ```

The server will start on `http://localhost:8080`

### Docker Deployment

```bash
# Build and run with Docker Compose
docker-compose up -d

# Or build Docker image manually
docker build -t rust-web-server .
docker run -p 8080:8080 rust-web-server
```

### Kubernetes Deployment

```bash
# Apply Kubernetes manifests
kubectl apply -f k8s/

# Check deployment status
kubectl get pods -n rust-web-server
```

## 📊 Performance Tuning Guide

### 🔧 Server Configuration

#### Worker Threads
```bash
# Environment variable
export APP_WORKERS=8  # Number of CPU cores

# In production, set to number of CPU cores
# For I/O intensive: cores * 2
# For CPU intensive: cores
```

#### Connection Limits
```bash
export APP_MAX_CONNECTIONS=25000  # Max concurrent connections
export APP_REQUEST_TIMEOUT=30     # Request timeout in seconds
```

#### Database Pool Tuning
```bash
export APP_DATABASE__MAX_CONNECTIONS=20    # Max DB connections
export APP_DATABASE__MIN_CONNECTIONS=5     # Min DB connections
export APP_DATABASE__ACQUIRE_TIMEOUT=30    # Connection acquire timeout
export APP_DATABASE__IDLE_TIMEOUT=600      # Idle connection timeout
export APP_DATABASE__MAX_LIFETIME=1800     # Connection max lifetime
```

#### Redis Configuration
```bash
export APP_REDIS__MAX_CONNECTIONS=10  # Max Redis connections
export APP_REDIS__TIMEOUT=5           # Redis operation timeout
```

### 🚀 Performance Optimizations

#### 1. Compilation Optimizations
```toml
# Cargo.toml
[profile.release]
lto = true                # Link-time optimization
codegen-units = 1         # Single codegen unit for better optimization
panic = "abort"           # Smaller binary size
opt-level = 3             # Maximum optimization
```

#### 2. Runtime Optimizations
```bash
# Use jemalloc allocator for better memory management
export MALLOC_CONF="background_thread:true,metadata_thp:auto"

# Increase file descriptor limits
ulimit -n 65536

# TCP tuning
echo 'net.core.somaxconn = 65536' >> /etc/sysctl.conf
echo 'net.ipv4.tcp_max_syn_backlog = 65536' >> /etc/sysctl.conf
```

#### 3. Database Optimizations
```sql
-- PostgreSQL optimizations
-- shared_buffers = 25% of RAM
-- effective_cache_size = 75% of RAM
-- work_mem = RAM / max_connections
-- maintenance_work_mem = RAM / 16

-- Add indexes for frequently queried columns
CREATE INDEX CONCURRENTLY idx_users_email ON users(email);
CREATE INDEX CONCURRENTLY idx_refresh_tokens_user_id ON refresh_tokens(user_id);
```

#### 4. Redis Optimizations
```bash
# Redis configuration
maxmemory 2gb
maxmemory-policy allkeys-lru
tcp-keepalive 60
timeout 300
```

### 📈 Monitoring and Metrics

#### Prometheus Metrics
The server exposes metrics at `/api/metrics`:
- HTTP request metrics
- Database connection pool metrics
- Cache hit/miss rates
- System resource usage
- Custom business metrics

#### Health Checks
- `/api/health` - Basic health check
- `/api/health/detailed` - Detailed health with dependencies
- `/api/health/ready` - Readiness probe
- `/api/health/live` - Liveness probe

#### Logging
```bash
# Configure logging
export RUST_LOG=info                    # Log level
export LOG_FORMAT=json                  # JSON format for production
export APP_LOGGING__LEVEL=info          # Application log level
export APP_LOGGING__FORMAT=json         # Application log format
```

## 🧪 Testing and Benchmarking

### Running Tests
```bash
# Unit tests
cargo test

# Integration tests
cargo test --test integration_tests

# Benchmarks
cargo bench
```

### Load Testing
```bash
# Using provided load test scripts
cd load-tests
./run-tests.sh

# Using wrk directly
wrk -t12 -c400 -d30s -s wrk-script.lua http://localhost:8080

# Using k6
k6 run k6-load-test.js
```

### Expected Performance

On a modern 8-core server with 16GB RAM:
- **Throughput**: 50,000+ requests/second
- **Latency (P95)**: < 10ms
- **Concurrent Connections**: 10,000+
- **Memory Usage**: < 100MB base
- **CPU Usage**: < 50% at full load

## 🔒 Security Features

### Authentication & Authorization
- JWT-based authentication
- Role-based access control (RBAC)
- Permission-based authorization
- Secure password hashing with Argon2
- Token blacklisting support

### Rate Limiting
- Token bucket algorithm
- Per-IP rate limiting
- Global rate limiting
- Configurable limits and burst sizes

### Security Headers
- CORS protection
- Request validation
- Input sanitization
- Secure cookie handling

## 🛠️ Development

### Adding New Endpoints
1. Create handler in `src/handlers/`
2. Add route in `src/routes/`
3. Add authentication if needed
4. Add tests
5. Update documentation

### Database Migrations
```bash
# Create new migration
sqlx migrate add <migration_name>

# Run migrations
sqlx migrate run

# Revert migration
sqlx migrate revert
```

### Custom Middleware
```rust
// Example middleware
use actix_web::{dev::ServiceRequest, Error, HttpMessage};

pub async fn custom_middleware(
    req: ServiceRequest,
    // ... implementation
) -> Result<ServiceRequest, (Error, ServiceRequest)> {
    // Middleware logic here
    Ok(req)
}
```

## 📋 Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `APP_HOST` | `0.0.0.0` | Server bind address |
| `APP_PORT` | `8080` | Server port |
| `APP_WORKERS` | CPU cores | Number of worker threads |
| `APP_MAX_CONNECTIONS` | `25000` | Maximum connections |
| `APP_DATABASE__URL` | - | PostgreSQL URL |
| `APP_REDIS__URL` | - | Redis URL |
| `APP_JWT__SECRET` | - | JWT signing secret |
| `RUST_LOG` | `info` | Rust log level |

See `src/config.rs` for all available configuration options.

## 🐳 Container Deployment

### Docker
```dockerfile
# Multi-stage build for optimized production image
FROM rust:1.75-slim as builder
# ... build steps

FROM debian:bullseye-slim
# ... runtime setup
```

### Kubernetes
- Horizontal Pod Autoscaler (HPA)
- Service monitors for Prometheus
- Persistent volumes for data
- Health checks and probes
- Resource limits and requests

## 📚 API Documentation

### Authentication Endpoints
- `POST /api/auth/register` - User registration
- `POST /api/auth/login` - User login
- `POST /api/auth/refresh` - Refresh token
- `POST /api/v1/user/logout` - Logout (authenticated)

### Health Endpoints
- `GET /api/health` - Basic health check
- `GET /api/health/detailed` - Detailed health status
- `GET /api/health/ready` - Readiness probe
- `GET /api/health/live` - Liveness probe

### Metrics Endpoints
- `GET /api/metrics` - Prometheus metrics
- `GET /api/system` - System information

### Real-time Endpoints
- `GET /ws/` - WebSocket connection
- `GET /api/events/stream` - Server-Sent Events
- `GET /api/events/metrics` - Metrics SSE stream

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Add tests for new functionality
4. Ensure all tests pass
5. Submit a pull request

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🔗 Related Projects

- [Actix Web](https://actix.rs/) - Web framework
- [SQLx](https://github.com/launchbadge/sqlx) - Async SQL toolkit
- [Redis](https://redis.io/) - In-memory data structure store
- [Prometheus](https://prometheus.io/) - Monitoring system

## 📞 Business Contact

For business inquiries and professional services:

- **Name**: Oscar Alvarez
- **Email**: oralvarez@gmail.com

## 📞 Support

For technical support and questions:
- Create an issue on GitHub
- Check the documentation
- Review the examples in the codebase

---

**Built with ❤️ in Rust** 🦀