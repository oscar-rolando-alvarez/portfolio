# syntax=docker/dockerfile:1.7

# ---- Build stage -----------------------------------------------------------
FROM node:24.22.0-alpine3.24 AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --ignore-scripts

COPY . .
RUN npx nuxt prepare && npm run build

# ---- Runtime stage ---------------------------------------------------------
# Nitro bundles the server into .output, so the runtime image needs no node_modules.
FROM node:24.22.0-alpine3.24 AS runtime
WORKDIR /app

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000

COPY --from=build --chown=node:node /app/.output ./.output

USER node
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1

CMD ["node", ".output/server/index.mjs"]
