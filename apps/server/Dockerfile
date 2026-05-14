# syntax=docker/dockerfile:1.6
# Single-stage tsx runtime for @foldo/server.
# Build context = repo root (Railway sets this when dockerfilePath points at
# the file).

FROM node:20-slim

# curl for the HEALTHCHECK; ca-certs for outbound TLS to Railway's Postgres
RUN apt-get update \
 && apt-get install -y --no-install-recommends curl ca-certificates \
 && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
ENV PORT=4000

WORKDIR /app

# Manifests first for a cacheable npm install layer.
COPY package.json package-lock.json tsconfig.base.json ./
COPY apps/server/package.json ./apps/server/
COPY apps/web/package.json ./apps/web/
COPY apps/sample-app/package.json ./apps/sample-app/
COPY apps/mcp/package.json ./apps/mcp/
COPY apps/extension/package.json ./apps/extension/
COPY packages/protocol/package.json ./packages/protocol/

RUN npm ci --omit=dev \
      --workspace @foldo/server \
      --workspace @foldo/protocol \
      --include-workspace-root \
      --ignore-scripts \
 && rm -rf /root/.npm

# Source files (the server runs straight from TS via tsx).
COPY packages/protocol/src ./packages/protocol/src
COPY apps/server/src ./apps/server/src
COPY apps/server/tsconfig.json ./apps/server/

EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD curl -fsS "http://localhost:${PORT}/health" || exit 1

WORKDIR /app/apps/server
CMD ["npm", "start"]
