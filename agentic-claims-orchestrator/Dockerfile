# syntax=docker/dockerfile:1.7
# Multi-stage, non-root image. Node 24 LTS runs the TypeScript sources directly via native
# type stripping (erasable syntax only), so there is no transpile step and no source maps to ship.
ARG NODE_IMAGE=node:24.22.0-alpine3.24@sha256:44fce696f38ba8c987c4db89954051000bbd05ffd8d8659ba15ed4a8602e937f

FROM ${NODE_IMAGE} AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/core/package.json packages/core/
COPY packages/mcp-tools/package.json packages/mcp-tools/
COPY packages/infra/package.json packages/infra/
COPY apps/server/package.json apps/server/
RUN --mount=type=cache,target=/root/.npm \
    npm ci --omit=dev --ignore-scripts --no-audit --no-fund

FROM ${NODE_IMAGE} AS runtime
ENV NODE_ENV=production \
    NODE_OPTIONS="--disable-warning=ExperimentalWarning" \
    PORT=8080
WORKDIR /app
COPY --from=deps --chown=root:root /app/node_modules ./node_modules
COPY --chown=root:root package.json ./
COPY --chown=root:root packages/core/package.json packages/core/package.json
COPY --chown=root:root packages/core/src packages/core/src
COPY --chown=root:root packages/mcp-tools/package.json packages/mcp-tools/package.json
COPY --chown=root:root packages/mcp-tools/src packages/mcp-tools/src
COPY --chown=root:root packages/infra/package.json packages/infra/package.json
COPY --chown=root:root packages/infra/src packages/infra/src
COPY --chown=root:root packages/infra/drizzle packages/infra/drizzle
COPY --chown=root:root apps/server/package.json apps/server/package.json
COPY --chown=root:root apps/server/src apps/server/src
COPY --chown=root:root config config
COPY --chown=root:root evals/golden-claims.json evals/golden-claims.json
# Code is owned by root and read-only for the runtime user.
USER node
EXPOSE 8080
HEALTHCHECK --interval=15s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "apps/server/src/main.ts"]
