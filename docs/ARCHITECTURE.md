# Architecture

This document walks the Foldo codebase as it exists today: components, data flow, ports, persistence, real-time, and where each subsystem ends.

> See also: [PROTOCOL.md](PROTOCOL.md) for wire-level types, [MCP.md](MCP.md) for the agent bridge, [DEPLOYMENT.md](DEPLOYMENT.md) for production hardening.

## 1. Three-component shape

Foldo is **one cloud, many clients**. The cloud is the source of truth for boards, frames, comments, dispatches, and presence. Two kinds of long-lived clients connect to it:

- **Browser canvases** (`apps/web`) — what users see and interact with. Each open tab is one connection.
- **In-directory MCP servers** (`apps/mcp`) — what Claude Code runs locally. Holds filesystem + git access, executes edits, captures frames.

Plus a **Chrome extension** (`apps/extension`) that does one-shot captures via REST (no long connection).

Plus the **sample app** (`apps/sample-app`) — a separately-served Vite app that the canvas iframes to represent "the user's actual running app." In a real deployment this is replaced by the user's real dev preview URL.

```
                                  +-------------------+
                                  |  Cloud (server)   |
                                  |  - REST  :4000    |
                                  |  - WS /ws         |
                                  |  - WS /ws/mcp     |
                                  |  - SQLite         |
                                  +---------+---------+
                                            |
        +-----------------+-------------+---+---+--------------+--------------+
        |                 |             |       |              |              |
        v                 v             v       v              v              v
+----------------+ +----------------+ +------+ +------+ +-------------+ +------------+
|   Browser A    | |   Browser B    | | MCP  | | MCP  | | Chrome ext  | | GitHub App |
| (apps/web)     | | (apps/web)     | | A    | | B    | | (extension) | | (webhooks) |
+----------------+ +----------------+ +------+ +------+ +-------------+ +------------+
        |                 |             | stdio |              POST /api/captures
        | iframe          | iframe      v       v              POST /api/webhooks/github
        v                 v          Claude Claude
+----------------+ +----------------+ Code   Code
|  Sample app    | |  Sample app    |
| (apps/sample)  | | (apps/sample)  |
+----------------+ +----------------+
```

## 2. Ports

| Port | Service | Role |
| --- | --- | --- |
| `4000` | `apps/server` | REST + two WS endpoints |
| `5173` | `apps/web` | Vite dev server for the canvas |
| `5174` | `apps/sample-app` | Vite dev server for the iframed app |

The MCP server doesn't bind a port — it speaks JSON-RPC over stdio (to Claude Code) and connects out to the cloud's `/ws/mcp` as a WebSocket client.

## 3. Boot sequence (web canvas)

1. `apps/web/src/App.tsx` reads or seeds a demo `userId` from `localStorage` (defaults to `u-you`).
2. `GET /api/boards` — find an active board (or use the one in the URL).
3. `GET /api/boards/:id` — hydrate the local store with `board`, `branches`, `frames`, `comments`, `users`, `mcpConnected`.
4. Open a single WebSocket to `/ws?boardId=&userId=&token=` and send `{ type: 'hello' }`. Server replies with `welcome` + initial presence.
5. For each `frame.added` / `frame.updated` / `frame.moved` / `frame.deleted` / `comment.*` / `dispatch.*` / `presence.*` over WS, the reducer (`apps/web/src/state/reducers.ts`) applies a small patch to the Map-based store.
6. Only frames near the current viewport mount their iframes (`inViewportSet` in `App.tsx`); off-screen frames render skeleton placeholders.

## 4. Boot sequence (cloud)

1. `apps/server/src/index.ts` initialises Fastify.
2. `src/db.ts` opens `data/foldo.db` (better-sqlite3, WAL mode) and runs `CREATE TABLE IF NOT EXISTS` for all eight tables.
3. `src/seed.ts` is idempotent — if `board-acme-landing` already exists, it bails. Otherwise inserts 5 users, 3 branches, 3 commits, 7 frames, 4 comments, 3 source files.
4. Routes registered under `/api/*`.
5. WebSocket plugin attached; `/ws` (browser) and `/ws/mcp` (agent) handlers wired.
6. CORS configured for `localhost:5173`, `localhost:5174`, and any `chrome-extension://` origin.

## 5. Boot sequence (MCP)

1. `apps/mcp/src/index.ts` picks a mode: `stdio` (Claude Code spawned us), `bridge` (cloud-only headless), or `both` (dev shell).
2. **stdio mode**: register the four tool handlers with `@modelcontextprotocol/sdk` and connect to Claude Code over the standard MCP transport.
3. **bridge mode**: open a WS to `ws://localhost:4000/ws/mcp?token=&boardId=`; send `mcp.hello`; listen for `dispatch.execute` / `freeze.request`.
4. On `dispatch.execute`: run `runApplyEdit` (which calls `simulateEdit` in the prototype; real impl shells out to `claude`), stream `dispatch.progress` events back, finish with `dispatch.completed`. The cloud re-positions the result frame next to the parent before broadcasting `frame.added`.

