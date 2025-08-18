# Multi-stage build for optimized production image
FROM rust:1.75-bullseye as builder

# Install dependencies
RUN apt-get update && apt-get install -y \
    pkg-config \
    libssl-dev \
    cmake \
    clang \
    && rm -rf /var/lib/apt/lists/*

# Create app directory
WORKDIR /app

# Copy manifests
COPY Cargo.toml Cargo.lock ./

# Copy source code
COPY src ./src
COPY benches ./benches
COPY tests ./tests

# Build the application in release mode
RUN cargo build --release

# Runtime stage
FROM debian:bullseye-slim

# Install runtime dependencies
RUN apt-get update && apt-get install -y \
    ca-certificates \
    libssl1.1 \
    && rm -rf /var/lib/apt/lists/*

# Create app user
RUN groupadd -r blockchain && useradd -r -g blockchain blockchain

# Create data directory
RUN mkdir -p /data && chown blockchain:blockchain /data

# Copy binary from builder stage
COPY --from=builder /app/target/release/blockchain-node /usr/local/bin/
COPY --from=builder /app/target/release/blockchain-cli /usr/local/bin/
COPY --from=builder /app/target/release/blockchain-miner /usr/local/bin/

# Set proper permissions
RUN chmod +x /usr/local/bin/blockchain-*

# Switch to non-root user
USER blockchain

# Set working directory
WORKDIR /data

# Expose ports
EXPOSE 8080 8333

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:8080/api/v1/health || exit 1

# Default command
CMD ["blockchain-node", "--data-dir", "/data", "--api-host", "0.0.0.0"]