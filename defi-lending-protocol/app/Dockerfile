# syntax=docker/dockerfile:1

ARG NODE_IMAGE=node:24.22.0-alpine

# ---- deps: install exact dependency tree from the lockfile ----
FROM ${NODE_IMAGE} AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

# ---- build: compile the standalone Next.js server ----
FROM ${NODE_IMAGE} AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
# NEXT_PUBLIC_* values are inlined into the client bundle at build time.
ARG NEXT_PUBLIC_RPC_URL=https://api.devnet.solana.com
ARG NEXT_PUBLIC_CLUSTER=devnet
ARG NEXT_PUBLIC_LENDING_PROGRAM_ID=4sohRUrhAnm75sFwUbeE6tJHRQCNq5MMf4PEYEUi1WdD
ARG NEXT_PUBLIC_GOVERNANCE_PROGRAM_ID=JCFC4bviKZmiVdsDkvzXjRCzE9Yc7P1VumkgkiBvQ43c
ENV NEXT_PUBLIC_RPC_URL=${NEXT_PUBLIC_RPC_URL} \
    NEXT_PUBLIC_CLUSTER=${NEXT_PUBLIC_CLUSTER} \
    NEXT_PUBLIC_LENDING_PROGRAM_ID=${NEXT_PUBLIC_LENDING_PROGRAM_ID} \
    NEXT_PUBLIC_GOVERNANCE_PROGRAM_ID=${NEXT_PUBLIC_GOVERNANCE_PROGRAM_ID}
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# ---- runtime: minimal image running as the unprivileged `node` user ----
FROM ${NODE_IMAGE} AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.js"]
