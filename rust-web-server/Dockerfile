# syntax=docker/dockerfile:1.7

# ---- Build stage --------------------------------------------------------
FROM rust:1.99.1-slim-trixie AS builder
WORKDIR /app

# Cache dependencies separately from application sources.
# rust-toolchain.toml is intentionally not copied: the base image already
# provides the pinned toolchain.
COPY Cargo.toml Cargo.lock ./
RUN mkdir -p src benches \
    && echo 'fn main() {}' > src/main.rs \
    && touch src/lib.rs \
    && echo 'fn main() {}' > benches/server_benchmark.rs \
    && cargo build --release --locked --bin rust-web-server \
    && rm -rf src benches

COPY src ./src
COPY benches ./benches
COPY migrations ./migrations
RUN touch src/main.rs src/lib.rs \
    && cargo build --release --locked --bin rust-web-server

# ---- Runtime stage ------------------------------------------------------
FROM debian:trixie-slim AS runtime

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd --system --gid 10001 app \
    && useradd --system --uid 10001 --gid app --home-dir /app --shell /usr/sbin/nologin app \
    && mkdir -p /app/uploads /app/static \
    && chown -R app:app /app

COPY --from=builder /app/target/release/rust-web-server /usr/local/bin/rust-web-server

USER 10001:10001
WORKDIR /app

ENV APP_HOST=0.0.0.0 \
    APP_PORT=8080 \
    APP_UPLOAD_DIR=/app/uploads \
    APP_STATIC_DIR=/app/static \
    APP_LOGGING__FORMAT=json \
    RUST_LOG=info

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD ["rust-web-server", "healthcheck"]

ENTRYPOINT ["rust-web-server"]
