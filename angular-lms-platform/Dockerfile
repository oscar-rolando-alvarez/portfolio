# syntax=docker/dockerfile:1

# ---- Build stage -------------------------------------------------------------
FROM node:24.22.0-alpine3.24 AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY . .
RUN npm run build

# ---- Runtime stage -----------------------------------------------------------
# Unprivileged nginx: runs as UID 101 and listens on 8080.
FROM nginxinc/nginx-unprivileged:1.30.6-alpine3.24 AS runtime

COPY --chown=nginx:nginx nginx.conf /etc/nginx/conf.d/default.conf
COPY --chown=nginx:nginx security-headers.conf /etc/nginx/security-headers.conf
COPY --from=build --chown=nginx:nginx /app/dist/angular-lms-platform/browser /usr/share/nginx/html

USER nginx
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8080/health || exit 1
