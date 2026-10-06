FROM node:22-slim
WORKDIR /app
COPY package*.json .npmrc ./
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev
ENV NODE_ENV=production
ENV UV_THREADPOOL_SIZE=8
CMD ["npm", "start"]
