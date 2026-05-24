# syntax=docker/dockerfile:1.6
# Multi-stage build for @foldo/web. Build context = repo root.
# Build-time env (must be passed via --build-arg or Railway service vars):
#   VITE_API_URL    — e.g. https://api.foldo.example
#   VITE_WS_URL     — e.g. wss://api.foldo.example  (optional; defaults from API_URL)
#   VITE_SAMPLE_URL — e.g. https://sample.foldo.example

FROM node:20-slim AS builder

WORKDIR /app

ARG VITE_API_URL
ARG VITE_WS_URL
ARG VITE_SAMPLE_URL
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_WS_URL=$VITE_WS_URL
ENV VITE_SAMPLE_URL=$VITE_SAMPLE_URL

COPY package.json package-lock.json tsconfig.base.json ./
COPY apps/server/package.json ./apps/server/
COPY apps/web/package.json ./apps/web/
COPY apps/sample-app/package.json ./apps/sample-app/
COPY apps/mcp/package.json ./apps/mcp/
COPY apps/extension/package.json ./apps/extension/
COPY packages/protocol/package.json ./packages/protocol/

# Web build doesn't need native modules — skip better-sqlite3 to keep the
# build fast and small. ignore-scripts prevents the postinstall.
RUN npm ci --workspaces --include-workspace-root --ignore-scripts

COPY packages/protocol ./packages/protocol
COPY apps/web ./apps/web

RUN npm --workspace @foldo/web run build

# --- Runtime: serve dist/ with `serve` (production-grade static) -----------
# Replaces `vite preview` (dev-grade) with the `serve` package
# (https://www.npmjs.com/package/serve) for production static serving:
# - gzip/brotli compression of text assets out of the box
# - HTTP/1.1 keep-alive, range requests
# - cache headers driven by apps/web/serve.json (long-lived for hashed
#   assets, no-cache for index.html so deploys are picked up immediately)
# - `--single` falls back to index.html for unknown routes (SPA history mode)
FROM node:20-slim AS runtime

ENV NODE_ENV=production
ENV PORT=5173

WORKDIR /app

# IMPORTANT: do NOT COPY the full /app/node_modules (~260 MB on a workspace
# repo) into the runtime image. That was the silent killer on Railway's
# hobby tier — new images would build successfully but get OOM-killed on
# container start, and Railway would silently fall back to the last
# healthy revision, making it look like deploys had "succeeded" while the
# old vite-preview-based image kept serving traffic. We only need `serve`
# at runtime (8 MB on disk vs the full workspace deps), so install it
# directly with a clean root-level install + ignore-scripts.
RUN npm install --global --no-audit --no-fund --omit=optional serve@14.2.4

COPY --from=builder /app/apps/web/dist ./dist
COPY --from=builder /app/apps/web/serve.json ./dist/serve.json

EXPOSE 5173

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://localhost:'+(process.env.PORT||5173)+'/').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"

# `--single` enables SPA index.html fallback. `--no-clipboard` silences
# `serve`'s "copied to clipboard" log noise in container stdout. `--no-port-switching`
# makes a port collision a hard failure (we'd rather Railway restart and
# re-roll than silently bind a different port).
CMD ["sh", "-c", "serve dist --listen tcp://0.0.0.0:${PORT:-5173} --single --no-clipboard --no-port-switching"]
