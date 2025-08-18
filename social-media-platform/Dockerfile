# Multi-stage build for production optimization
FROM node:18-alpine AS base

# Install dependencies only when needed
FROM base AS deps
# Check https://github.com/nodejs/docker-node/tree/b4117f9333da4138b03a546ec926ef50a31506c3#nodealpine to understand why libc6-compat might be needed.
RUN apk add --no-cache libc6-compat
WORKDIR /app

# Install dependencies based on the preferred package manager
COPY package.json package-lock.json* ./
RUN npm ci --only=production

# Rebuild the source code only when needed
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Generate Prisma client
RUN npx prisma generate

# Build application
RUN npm run build

# Production image, copy all the files and run nuxt
FROM base AS runner
WORKDIR /app

ENV NODE_ENV production
ENV NUXT_HOST=0.0.0.0
ENV NUXT_PORT=3000

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nuxtjs

# Copy the built application
COPY --from=builder --chown=nuxtjs:nodejs /app/.output ./.output
COPY --from=builder --chown=nuxtjs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nuxtjs:nodejs /app/package.json ./package.json
COPY --from=builder --chown=nuxtjs:nodejs /app/prisma ./prisma

USER nuxtjs

EXPOSE 3000

ENV PORT 3000

CMD ["node", ".output/server/index.mjs"]