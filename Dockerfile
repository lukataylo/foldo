FROM node:22-slim
WORKDIR /app
COPY package*.json .npmrc ./
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev
ENV NODE_ENV=production
ENV UV_THREADPOOL_SIZE=8
# exec node directly: npm turns the SIGTERM Railway sends on redeploy into an error exit (deployment "failed")
CMD ["node", "--env-file-if-exists=.env", "server.mjs"]