## 6. Data model

All types are declared in [`packages/protocol/src/domain.ts`](../packages/protocol/src/domain.ts):

- **Board** — one connected GitHub repo
- **Branch** — `id`, `boardId`, `name`, `authoredBy` (`human` / `agent`), `color`, `headSha`
- **Commit** — `sha`, `branchId`, `message`, `parentSha`
- **Frame** — `id`, `kind` (`app` / `markdown`), `branchId`, `commitSha`, `position`, `size`, `content`, `parentFrameId?`, `generatedByDispatchId?`, `capturedFromUrl?`
- **Comment** — `pin` (fractional coords) or `anchor` (markdown section/line), `target` (file/line/element), `replies[]`
- **Dispatch** — `frameId`, `branchId`, `target`, `intent`, `status`, `events[]`, `resultFrameId?`, `resultCommitSha?`
- **PresenceUser** — `online`, `cursor`, `selection`, `viewport`, `followingUserId`

## 7. Persistence

SQLite via [better-sqlite3](https://github.com/WiseLibs/better-sqlite3) — synchronous, fast, zero external service.

Eight tables, mapped through small repo files in `apps/server/src/repo/*.ts`. Composite content (e.g. `Frame.content`, `Comment.target`, `Dispatch.events`) is stored as JSON in a `content_json` / `target_json` / `events_json` column.

To move to Postgres for multi-instance: swap the driver in `apps/server/src/db.ts`. The repo layer is otherwise driver-agnostic.

## 8. Real-time

A single in-memory `Hub` (`apps/server/src/ws/hub.ts`) keeps a `Map<boardId, Set<conn>>`:

```ts
hub.subscribe(conn)
hub.unsubscribe(conn)
hub.broadcast(boardId, message, exceptUserId?)
hub.connectionsOnBoard(boardId)
hub.findConn(boardId, userId)
```

Every server-side state mutation (REST routes, GitHub webhook, MCP `dispatch.completed`) calls `hub.broadcast()` so all connected browsers see the change instantly.

To scale beyond one Node instance: re-implement `Hub` over Redis pub/sub. The interface stays the same.

## 9. Iframe protocol

App frames render `<iframe src="http://localhost:5174/?variant=…&commit=…&foldo.embedded=1&…">`. The sample app and the canvas exchange messages via `window.postMessage`:

- `foldo.sample.ready` — first paint
- `foldo.sample.element.click` — review-mode click on an instrumented element
- `foldo.sample.element.hover` / `…hover.clear`
- `foldo.sample.recipe.completed` / `…recipe.failed`
- `foldo.sample.setReviewMode` (canvas → iframe)
- `foldo.sample.setOverrides` (canvas → iframe)
- `foldo.sample.replayRecipe` (canvas → iframe)

The full types are mirrored in both `apps/web/src/iframe/messages.ts` and `apps/sample-app/src/bridge/messages.ts`.

## 10. URL routing

A tiny `apps/web/src/routing/Router.tsx` uses only the History API:

- `/`
- `/board/:boardId`
- `/board/:boardId/frame/:frameId`
- `/board/:boardId/frame/:frameId/comment/:commentId`

Every focus, comment open, and dispatch result updates the URL so canvas state is shareable.

## 11. Auth

Demo bearer tokens:

- The token *is* the user id (`u-anna`, `u-mateo`, `u-priya`, `u-you`).
- `demo-user` → `u-you`, `demo-mcp` → `u-claude`.
- `apps/server/src/auth.ts:resolveUserFromToken` is the single chokepoint.

For real auth: replace `resolveUserFromToken` with a session-or-OAuth lookup; the contract `(req) → User | null` stays the same.

## 12. Where the prototype ends

These are explicit stubs ready to be replaced:

| Layer | Stub | Replace with |
| --- | --- | --- |
| Edit execution | `apps/mcp/src/runner/editSim.ts` (heuristic) | shell-out to `claude` CLI |
| Frame capture | `apps/mcp/src/runner/playwright.ts` (dynamic-import, no-op if absent) | real Playwright worker pool |
| Persistence | `apps/server/src/db.ts` (SQLite) | Postgres |
| Pub/sub | `apps/server/src/ws/hub.ts` (in-memory) | Redis pub/sub |
| Auth | `apps/server/src/auth.ts` (bearer = user id) | OAuth (GitHub) or your IdP |
| GitHub | `apps/server/src/routes/webhooks.ts` (no sig verification) | GitHub App + HMAC verification |
| Sample app | `apps/sample-app` (hardcoded pricing variants) | the user's real dev preview at any URL |
