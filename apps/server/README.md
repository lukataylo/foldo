# @foldo/server

The Foldo cloud service. Fastify + better-sqlite3 + WebSockets.

- REST at `http://localhost:4000/api/*`
- Browser WebSocket: `ws://localhost:4000/ws?boardId=...&userId=...&token=...`
- MCP WebSocket: `ws://localhost:4000/ws/mcp?token=...&boardId=...&agentName=...`

## Run

From the **repo root** (npm workspaces):

```bash
npm install
npm run dev:server
```

Or all services together:

```bash
npm run dev
```

The SQLite database lives at `apps/server/data/foldo.db`. Delete it to reset state — the server seeds on first run.

## Auth

Pass `Authorization: Bearer <userId>` on REST calls. The token `demo-user` resolves to `u-you`. Any other token must match a real user id in the `users` table.

## Verify

```bash
curl http://localhost:4000/api/boards
curl -H "Authorization: Bearer demo-user" \
  http://localhost:4000/api/boards/board-acme-landing
```

## Scaling notes

The in-memory hub (`src/ws/hub.ts`) keeps board → connected clients in process memory. To run multiple server instances, swap it for a Redis pub/sub backend exposing the same `subscribe`/`unsubscribe`/`broadcast` API.
