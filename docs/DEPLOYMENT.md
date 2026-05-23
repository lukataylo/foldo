# Deployment runbook

A second engineer should be able to read this top-to-bottom and have
Foldo running on a fresh Railway account in under 30 minutes. No
hand-waving, no "and then configure logging" lines without a command.

Where something isn't actually wired yet, the runbook says **TODO** and
explains the gap so you don't go hunting for a setting that doesn't
exist.

The CLI examples assume Railway CLI v4.57+. Install with
`brew install railway` and `railway login`.

---

## 1. Architecture

Today's production deploy is one Railway project (`foldo`) with three
HTTP services (`server`, `web`, `sample-app`), a Postgres plugin, and a
fourth service (`shotter`) defined in `railway.json` but **not deployed
right now** — see §3.5.

```
                            ┌──────────────────────────────────┐
                            │  browser  (https://foldo.dev)    │
                            │  - canvas SPA + marketing site   │
                            └─────────┬─────────────┬──────────┘
                                      │  REST       │  WS upgrade
                                      ▼             ▼
       ┌──────────────────────────────────────────────────────┐
       │ web                          server                  │
       │ (Vite preview, port $PORT)   (Fastify+tsx, port $PORT)│
       │ https://foldo.dev            https://api.foldo.dev   │
       │                              ├─ /health              │
       │                              ├─ /metrics (Prom)      │
       │                              ├─ /api/*               │
       │                              └─ /ws, /ws/mcp         │
       └──────────────────────────────────┬───────────────────┘
                                          │ pg, SSL
                                          ▼
                              ┌───────────────────────────────┐
                              │ Postgres (Railway plugin)     │
                              │ ghcr.io/railwayapp-templates/ │
                              │   postgres-ssl:18             │
                              │ vol: postgres-volume (5 GB)   │
                              └───────────────────────────────┘

       ┌──────────────────────────────────────────────────────┐
       │ sample-app                                           │
       │ (Vite preview, port $PORT)                           │
       │ https://sample.foldo.dev — iframed by canvas         │
       └──────────────────────────────────────────────────────┘

       ┌──────────────────────────────────────────────────────┐
       │ shotter   (defined in railway.json, NOT deployed)    │
       │ Playwright/Chromium screenshot service               │
       │ Optional fallback for /c/<url> when iframing is      │
       │ blocked by X-Frame-Options. See §3.5.                │
       └──────────────────────────────────────────────────────┘
```

Notes:

- The `server` service runs **straight from TypeScript via `tsx`**.
  There is no `dist/` build step in production. CMD is `npm start` →
  `tsx src/index.ts`.
- The `server` service has a `server-volume` mounted at `/data`
  (Railway-managed, 5 GB). That's where test-session recordings live
  when `FOLDO_S3_BUCKET` is unset. Today it's set to that path via
  `FOLDO_STORAGE_DIR`.
- WebSockets ride the same HTTPS as REST — Fastify handles the
  upgrade. No separate WS service.
- Hub is in-memory (single instance). Redis-backed multi-instance is
  implemented in code (`apps/server/src/ws/hub-redis.ts`) but **not
  wired by default** — see Phase 3 plan.

---

## 2. Env-var matrix

`BT` = build-time (inlined into the bundle by Vite, must be set
before `npm run build`).<br>
`RT` = runtime (read by `process.env` at boot).

### 2.1 `server` (Fastify, port `$PORT`)

