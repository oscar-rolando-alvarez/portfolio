# Multi-stage Docker build for Angular LMS Platform
# Stage 1: Build the Angular application
FROM node:18-alpine AS builder

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy source code
COPY . .

# Build the application for production
RUN npm run build:prod

# Stage 2: Serve the application with Nginx
FROM nginx:alpine AS production

# Install necessary packages for security and performance
RUN apk add --no-cache \
    ca-certificates \
    tzdata \
    && rm -rf /var/cache/apk/*

# Create nginx user and set permissions
RUN addgroup -g 1001 -S nginx && \
    adduser -S -D -H -u 1001 -h /var/cache/nginx -s /sbin/nologin -G nginx -g nginx nginx

# Copy custom nginx configuration
COPY nginx.conf /etc/nginx/nginx.conf
COPY default.conf /etc/nginx/conf.d/default.conf

# Copy SSL certificates (if using HTTPS)
# COPY ssl/ /etc/nginx/ssl/

# Copy built application from builder stage
COPY --from=builder /app/dist/angular-lms-platform /usr/share/nginx/html

# Copy service worker and manifest files
COPY --from=builder /app/dist/angular-lms-platform/ngsw.json /usr/share/nginx/html/
COPY --from=builder /app/dist/angular-lms-platform/ngsw-worker.js /usr/share/nginx/html/

# Set proper permissions
RUN chown -R nginx:nginx /usr/share/nginx/html && \
    chown -R nginx:nginx /var/cache/nginx && \
    chown -R nginx:nginx /var/log/nginx && \
    chown -R nginx:nginx /etc/nginx/conf.d

# Create directories for nginx
RUN touch /var/run/nginx.pid && \
    chown -R nginx:nginx /var/run/nginx.pid

# Switch to non-root user
USER nginx

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost/ || exit 1

# Expose port 80
EXPOSE 80

# Start nginx
CMD ["nginx", "-g", "daemon off;"]

# Metadata
LABEL maintainer="LMS Development Team"
LABEL version="1.0.0"
LABEL description="EduPlatform - Advanced Learning Management System"
LABEL org.opencontainers.image.source="https://github.com/your-org/angular-lms-platform"
LABEL org.opencontainers.image.documentation="https://docs.eduplatform.com"
LABEL org.opencontainers.image.licenses="MIT"