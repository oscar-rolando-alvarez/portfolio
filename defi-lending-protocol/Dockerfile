# Multi-stage build for Solana program
FROM rust:1.75 as rust-builder

# Install Solana CLI and Anchor
RUN sh -c "$(curl -sSfL https://release.solana.com/v1.17.0/install)"
ENV PATH="/root/.local/share/solana/install/active_release/bin:$PATH"

# Install Anchor
RUN cargo install --git https://github.com/coral-xyz/anchor avm --locked --force
RUN avm install latest
RUN avm use latest

WORKDIR /app

# Copy Rust program files
COPY programs ./programs
COPY Anchor.toml .
COPY Cargo.toml .

# Build the Solana program
RUN anchor build

# Node.js stage for frontend
FROM node:18-alpine as node-builder

WORKDIR /app/frontend

# Copy package files
COPY app/package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy frontend source
COPY app .

# Build frontend
RUN npm run build

# Final stage - Runtime
FROM node:18-alpine

WORKDIR /app

# Install Solana CLI for runtime operations
RUN apk add --no-cache curl bash
RUN sh -c "$(curl -sSfL https://release.solana.com/v1.17.0/install)"
ENV PATH="/root/.local/share/solana/install/active_release/bin:$PATH"

# Copy built programs
COPY --from=rust-builder /app/target ./target
COPY --from=rust-builder /app/Anchor.toml ./
COPY Anchor.toml .

# Copy built frontend
COPY --from=node-builder /app/frontend/.next ./app/.next
COPY --from=node-builder /app/frontend/package*.json ./app/
COPY --from=node-builder /app/frontend/node_modules ./app/node_modules
COPY --from=node-builder /app/frontend/public ./app/public

# Copy deployment scripts
COPY scripts ./scripts
RUN chmod +x scripts/*.sh

# Expose frontend port
EXPOSE 3000

# Set environment
ENV NODE_ENV=production

# Start script
CMD ["./scripts/start.sh"]