| Var                          | When | Req | Prod value pattern                                   | Notes |
|------------------------------|------|-----|------------------------------------------------------|-------|
| `PORT`                       | RT   | yes | injected by Railway                                  | Don't set manually. |
| `DATABASE_URL`               | RT   | yes | `${{Postgres.DATABASE_URL}}` (Railway reference)     | Auto-SSL when host matches `railway.app` (see `apps/server/src/db.ts:30`). |
| `DATABASE_POOL_MAX`          | RT   | no  | `10`                                                 | Tune up for sustained load. |
| `LOG_LEVEL`                  | RT   | no  | `info` (default)                                     | `debug` for incident, `warn` for noisy environments. |
| `NODE_ENV`                   | RT   | yes | `production`                                         | Gates demo-token auth — see `apps/server/src/auth.ts:26`. |
| `FOLDO_WEB_ORIGIN`           | RT   | yes | `https://foldo.dev,https://sample.foldo.dev`         | Comma-separated CORS allow-list, on top of localhost defaults. |
| `FOLDO_PUBLIC_WEB_ORIGIN`    | RT   | yes | `https://foldo.dev`                                  | Origin used when minting share-link URLs. |
| `FOLDO_SAMPLE_APP_URL`       | RT   | yes | `https://sample.foldo.dev`                           | Used by the dispatch simulator + seed. |
| `FOLDO_STORAGE_DIR`          | RT   | no  | `/data/foldo-storage`                                | Local fallback for test-session recordings. Set to the mount path of `server-volume`. |
| `FOLDO_S3_BUCKET`            | RT   | no  | unset today                                          | When set, switches recording storage to S3/R2. **TODO**: not yet exercised in prod. |
| `FOLDO_S3_REGION`            | RT   | no  | —                                                    | S3 region (e.g. `auto` for R2). |
| `FOLDO_S3_ENDPOINT`          | RT   | no  | —                                                    | R2/B2: `https://<acct>.r2.cloudflarestorage.com`. |
| `FOLDO_S3_ACCESS_KEY`        | RT   | no  | —                                                    | Pair with `FOLDO_S3_SECRET`. |
| `FOLDO_S3_SECRET`            | RT   | no  | —                                                    | |
| `FOLDO_EMAIL_PROVIDER`       | RT   | no  | `resend`                                             | Unset = local-outbox stub (fine for dev/CI, not prod). |
| `FOLDO_EMAIL_FROM`           | RT   | yes\* | `Foldo <hello@foldo.dev>`                          | \*Required when provider is `resend`. |
| `RESEND_API_KEY`             | RT   | yes\* | `re_…`                                             | \*Required when provider is `resend`. |
| `FOLDO_TRANSCRIPTION_PROVIDER` | RT | no  | unset (stub)                                         | `deepgram` once Step 6 lands. |
| `DEEPGRAM_API_KEY`           | RT   | no  | —                                                    | Pair with `FOLDO_TRANSCRIPTION_PROVIDER=deepgram`. |
| `ANTHROPIC_API_KEY`          | RT   | no  | `sk-ant-…`                                           | Unset = heuristic synthesis stub. |
| `FOLDO_SYNTHESIS_MODEL`      | RT   | no  | `claude-opus-4-7`                                    | |
| `FOLDO_SHOT_SECRET`          | RT   | no  | shared with `shotter`                                | Only used when shotter is deployed. |

### 2.2 `web` (Vite SPA, port `$PORT`)

| Var                  | When | Req | Prod value pattern               | Notes |
|----------------------|------|-----|----------------------------------|-------|
| `PORT`               | RT   | yes | injected by Railway              | `vite preview` honours it (see `railway.json:32`). |
| `VITE_API_URL`       | BT   | yes | `https://api.foldo.dev`          | Inlined; baked into the bundle. |
| `VITE_WS_URL`        | BT   | no  | `wss://api.foldo.dev`            | Defaults from `VITE_API_URL` if unset. |
| `VITE_SAMPLE_URL`    | BT   | yes | `https://sample.foldo.dev`       | Iframed previews. |
| `VITE_SHOTTER_URL`   | BT   | no  | `https://shotter.foldo.dev`      | Unset today; set when you turn on the shotter service. |

The `apps/web/Dockerfile` reads `ARG VITE_API_URL` / `ARG VITE_WS_URL`
/ `ARG VITE_SAMPLE_URL`. Railway passes service variables to the
builder when they match `ARG` names — no extra config needed.

### 2.3 `sample-app` (Vite SPA, port `$PORT`)

| Var                   | When | Req | Prod value pattern    | Notes |
|-----------------------|------|-----|-----------------------|-------|
| `PORT`                | RT   | yes | injected by Railway   | |
| `VITE_PARENT_ORIGIN`  | BT   | yes | `https://foldo.dev`   | Origin allowed to `postMessage`. Tightens the bridge in production. |

### 2.4 `shotter` (Playwright Chromium, port `$PORT`) — optional

| Var                   | When | Req | Prod value pattern   | Notes |
|-----------------------|------|-----|----------------------|-------|
| `PORT`                | RT   | yes | injected by Railway  | |
| `FOLDO_SHOT_SECRET`   | RT   | no  | shared with `server` | If set, the shotter requires `Authorization: Bearer <secret>`; the server forwards the same value. |

---

## 3. First-deploy procedure (fresh Railway account)

Time budget: ~25 minutes if you don't hit Resend/DNS hiccups. The
official Railway docs for any step below are linked inline.

### 3.1 Create the project

