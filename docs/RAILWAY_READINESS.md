# Railway Deployment Readiness

Status: **prototype-grade, not production-ready.** This doc captures
exactly what's missing and what was wired up in this pass so the next
agent can pick up where this left off.

The infra scaffolding (Dockerfiles, `railway.json`, env-driven URLs,
DB-path override, CORS allowlist) is now in place and `npm run dev`
still works. Everything below is what still needs to happen before this
can be put in front of real users.

---

## 1. SQLite on Railway is a footgun

`apps/server/src/db.ts` uses `better-sqlite3` against a single file on
disk. Before this pass that path was hard-coded to
`apps/server/data/foldo.db`; it now honours `DATABASE_PATH` so you can
point it at a mounted volume.

**The problem:** Railway service filesystems are *ephemeral on redeploy*.
A vanilla deploy of the server service will lose every board, frame,
comment, and dispatch the moment you push a new commit or the container
is rescheduled.

**Two real options:**

- **(a) Railway volume mount.** In the Railway UI, attach a volume to
  the `server` service at mount path `/data`, then set
  `DATABASE_PATH=/data/foldo.db`. WAL files (`-shm`, `-wal`) live next
  to the main file and are also persisted. This is the **cheapest path
  to "deploy works"** but does NOT support horizontal scaling — better-sqlite3
  holds an exclusive lock and there is exactly one writer.

- **(b) Migrate to Postgres.** Replace `better-sqlite3` with `pg` or
  Prisma. The eight tables in `db.ts` map 1:1. Every repo function in
  `apps/server/src/repo/*.ts` is the only place that talks to the
  driver — keep their function signatures and swap the implementations.
  Convert the `*_json` columns to `JSONB`. Required for multi-instance.
  Already noted in `docs/DEPLOYMENT.md` §1.

**Recommendation:** ship (a) for the alpha. Plan (b) the moment you
need two server replicas or worry about backups.

---

## 2. Demo auth — completely unsuitable for real users

`apps/server/src/auth.ts:21` accepts the user id **verbatim** as the
bearer token:

```ts
export function resolveUserFromToken(token) {
  const id = TOKEN_ALIASES[token] ?? token;
  return getUserById(id);
}
```

Anyone who knows or guesses a user id can act as that user. There is no
signup, no password, no email verification, no session expiry, no
revocation, no rate limit on auth attempts.

**Required before public exposure** (the parent agent is handling
this — DO NOT implement here):

- Email + password signup form on the web client.
- `argon2` (or `bcrypt`) password hashing on the server. New `users`
  columns: `email UNIQUE NOT NULL`, `password_hash`, `email_verified_at`.
- Session model: either JWT (HS256 with a secret) or signed cookies via
  `@fastify/secure-session`. Tokens MUST expire and be revokable.
- Email verification flow (signup → verification token → activate).
- Forgot-password flow.
- The `resolveUser(req) → User | null` contract is already in place —
  every route calls `requireUser(req)` (`apps/server/src/auth.ts:43`),
  so you can swap the implementation without touching routes.
- For MCP and CI clients, mint per-project API tokens with their own
  table + scope.

The `TOKEN_ALIASES` map (`demo-user`, `demo-mcp`) MUST be deleted
before production.

---

## 3. CORS

Pre-this-pass: `apps/server/src/index.ts:30-42` allowed only
`http://localhost:5173`, `http://localhost:5174`, and
`chrome-extension://*` / `moz-extension://*`.

After this pass: same defaults plus any origin listed in the
comma-separated `FOLDO_WEB_ORIGIN` env var. The CORS predicate is now
`apps/server/src/index.ts:34-49`.

**Still missing:**

- The current allowlist accepts ALL `chrome-extension://` and
  `moz-extension://` origins. That's fine for the dev extension but in
  prod you should pin to your published extension's id (e.g.
  `chrome-extension://<your-32-char-id>`).
