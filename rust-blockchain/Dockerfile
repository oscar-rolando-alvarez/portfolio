# syntax=docker/dockerfile:1.7

# ---- Build stage --------------------------------------------------------
FROM rust:1.99.1-slim-trixie AS builder
WORKDIR /app

# rust-toolchain.toml is intentionally not copied: the base image already
# provides the pinned toolchain. Storage is redb (pure Rust), so no C++
# toolchain is required.
COPY Cargo.toml Cargo.lock ./
COPY src ./src
COPY benches ./benches
COPY tests ./tests

RUN --mount=type=cache,target=/usr/local/cargo/registry \
    --mount=type=cache,target=/app/target \
    cargo build --release --locked --bins \
    && mkdir -p /out \
    && cp target/release/blockchain-node target/release/blockchain-cli target/release/blockchain-miner /out/

# ---- Runtime stage ------------------------------------------------------
FROM debian:trixie-slim AS runtime

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd --system --gid 10001 blockchain \
    && useradd --system --uid 10001 --gid blockchain --home-dir /data --shell /usr/sbin/nologin blockchain \
    && mkdir -p /data \
    && chown blockchain:blockchain /data

COPY --from=builder /out/ /usr/local/bin/

USER 10001:10001
WORKDIR /data
VOLUME ["/data"]

ENV RUST_LOG=info

# 8080: HTTP API, 8333: libp2p
EXPOSE 8080 8333

# Built-in std-only HTTP probe, so the image does not need curl.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD ["blockchain-cli", "health", "--addr", "127.0.0.1:8080"]

CMD ["blockchain-node", "--data-dir", "/data", "--api-host", "0.0.0.0", "--api-port", "8080", "--p2p-port", "8333"]