```bash
# log in once (opens a browser)
railway login

# Find your workspace id
railway list                          # prints workspaces + their projects

# Create the empty project (UI is simpler than CLI for first-time)
# Dashboard → New Project → Empty Project. Note the project id from the URL.
# OR via CLI:
railway init   # interactive

# Link the repo to the project
cd <repo-root>
railway link <projectId>
```

### 3.2 Provision Postgres

```bash
# Dashboard → +New → Database → Postgres. Railway provisions
# `ghcr.io/railwayapp-templates/postgres-ssl:18` with a 5 GB volume
# at /var/lib/postgresql/data.
```

That plugin exposes `DATABASE_URL`, `DATABASE_PUBLIC_URL`, and the
standard `PG*` variables. You'll reference these from the `server`
service in §3.4.

### 3.3 Create the three application services

Each service is a separate Railway service that builds from this same
repo, pointed at a different Dockerfile. The Dockerfile paths live in
`railway.json`.

```bash
# Repeat for: server, web, sample-app
# Dashboard → +New → GitHub Repo → lukataylo/foldo → "Add a service"
#   For "server":    set Service Name = `server`. Railway picks up
#                    apps/server/Dockerfile via railway.json.
#   For "web":       Service Name = `web`. Dockerfile = apps/web/Dockerfile.
#   For "sample-app":Service Name = `sample-app`. Dockerfile = apps/sample-app/Dockerfile.
```

Confirm via:

```bash
railway service list
```

You should see four services (Postgres + the three above) all marked
**building** initially, then **online** once §3.4 is done.

### 3.4 Set env vars (per service)

The matrix in §2 tells you which vars each service needs. The two
unobvious bits:

- **`DATABASE_URL` on `server`** must use a reference variable so it
  follows the Postgres plugin, not be a hard-coded copy:

  ```bash
  # Dashboard: server service → Variables → "Reference" → pick Postgres → DATABASE_URL
  # CLI equivalent:
  railway variables --service server --set 'DATABASE_URL=${{Postgres.DATABASE_URL}}'
  ```

- **`VITE_*` build-time vars on `web` and `sample-app`** must be set
  **before** the first build, otherwise the bundle is built against
  `localhost`. Set them in the Variables tab and then **redeploy**:

  ```bash
  railway variables --service web --set VITE_API_URL=https://api.foldo.dev \
    --set VITE_WS_URL=wss://api.foldo.dev --set VITE_SAMPLE_URL=https://sample.foldo.dev
  railway redeploy --service web --yes
  ```

Apply the full §2 matrix per service. Run `railway variables --service
<name> --kv` to confirm.

### 3.5 (Optional) Deploy the shotter service

The shotter is defined in `railway.json` but **not deployed today**.
Turn it on only if iframing breaks for a target user (X-Frame-Options
or CSP `frame-ancestors`). Symptoms: the canvas shows the
`/c/<url>` fallback UI permanently empty.

```bash
# Dashboard → +New → GitHub Repo → same repo → Service Name = `shotter`.
# Set: FOLDO_SHOT_SECRET=$(openssl rand -hex 32)
# Mirror the same value on `server` so the API can call through.
# Generate a public domain (e.g. shotter.foldo.dev) and set
# VITE_SHOTTER_URL=https://shotter.foldo.dev on the `web` service,
# then redeploy `web`.
```

The shotter image is heavy (`mcr.microsoft.com/playwright:v1.58.0-jammy`).
First deploy takes ~5 minutes; subsequent deploys ~90 seconds.

### 3.6 Generate domains

```bash
# Per service (server, web, sample-app):
#   Dashboard → Settings → Networking → Generate Domain
# For a custom domain (api.foldo.dev, foldo.dev, sample.foldo.dev):
#   Settings → Networking → Custom Domain → add CNAME at your DNS host
```

### 3.7 First deploy + verify

The build triggers automatically on the first push. Watch it via:

```bash
railway logs --service server   # tails build + deploy
railway logs --service web
railway logs --service sample-app
```

Once all four services report `● Online` in `railway service list`,
verify:

```bash
curl -sS https://api.foldo.dev/health        # → {"ok":true,"ts":"..."}
curl -sSI https://api.foldo.dev/metrics      # → 200 with text/plain charset
curl -sSI https://foldo.dev/                 # → 200, served by `vite preview`
curl -sSI https://sample.foldo.dev/          # → 200
```

Or, in one command, from inside the repo:

