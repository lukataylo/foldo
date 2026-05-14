# syntax=docker/dockerfile:1.6
# Foldo screenshot service. Headless Chromium via playwright-core's prebuilt
# image so we don't have to babysit the install dance.

FROM mcr.microsoft.com/playwright:v1.58.0-jammy

ENV NODE_ENV=production
ENV PORT=5180

WORKDIR /app

# Manifests first for a cacheable npm install layer.
COPY package.json package-lock.json tsconfig.base.json ./
COPY apps/shotter/package.json ./apps/shotter/

RUN npm ci --omit=dev --workspace @foldo/shotter --include-workspace-root --ignore-scripts \
 && rm -rf /root/.npm

COPY apps/shotter/src ./apps/shotter/src
COPY apps/shotter/tsconfig.json ./apps/shotter/

EXPOSE 5180

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -q -O - "http://localhost:${PORT}/health" >/dev/null || exit 1

WORKDIR /app/apps/shotter
CMD ["npm", "start"]