- WebSocket origin checks are **not enforced at all** — see
  `apps/server/src/ws/browser.ts` and `apps/server/src/ws/mcp.ts`. The
  WS handshake reuses the HTTP CORS plugin in Fastify, but you should
  add an explicit `request.headers.origin` check inside the upgrade
  handler before the connection is accepted.

---

## 4. Hard-coded localhost references

These are the only remaining hard-codes after this pass:

| File:line | What | Fix |
|---|---|---|
| `apps/web/src/App.tsx:1105` | UI copy — "Couldn't reach the Foldo server on `localhost:4000`" displayed when the API is down | Cosmetic; surface `API_BASE` instead. |
| `apps/sample-app/src/bridge/messages.ts:62` | `PARENT_ORIGIN = 'http://localhost:5173'` — the sample app accepts postMessage **only** from this origin | Read from a `VITE_PARENT_ORIGIN` env var, default to localhost. Without this fix the sample app cannot be embedded by a non-localhost canvas. **This is a hard blocker** if the sample-app service is deployed. |
| `apps/sample-app/src/App.tsx:59` | Comment-only reference | No fix needed. |

Already addressed:

- `apps/web/src/api/client.ts:6-10` — now reads `VITE_API_URL`.
- `apps/web/src/api/ws.ts:33-42` — now reads `VITE_WS_URL`.
- `apps/web/src/components/AppFrame.tsx:36-40` — now reads
  `VITE_SAMPLE_URL`.
- `apps/server/src/db.ts:9-15` — now reads `DATABASE_PATH`.
- `apps/server/src/index.ts:30-49` — now reads `FOLDO_WEB_ORIGIN`.

---

## 5. WebSockets over `wss://`

Once the server is behind Railway's HTTPS termination, the existing
client code (`apps/web/src/api/ws.ts:35-39`) automatically upgrades to
`wss://` because it derives the WS scheme from the API base scheme.
Nothing additional needed on the client.

Server-side, Fastify + `@fastify/websocket` upgrades over the same
listener — Railway's edge proxy already handles TLS termination and
WebSocket upgrades transparently. No code change required.

**Caveat:** Railway has a default 5-minute idle timeout on long-lived
connections. The WS heartbeat in `apps/web/src/api/ws.ts:204-222`
(15-second ping, 8-second pong timeout) is well under that, so the
connection won't be killed by the proxy.

---

## 6. Secrets management

- `LOG_LEVEL`, `PORT`, `DATABASE_PATH`, `FOLDO_WEB_ORIGIN` go in
  Railway service variables — not secrets, but environment.
- Future auth secrets (JWT signing key, session secret, SMTP password,
  GitHub App private key, GitHub webhook secret) MUST be in Railway's
  encrypted variable store, NEVER committed.
- The repo has nothing committed today that's secret. `.env` is already
  in `.gitignore`. The new `.env.example` is safe to commit because it
  contains no real values.

---

## 7. Rate limiting

There is none. Pre-prod you want at minimum:

- `@fastify/rate-limit` globally — e.g. 60 req/min/IP on REST.
- A tighter rate on `/auth/*` endpoints once they exist (5/min for
  login attempts is standard).
- Per-board WS message rate cap — cursor moves are already throttled
  client-side but the server trusts the client today.
- `bodyLimit` on Fastify for `/api/captures` (DOM snapshots can be
  multi-MB and would currently OOM a small dyno).

Already documented in `docs/DEPLOYMENT.md` §11.

---

## 8. Error monitoring + observability

- No Sentry / Datadog / OpenTelemetry wiring. Fastify's pino logger
  goes to stdout; Railway's log view is your only window today. Add a
  Sentry SDK (`@sentry/node` + `@sentry/browser`) before any real
  traffic.
- Health endpoint exists at `/health` (`apps/server/src/index.ts:64`)
  and the server Dockerfile uses it for `HEALTHCHECK`. Railway's
  `healthcheckPath: /health` is wired in `apps/server/railway.json`
  (config-as-code is service-scoped; each service has its own file).