```bash
make prod-smoke   # see §6
```

---

## 4. Database migrations

Foldo runs migrations **on every server boot** from a single embedded
`SCHEMA` string in `apps/server/src/db.ts`. There is no separate
migration step. The block is shaped so every `CREATE TABLE`,
`CREATE INDEX`, and `ALTER TABLE` is idempotent — a re-run on an
already-migrated DB is a no-op.

### 4.1 What runs at boot

- `CREATE TABLE IF NOT EXISTS` for every table.
- `CREATE [UNIQUE] INDEX IF NOT EXISTS` for every index.
- `ALTER TABLE … ADD COLUMN IF NOT EXISTS` for additive columns.
- `DO $$ BEGIN … END $$` blocks that check `information_schema` and
  `pg_constraint` before adding constraints / FKs / type changes, so
  they're skipped on a fresh boot of an already-migrated DB.

### 4.2 Phase 2 cutover behaviour

Two Phase-2 migrations run automatically on the first boot that
includes them. Behaviour on a **non-empty** production DB:

- **JSONB conversion** of 13 `text`-storing-JSON columns
  (`frames.content_json`, `comments.replies_json`,
  `dispatches.events_json`, etc). The `ALTER TABLE … TYPE JSONB
  USING col::jsonb` step:
  - Takes an `ACCESS EXCLUSIVE` lock on each table for the duration of
    the cast. On `frames` (~3 k rows in prod today), this is ~150 ms
    on the Railway 5 GB Postgres. On a 10× table it's roughly 1 s.
  - **Fails loudly** if any row contains invalid JSON. The pre-step
    `UPDATE … = NULL WHERE col = ''` normalises empty strings — but a
    row with literal `"not json"` would abort the whole migration. If
    you see `invalid input syntax for type json` in the boot log, the
    `server` will refuse to come up; restore from §7 and patch the
    bad row before redeploying.

- **TIMESTAMPTZ conversion** of 19 `text` ISO-string columns. Same
  lock profile, same idempotency story. The custom `pg.types`
  parser at the top of `db.ts` re-renders TIMESTAMPTZ back to an ISO
  string so the wire format is identical — no client-side change.

### 4.3 Monitoring the cutover

```bash
# Tail the server logs for the migration window
railway logs --service server | grep -Ei 'migrat|ALTER|ERROR|FATAL'
```

The first boot after a Phase-2 deploy is the migration boot.
Subsequent restarts skip all the `information_schema`-guarded blocks
in <100 ms.

If it takes more than ~30 s, something is locked — get a `pg_stat_activity` snapshot:

```bash
railway connect Postgres
# inside psql:
SELECT pid, state, wait_event_type, wait_event, query
  FROM pg_stat_activity WHERE state <> 'idle';
```

### 4.4 Long-lived migrations (future)

For migrations bigger than the JSONB/TIMESTAMPTZ jobs above (an
`ALTER COLUMN TYPE` on a 100k+-row table), the embedded-at-boot
approach stops being safe — Railway's health check times out and the
service is killed mid-migration. **TODO**: when that happens, split
the heavy DDL into a one-shot job (Railway has a "Run Command" you
can dispatch into the running service) and remove it from `db.ts`
once applied. We're not there yet.

---

## 5. Rollback

### 5.1 Rolling back code

Railway keeps every successful deployment as an artifact. To roll
back the `server` service to a previous SHA:

```bash
# List deployments (most recent first)
railway deployment list --service server

# Redeploy a specific id. This re-uses the existing image — no rebuild.
railway redeploy --service server --yes        # latest only
# OR pick a specific deployment from the dashboard → "Deployments" tab →
#   "Redeploy" on the row you want. (The CLI's --deployment-id flag
#   isn't on `redeploy` as of CLI v4.57; the dashboard is the
#   one-click path for a specific historical SHA.)
```

Time-to-rollback: ~20 seconds (no build, image is cached).

### 5.2 What's safe to roll back

- **Code-only changes (no schema touch)**: always safe.
- **Additive schema changes** (new column, new index, new table):
  safe to roll back — the old code ignores the new column. Leave the
  schema additions in place; they're forward-compatible.
- **Destructive schema changes** (column drop, NOT NULL added,
  CHECK constraint added that the old code can violate): **not safe
  to roll back code without first reversing the schema**. The Phase-2
  TIMESTAMPTZ cut-over falls in this bucket — the old text-typed
  reader code can still parse a TIMESTAMPTZ-rendered ISO string
  thanks to the type parser override, so in practice this one IS
  safe, but the next migration of similar shape might not be.
