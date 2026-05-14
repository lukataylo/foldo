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

# --- Runtime: serve with vite preview --------------------------------------
FROM node:20-slim AS runtime

ENV NODE_ENV=production
ENV PORT=5174

WORKDIR /app

COPY --from=builder /app/package.json /app/package-lock.json ./
COPY --from=builder /app/apps/sample-app/package.json ./apps/sample-app/
COPY --from=builder /app/apps/sample-app/vite.config.ts ./apps/sample-app/
COPY --from=builder /app/apps/sample-app/dist ./apps/sample-app/dist
# Hoisted to root /app/node_modules by npm workspaces.
COPY --from=builder /app/node_modules ./node_modules

EXPOSE 5174

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://localhost:'+(process.env.PORT||5174)+'/').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"

WORKDIR /app/apps/sample-app
CMD ["sh", "-c", "npx vite preview --port ${PORT:-5174} --host 0.0.0.0"]
