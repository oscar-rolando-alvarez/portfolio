# syntax=docker/dockerfile:1.7

# ---- Dependencies + build --------------------------------------------------
FROM node:26.11.1-alpine3.24 AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --ignore-scripts

COPY . .
RUN npx prisma generate && npx nuxt prepare && npm run build

# ---- One-shot migration job (docker compose "migrate" service) -------------
FROM build AS migrate
ENV NODE_ENV=production
USER node
CMD ["node_modules/.bin/prisma", "migrate", "deploy"]

# ---- Runtime ---------------------------------------------------------------
# Nitro traces and bundles server dependencies (Prisma client, pg) into .output.
FROM node:26.11.1-alpine3.24 AS runtime
WORKDIR /app

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000

COPY --from=build --chown=node:node /app/.output ./.output

USER node
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=15s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1

CMD ["node", ".output/server/index.mjs"]
