# syntax=docker/dockerfile:1.6
# Foldo screenshot service. Headless Chromium via playwright-core's prebuilt
# image so we don't have to babysit the install dance.
#
# IMPORTANT: this base-image tag must match the exact `playwright-core`
# version pinned in apps/shotter/package.json. The image pre-installs the
# browser revisions for ITS Playwright version only — a newer playwright-core
# from the lockfile looks for a Chromium revision that isn't there, and every
# POST /shot fails at runtime (the container still builds and passes /health).
# Bump both together.

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

# node is guaranteed in this image; wget/curl are not.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://localhost:'+(process.env.PORT||5180)+'/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"

WORKDIR /app/apps/shotter
CMD ["npm", "start"]
