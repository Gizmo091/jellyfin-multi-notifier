# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY packages/server/package*.json ./packages/server/
COPY packages/admin/package*.json ./packages/admin/

# Install dependencies
RUN npm ci

# Copy source code
COPY packages/server ./packages/server
COPY packages/admin ./packages/admin

# Build both packages
RUN npm run build

# Production stage
FROM node:20-alpine AS runner

WORKDIR /app

# Create non-root user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 appuser

# Copy package files for production install
COPY package*.json ./
COPY packages/server/package*.json ./packages/server/

# Install production dependencies only
RUN npm ci --omit=dev --workspace=packages/server

# Copy built files
COPY --from=builder /app/packages/server/dist ./packages/server/dist
COPY --from=builder /app/packages/admin/dist ./packages/admin/dist

# Create data directory
RUN mkdir -p /app/data && chown -R appuser:nodejs /app/data

# Switch to non-root user
USER appuser

# Environment
ENV NODE_ENV=production
ENV PORT=3000

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1

# Start server
CMD ["node", "packages/server/dist/index.js"]
