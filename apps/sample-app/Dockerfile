# syntax=docker/dockerfile:1.6
# Multi-stage build for @foldo/sample-app. Build context = repo root.
# Build-time env (pass via --build-arg or Railway service var):
#   VITE_PARENT_ORIGIN — the canvas origin allowed to drive this app via
#                        postMessage (e.g. https://foldo.dev).

FROM node:20-slim AS builder

WORKDIR /app

ARG VITE_PARENT_ORIGIN
ENV VITE_PARENT_ORIGIN=$VITE_PARENT_ORIGIN

COPY package.json package-lock.json tsconfig.base.json ./
COPY apps/server/package.json ./apps/server/
COPY apps/web/package.json ./apps/web/
COPY apps/sample-app/package.json ./apps/sample-app/
COPY apps/mcp/package.json ./apps/mcp/
COPY apps/extension/package.json ./apps/extension/
COPY packages/protocol/package.json ./packages/protocol/

RUN npm ci --workspaces --include-workspace-root --ignore-scripts

COPY packages/protocol ./packages/protocol
COPY apps/sample-app ./apps/sample-app

RUN npm --workspace @foldo/sample-app run build

# --- Runtime: serve dist/ with `serve` (production-grade static) -----------
# Replaces `vite preview` (dev-grade) with the `serve` package
# (https://www.npmjs.com/package/serve) for production static serving:
# - gzip/brotli compression of text assets out of the box
# - HTTP/1.1 keep-alive, range requests
# - cache headers driven by apps/sample-app/serve.json (long-lived for
#   hashed assets, no-cache for index.html so deploys are picked up
#   immediately)
# - `--single` falls back to index.html for unknown routes (SPA history mode)
FROM node:20-slim AS runtime

ENV NODE_ENV=production
ENV PORT=5174

WORKDIR /app

# IMPORTANT: do NOT COPY the full workspace node_modules — see apps/web/Dockerfile
# for the full story. Install `serve` directly so the runtime image stays
# small enough to start on Railway's hobby tier without getting OOM-killed.
RUN npm install --global --no-audit --no-fund --omit=optional serve@14.2.4

COPY --from=builder /app/apps/sample-app/dist ./dist
COPY --from=builder /app/apps/sample-app/serve.json ./dist/serve.json

EXPOSE 5174

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://localhost:'+(process.env.PORT||5174)+'/').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"

CMD ["sh", "-c", "serve dist --listen tcp://0.0.0.0:${PORT:-5174} --single --no-clipboard --no-port-switching"]
