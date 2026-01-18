# ============================================================================
# KickRax API Server (Render)
# Lightweight API - no Puppeteer needed, calls Fly.io scraper
# ============================================================================

FROM node:20-slim

ENV NODE_ENV=production
ENV PORT=3001

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy source
COPY . .

# Build TypeScript
RUN npm run build

# Create non-root user
RUN groupadd -r api && useradd -r -g api api \
    && chown -R api:api /app

USER api

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3001/api/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1))"

CMD ["node", "dist/index.js"]
