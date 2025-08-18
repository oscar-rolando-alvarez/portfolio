# Multi-stage Dockerfile for optimized production builds

# Stage 1: Build stage
FROM rust:1.75-slim-bullseye as builder

# Install system dependencies
RUN apt-get update && apt-get install -y \
    pkg-config \
    libssl-dev \
    libpq-dev \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Create app user
RUN adduser --disabled-password --gecos '' --shell /bin/bash --home /app appuser

# Set the working directory
WORKDIR /app

# Copy manifests
COPY Cargo.toml Cargo.lock ./

# Create a dummy main.rs to build dependencies
RUN mkdir src && echo "fn main() {}" > src/main.rs

# Build dependencies (cached layer)
RUN cargo build --release && rm -rf src target/release/deps/rust_web_server*

# Copy source code
COPY src ./src
COPY migrations ./migrations

# Build the application
RUN cargo build --release

# Stage 2: Runtime stage
FROM debian:bullseye-slim

# Install runtime dependencies
RUN apt-get update && apt-get install -y \
    ca-certificates \
    libpq5 \
    libssl1.1 \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Create app user
RUN adduser --disabled-password --gecos '' --shell /bin/bash --home /app appuser

# Create necessary directories
RUN mkdir -p /app/uploads /app/static /app/logs

# Copy the binary from builder stage
COPY --from=builder /app/target/release/rust-web-server /usr/local/bin/rust-web-server

# Copy migrations
COPY --from=builder /app/migrations /app/migrations

# Set ownership
RUN chown -R appuser:appuser /app

# Switch to app user
USER appuser
WORKDIR /app

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:8080/api/health || exit 1

# Expose port
EXPOSE 8080

# Set environment variables
ENV RUST_LOG=info
ENV APP_HOST=0.0.0.0
ENV APP_PORT=8080

# Run the application
CMD ["rust-web-server"]