- The web and sample-app services have no health endpoint per se —
  their Dockerfile healthchecks do a `fetch('/')` against the running
  preview server, which is sufficient.

---

## 9. Multi-instance readiness

In-memory pub/sub in `apps/server/src/ws/hub.ts` means **you cannot
horizontally scale the server today.** Two replicas would silently fail
to broadcast events to clients on the other instance. Documented in
`docs/DEPLOYMENT.md` §2 (swap to Redis pub/sub).

For a single-replica alpha this is fine.

---

## 10. What this pass actually shipped

### Files created

- `railway.json` — three Railway services: `server`, `web`,
  `sample-app`. Each points at a per-app Dockerfile. Healthcheck on
  `/health` for the server. ON_FAILURE restart with 10 retries.
- `apps/server/Dockerfile` — multi-stage `node:20-slim` build. Stage 1
  installs build deps + compiles TS. Stage 2 strips build tools.
  HEALTHCHECK curls `/health`. CMD `node dist/index.js`.
- `apps/web/Dockerfile` — multi-stage. Build accepts `VITE_API_URL`,
  `VITE_WS_URL`, `VITE_SAMPLE_URL` as `ARG`s and inlines them.
  Runtime serves with `vite preview --port $PORT --host 0.0.0.0`.
- `apps/sample-app/Dockerfile` — same shape as web, no build args.
- `.dockerignore` — excludes `node_modules`, `.git`, `dist`,
  `apps/server/data` (the local SQLite files), env files, docs.
- `.env.example` — every env var introduced, with defaults documented.
- `apps/web/src/vite-env.d.ts` — TS types for the new
  `import.meta.env.VITE_*` reads.
- `docs/RAILWAY_READINESS.md` — this file.

### Files modified

- `apps/server/src/db.ts` — honour `DATABASE_PATH`, default to
  `apps/server/data/foldo.db`.
- `apps/server/src/index.ts` — CORS now also honours
  `FOLDO_WEB_ORIGIN` (comma-separated).
- `apps/web/src/api/client.ts` — `API_BASE` now reads
  `import.meta.env.VITE_API_URL` with localhost fallback.
- `apps/web/src/api/ws.ts` — `wsBaseFromApi` now honours
  `import.meta.env.VITE_WS_URL` override.
- `apps/web/src/components/AppFrame.tsx` — `SAMPLE_APP_BASE` honours
  `import.meta.env.VITE_SAMPLE_URL`.
- `apps/web/vite.config.ts` — added a `preview` block with `PORT` +
  `host: '0.0.0.0'` + `allowedHosts: true`.
- `apps/sample-app/vite.config.ts` — same `preview` block.

### NOT done — handed back to the parent agent

- **Real auth + signup.** Demo auth is intact. Email/password/argon2 +
  sessions are the next thing to land. See §2.
- **Postgres migration.** SQLite + volume mount is the documented
  alpha path. See §1.
- **Rate limiting, Sentry, real WS origin checks.** See §3, §7, §8.

---

## 11. Top three production blockers (TL;DR)

1. **Demo auth.** Bearer-token = user-id means anyone can impersonate
   anyone. No signup flow exists. Public exposure is unsafe.
   (`apps/server/src/auth.ts:16-25`)
2. **SQLite + ephemeral filesystem.** Without a Railway volume mounted
   at `DATABASE_PATH`'s parent, every redeploy wipes the database.
   Until volume is wired, treat each deploy as data-destroying.
   (`apps/server/src/db.ts`)
3. **Sample-app `PARENT_ORIGIN` hard-coded to
   `http://localhost:5173`.** If you deploy the sample-app service,
   the canvas WILL NOT be able to drive it via postMessage from any
   non-localhost canvas host.
   (`apps/sample-app/src/bridge/messages.ts:62`)
