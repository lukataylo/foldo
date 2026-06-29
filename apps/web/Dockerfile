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
COPY packages/plugin-api/package.json ./packages/plugin-api/

# Web build doesn't need native modules — skip better-sqlite3 to keep the
# build fast and small. ignore-scripts prevents the postinstall.
RUN npm ci --workspaces --include-workspace-root --ignore-scripts

COPY packages/protocol ./packages/protocol
COPY packages/plugin-api ./packages/plugin-api
COPY apps/web ./apps/web

RUN npm --workspace @foldo/web run build

# --- Runtime: serve with vite preview --------------------------------------
FROM node:20-slim AS runtime

ENV NODE_ENV=production
ENV PORT=5173

WORKDIR /app

COPY --from=builder /app/package.json /app/package-lock.json ./
COPY --from=builder /app/apps/web/package.json ./apps/web/
COPY --from=builder /app/apps/web/vite.config.ts ./apps/web/
COPY --from=builder /app/apps/web/dist ./apps/web/dist
# npm workspaces hoist deps to root /app/node_modules. The per-workspace
# node_modules typically does not exist, so we only copy the root tree.
COPY --from=builder /app/node_modules ./node_modules

EXPOSE 5173

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://localhost:'+(process.env.PORT||5173)+'/').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"

WORKDIR /app/apps/web
CMD ["sh", "-c", "npx vite preview --port ${PORT:-5173} --host 0.0.0.0"]
