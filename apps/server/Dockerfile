# syntax=docker/dockerfile:1.6
# Single-stage tsx runtime for @foldo/server.
# Build context = repo root (Railway sets this when dockerfilePath points at
# the file).
#
# Since the living-docs pivot the server hosts the director (grounded
# Playwright capture + ffmpeg assembly), so the image carries chromium and
# ffmpeg. That makes it noticeably bigger than a plain API image — a known,
# accepted cost of running renders in-process. If render load outgrows the
# API, split the director into its own service with this same base.

FROM node:20-slim

# curl for the HEALTHCHECK; ca-certs for outbound TLS to Railway's Postgres;
# ffmpeg for the director's segment/master assembly (pinned encode params —
# libx264 must be present, which distro ffmpeg includes).
RUN apt-get update \
 && apt-get install -y --no-install-recommends curl ca-certificates ffmpeg \
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
COPY packages/protocol/package.json ./packages/protocol/

RUN npm ci --omit=dev \
      --workspace @foldo/server \
      --workspace @foldo/protocol \
      --include-workspace-root \
      --ignore-scripts \
 && rm -rf /root/.npm

# Chromium for the director's Playwright capture. --with-deps pulls the
# shared libraries headless chromium needs on slim images.
RUN npx playwright install --with-deps chromium \
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