- **Migrations themselves**: there is no down-migration today.
  Restore from a backup (§7) if you absolutely need to undo a schema
  change.

### 5.3 Rollback drill

Quarterly, do this:

```bash
# 1. Note the current deployment id
railway deployment list --service server | head -3

# 2. Trigger a redeploy of the second-most-recent
#    Dashboard → Deployments → ⋯ → Redeploy

# 3. Wait for ● Online, then:
make prod-smoke   # see §6

# 4. Roll forward again the same way.
```

If `prod-smoke` is green at every step, the rollback path works.

---

## 6. Smoke testing

### 6.1 `make prod-smoke`

Mints a scrape-only API token in advance, then hits `/health`,
`/metrics`, and one authenticated endpoint:

```bash
# One-time: create the token via the canvas UI (Settings → API tokens
# → "Create token" with label `prod-smoke`). Copy the value, then:
export FOLDO_PROD_SMOKE_TOKEN=…   # from the create-token response

make prod-smoke
# → /health         200 {"ok":true,...}
# → /metrics        200 (Prometheus exposition, NN bytes)
# → /api/home       200 (authenticated, boards=N)
```

The default base URL is `https://api.foldo.dev`. Override with
`FOLDO_PROD_BASE=https://api.staging.foldo.dev`.

### 6.2 Post-deploy gate (Playwright)

The same checks live in `e2e/deploy/prod-smoke.spec.ts`. It only runs
when `RUN_PROD_SMOKE=1` so it doesn't get pulled into the standard
PR run:

```bash
RUN_PROD_SMOKE=1 FOLDO_PROD_SMOKE_TOKEN=… \
  npx playwright test e2e/deploy/prod-smoke.spec.ts
```

Wire this as a GitHub Action **after** the Railway deploy webhook
fires (TODO: not configured yet) and you have an automatic
post-deploy gate.

---

## 7. Postgres backups

Railway's managed Postgres takes **no automatic backups** on the
hobby plan. Foldo runs its own weekly `pg_dump` to S3.

### 7.1 What ships today

**TODO**: the backup cron is **not running yet**. The shape below is
the documented plan — implement before the first paying customer.

### 7.2 Weekly `pg_dump` (planned)

Run from any machine that can reach Railway Postgres (including a
GitHub Action with `pg_dump` in the runner image):

```bash
# Get a public connection URL — Railway exposes one alongside the
# private DATABASE_URL.
PG_URL=$(railway variables --service Postgres --kv | awk -F= '/^DATABASE_PUBLIC_URL=/{print $2}')

STAMP=$(date -u +%Y-%m-%dT%H-%M-%SZ)
pg_dump --format=custom --no-owner --no-privileges "$PG_URL" \
  | aws s3 cp - "s3://foldo-backups/postgres/foldo-${STAMP}.dump" \
      --content-type application/octet-stream
```

Retention: keep weekly snapshots for 8 weeks (~rolling 2 months),
monthly snapshots for 12 months. Lifecycle policy on the S3 bucket
expires old objects.

Schedule: GitHub Actions cron, `0 4 * * 0` (Sunday 04:00 UTC).

### 7.3 Restore drill

Quarterly:

```bash
# 1. Spin up a scratch DB (Railway: create a second Postgres in a
#    "drill" environment, or use a local docker container).
docker run --rm -d --name foldo-restore -p 5432:5432 \
  -e POSTGRES_PASSWORD=local postgres:18-alpine

# 2. Pull the most recent backup
aws s3 cp s3://foldo-backups/postgres/$(aws s3 ls s3://foldo-backups/postgres/ | \
  sort | tail -1 | awk '{print $4}') /tmp/restore.dump

# 3. Restore
pg_restore --no-owner --no-privileges --clean --if-exists \
  -d postgresql://postgres:local@localhost:5432/postgres /tmp/restore.dump

# 4. Boot the server against it and run `make prod-smoke`
DATABASE_URL=postgresql://postgres:local@localhost:5432/postgres \
  FOLDO_PROD_BASE=http://localhost:4000 make prod-smoke
```

