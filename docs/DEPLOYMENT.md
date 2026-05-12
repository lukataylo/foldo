# Deployment

The Foldo prototype is built so every mock can be swapped without rewriting the contract. Here's the production checklist.

## 1. Persistence — Postgres

Today: `apps/server/src/db.ts` uses `better-sqlite3` at `apps/server/data/foldo.db`.

For production:

- Swap to `pg` or Prisma against Postgres.
- The eight tables in `db.ts` translate 1:1.
- Replace the `JSON.stringify` / `JSON.parse` columns (`content_json`, `target_json`, `events_json`, `replies_json`) with `JSONB` for indexable queries.
- The repo layer (`apps/server/src/repo/*.ts`) is the only thing that touches the driver — keep its interface the same.

## 2. Pub/sub — Redis

Today: `apps/server/src/ws/hub.ts` keeps `Map<boardId, Set<conn>>` in-memory.

For multi-instance:

- Replace `Hub` with a Redis-backed pub/sub: each Node instance subscribes to `board:{id}` channels.
- `broadcast()` publishes to Redis; the local subscriber forwards to its own sockets.
- Browser WS clients still talk to whichever Node instance their load balancer picks — Redis fans the message out.

## 3. Auth — OAuth + sessions

Today: `apps/server/src/auth.ts:resolveUserFromToken` accepts the user id as a bearer token, with `demo-user` / `demo-mcp` aliases.

For production:

- Add OAuth (GitHub Sign In is the natural fit — same provider as the repo integration).
- Store sessions in Redis (or signed cookies via `@fastify/secure-session`).
- Keep the contract `resolveUser(req) → User | null`; every route already uses `requireUser(req)`.
- For machine clients (MCP servers, CI), mint per-project tokens.

## 4. GitHub integration — real App

Today: `apps/server/src/routes/webhooks.ts` accepts any POST to `/api/webhooks/github` with no signature check.

For production:

1. Register a GitHub App with a webhook secret.
2. Verify `X-Hub-Signature-256` HMAC of the raw request body against your secret.
3. Subscribe to `push`, `pull_request`, `pull_request_review` events.
4. On `installation_repositories.added`: create a Board for the new repo.
5. On `push`: existing handler — create branches, commits, ghost markdown frames.
6. On `pull_request_review` comments: optionally mirror as Foldo comments.
7. Use the GitHub App's installation token to fetch source bodies for `/api/sources` instead of seeding them.

## 5. Frame freezing — Playwright pool

Today: `apps/mcp/src/runner/playwright.ts` tries a dynamic `import('playwright')`; if Playwright isn't installed, returns null and the MCP falls back to synthetic frames.

For production:

- Install Playwright in the MCP container.
- Maintain a small pool of headless browser contexts (one per concurrent freeze).
- Replay the recipe; screenshot at the captured viewport; serialise DOM via `page.evaluate(() => document.documentElement.outerHTML)`.
- Upload screenshot to object storage (S3 / R2); store the URL in `Frame.content.screenshotUrl` (new field).

## 6. Edit execution — real Claude Code

Today: `apps/mcp/src/runner/editSim.ts` is a heuristic.

For production:

- Write `src/runner/claudeCli.ts` that shells out to the `claude` CLI with a constructed prompt built from `ApplyEditArgs`.
- Pipe the agent's tool calls back as `dispatch.progress` events.
- After Claude exits successfully, run the recipe via Playwright (#5) to verify the edit landed at the same state.
- `git commit` + `git push` via `simple-git` (already a dep).
- Capture a fresh frame at the new commit and post `dispatch.completed` with it.

## 7. Sample app → real preview

Today: `apps/sample-app` is a hardcoded pricing demo served on port 5174.

For production: replace with the user's actual dev preview. Frame `iframeUrl` already supports any HTTP URL; the canvas iframes it directly.

Constraints:
- The preview must allow being iframed from your Foldo origin (CSP `frame-ancestors`).
- For element-level selection to work, the preview needs the `postMessage` bridge wired (see [`apps/sample-app/src/bridge/parentBridge.ts`](../apps/sample-app/src/bridge/parentBridge.ts)). Build it as a tiny library (`@foldo/preview-bridge`) and ship it as a dev dependency to anyone who wants Foldo on their app.

## 8. Chrome extension — Web Store

The MV3 manifest in `apps/extension/dist/manifest.json` is ready. To publish:

- Generate a private key with `chrome --pack-extension`.
- Submit to the Chrome Web Store for review.
- Or distribute as an unpacked extension for internal use.

For team installs: use enterprise policies to force-install.

## 9. Domains & TLS

The web app and cloud need separate origins (or paths on the same origin with reverse proxy):

```
canvas.foldo.example     → apps/web (static)
api.foldo.example        → apps/server (Fastify)
preview.foldo.example    → user's apps (iframed)
```

WebSockets just upgrade over the same HTTPS as the REST API. Fastify handles this natively.

## 10. Observability

Add structured logging (Fastify's `pino` is already in use). Recommended:

- Span per REST request (already logged by Fastify)
- Span per dispatch — start at `dispatches.create`, end at `dispatch.done` or `dispatch.failed`
- Cursor / viewport broadcasts: skip or sample (high volume)
- Database query timing via `better-sqlite3` profiling (or PG's `log_min_duration_statement`)

OpenTelemetry would slot into the Fastify hooks naturally.

## 11. Hard limits to enforce

- **Body limits**: set `bodyLimit` on Fastify for `/api/captures` (DOM snapshots can be large).
- **WS message size**: 32 KB by default; capture-driven `freeze.captured` frames might exceed.
- **Per-user rate limits** on cursor moves and viewport updates (already throttled on both sides, but a malicious client could bypass).
- **GitHub webhook deduplication**: use commit SHA as the idempotency key (current code re-inserts on every push).