Pass = the dump is restorable. Log the drill in `docs/RUNBOOK-LOG.md`
(TODO: file doesn't exist yet; create on first drill).

---

## 8. Observability

### 8.1 Logs

The server logs structured JSON via Pino (`apps/server/src/index.ts`).
Every line has `service: 'foldo-server'`, `env`, `reqId`, and (when
authenticated) `userId`. Today logs are visible only through:

```bash
railway logs --service server
```

**TODO** — log shipping is **not wired**. The cleanest drop-in is a
Railway → Better Stack (Logtail) drain, since it understands
JSON-per-line out of the box. The pattern, once you have an account:

```bash
# 1. Dashboard → Better Stack → +Source → "HTTP Log Drain". Copy the
#    ingest URL (looks like https://in.logs.betterstack.com/…/<token>).
# 2. Dashboard → Foldo server service → Settings → Log Drains → +Add HTTP
#    URL: <ingest URL from step 1>
# 3. Save. Logs start streaming within ~30 seconds; verify in the
#    Better Stack dashboard.
```

The same shape works for Datadog (drain type = Datadog) and Loki
(drain type = HTTP, content-type `application/json`, target your
Loki push API). Pick one — having two is worse than having one.

### 8.2 Metrics — Prometheus scrape

`/metrics` is unauthenticated and exposes the Foldo HTTP counter +
histogram, WS gauges, DB pool gauges, and the default node process
metrics. For Grafana Cloud, drop this into your scrape config:

```yaml
# grafana-agent-config.yaml or prometheus.yml
scrape_configs:
  - job_name: foldo-server
    scrape_interval: 30s
    metrics_path: /metrics
    scheme: https
    static_configs:
      - targets: ['api.foldo.dev']
        labels:
          env: production
          service: foldo-server
    # Auth: today the endpoint is open. For Grafana Cloud's "agentless"
    # scraper, that's fine — the endpoint is public, the data isn't
    # sensitive. If you want to gate it, add a basic_auth header here
    # and a matching preHandler on /metrics in apps/server/src/metrics.ts.
    # See the comment in registerMetrics() — the hook point is documented.
```

In Grafana Cloud: **Connections → Add new connection → Hosted
Prometheus metrics → Send metrics via the Agent** gives you the
config + the auth header. Paste the scrape block above into the
`scrape_configs` section.

Key dashboards to build:

- `rate(foldo_http_requests_total[5m])` per status — request rate
  by 2xx/4xx/5xx.
- `histogram_quantile(0.95, rate(foldo_http_request_duration_seconds_bucket[5m]))`
  — p95 latency per route.
- `foldo_ws_connections` — live WS count per board.
- `foldo_db_pool_idle` / `foldo_db_pool_total` — pool saturation
  (alert when `idle == 0` for >2 minutes).

---

## 9. `railway.json` — what's in / what's out

The file at the repo root is the source of truth for service shape.
A summary of what each block does:

- `build.builder = NIXPACKS` — project-level default; each service
  overrides to `DOCKERFILE` because we want the workspace install
  layer cached precisely.
- `deploy.restartPolicyType = ON_FAILURE`, `restartPolicyMaxRetries = 10`
  — Railway restarts a crashed container up to 10× before backing
  off. Matches the per-service overrides.
- `services.server.deploy.healthcheckPath = /health`,
  `healthcheckTimeout = 30` — Railway probes this and only routes
  traffic to a deployment once `/health` returns 200.
- `services.web.deploy.startCommand` — explicit because the
  Dockerfile CMD uses a shell form that needs `$PORT` expansion at
  container start. The `npm --workspace @foldo/web run preview`
  invocation also works locally.
- `services.shotter` — **defined but not deployed today**. See §3.5
  for when to turn it on. The block is kept in `railway.json` so the
  config travels with the repo and the second-engineer onboarding
  doesn't have to invent it.

---

## 10. Known gaps (honesty section)

- **Log shipping**: not configured. §8.1 says "TODO" — fix before
  you need to grep last week's logs.
- **Backup cron**: not running. §7.1 says "TODO" — fix before the
  first paying customer.
- **Post-deploy gate in CI**: `prod-smoke.spec.ts` exists, but no
  GitHub Action triggers it after a Railway deploy. Hook in via a
  repository_dispatch from Railway's deploy webhook.
- **S3 recordings in prod**: code path exists, prod is using the
  local volume (`/data/foldo-storage`). Fine while recordings are
  rare; switch when storage on the volume crosses ~3 GB.
- **Single-instance hub**: WS hub is in-memory. Multi-instance Redis
  hub is implemented but unwired. Don't horizontal-scale the
  `server` service until that's flipped on.
- **Down-migrations**: don't exist. Roll-forward only; restore from
  backup if you need to undo a schema change.
