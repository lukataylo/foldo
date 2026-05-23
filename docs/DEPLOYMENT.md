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
       │ (serve, port $PORT)          (Fastify+tsx, port $PORT)│
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
       │ (serve, port $PORT)                                  │
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
- **Hub backend**: defaults to in-memory when `REDIS_URL` is unset.
  When `REDIS_URL` is set, the server boots the Redis-backed hub
  (`apps/server/src/ws/redisHub.ts`) at startup and **multi-replica
  is supported**. Without `REDIS_URL`, replicas MUST stay at 1 — the
  in-memory hub doesn't fan broadcasts out across processes and
  clients on different replicas will desync immediately. Check the
  active backend in the boot log: look for
  `[ws] hub=redis url=…` or
  `[ws] hub=in-memory (set REDIS_URL to enable horizontal scaling)`.
  If RedisHub init fails (bad URL, network blip), the server logs a
  loud warning, bumps the `foldo_hub_init_fallback_total` counter, and
  falls back to in-memory rather than crashing — so a stuck Redis
  doesn't take the API down, but multi-replica deploys WILL desync
  until the next clean boot.

### 1.1 Enabling horizontal scaling

1. **Provision Redis** on Railway:
   ```bash
   # Dashboard → +New → Database → Redis. Railway provisions the
   # bitnami/redis image with no volume (pure cache use case).
   ```
2. **Wire `REDIS_URL`** on the `server` service:
   ```bash
   railway variables --service server --set 'REDIS_URL=${{Redis.REDIS_URL}}'
   ```
   The reference variable means the URL follows the Redis plugin's
   credential rotation automatically.
3. **Restart** the `server` service. Tail the boot log:
   ```bash
   railway logs --service server | grep '\[ws\] hub'
   ```
   You should see `[ws] hub=redis url=redis://…` (password redacted).
4. **Bump replicas**:
   ```bash
   # Dashboard → server service → Settings → Replicas → 2 (or more).
   ```
   Verify by tailing logs on both replicas — broadcasts triggered on
   one replica should appear in the counter (`foldo_ws_broadcast_total`)
   on the other, and a client connected to replica A should see
   presence/edits from a client on replica B.

Rollback: drop replicas back to 1 first, then unset `REDIS_URL` if you
need to remove the Redis plugin. Going from `replicas=N → replicas=1`
without removing Redis is also safe — the in-memory hub fallback kicks
in only if Redis is unreachable.

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
| `REDIS_URL`                  | RT   | no\* | `${{Redis.REDIS_URL}}` (Railway reference)          | \*Required if `replicas>1`. When set, server boots the Redis-backed WS hub; unset = in-memory hub (`replicas=1` only). See §1 + §1.1. |
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
| `PORT`               | RT   | yes | injected by Railway              | `serve` binds it via `--listen tcp://0.0.0.0:$PORT` (see `railway.json:32`). |
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
curl -sSI https://foldo.dev/                 # → 200, served by `serve` (static)
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

### 6.2 Post-deploy gate (Playwright)  — **DONE**

The same checks live in `e2e/deploy/prod-smoke.spec.ts`. It only runs
when `RUN_PROD_SMOKE=1` so it doesn't get pulled into the standard
PR run:

```bash
RUN_PROD_SMOKE=1 FOLDO_PROD_SMOKE_TOKEN=… \
  npx playwright test e2e/deploy/prod-smoke.spec.ts
```

The GitHub Action that runs this post-deploy lives at
[`.github/workflows/post-deploy-smoke.yml`](../.github/workflows/post-deploy-smoke.yml).
It's triggered by `repository_dispatch` (event type `railway-deployed`)
and is also runnable manually from the Actions tab.

#### Wiring Railway → GitHub `repository_dispatch`

Railway doesn't speak the `repository_dispatch` API directly, so you
need a tiny shim. Two options:

**Option A — Railway native webhook (recommended).** In the Railway
dashboard:

1. Project → Settings → Webhooks → +New Webhook
2. URL: `https://api.github.com/repos/<owner>/<repo>/dispatches`
3. Method: `POST`
4. Headers:
   - `Authorization: Bearer <GH_PAT>` (a fine-grained personal access
     token with `repository_dispatch: write` on this repo; store it as a
     Railway env var like `GH_DISPATCH_TOKEN` and reference it here)
   - `Accept: application/vnd.github+json`
   - `User-Agent: railway-foldo-deploy-webhook` (GitHub rejects no UA)
5. Body:
   ```json
   {
     "event_type": "railway-deployed",
     "client_payload": {
       "service": "{{ service.name }}",
       "deployment_id": "{{ deployment.id }}",
       "commit_sha": "{{ deployment.meta.commitSha }}",
       "base_url": "https://api.foldo.dev"
     }
   }
   ```
6. Trigger on: **Deployment Succeeded** (for the `server` service —
   triggering on every service would run the smoke 3× per merge).

**Option B — Cloudflare Worker shim.** If Railway's native webhook
can't carry your auth header for some reason, deploy a 30-line Worker
that takes the Railway webhook body, repackages it, and POSTs to
GitHub with the secret pulled from `wrangler secret`. Out of scope
here.

#### Required secret

The workflow needs:

- `FOLDO_PROD_SMOKE_TOKEN` — scrape-only API token (minted via the
  canvas Settings → API tokens UI). Add to Repository
  Settings → Secrets and variables → Actions → New repository secret.

On failure, the workflow auto-comments on the HEAD commit with a
diagnostic checklist linking back to `docs/RUNBOOK-INCIDENT.md §4.4`.

---

## 7. Postgres backups

Railway's managed Postgres takes **no automatic backups** on the
hobby plan. Foldo runs its own weekly `pg_dump` to S3.

### 7.1 What ships today — **DONE**

The backup cron runs as a GitHub Action:
[`.github/workflows/backup-pg.yml`](../.github/workflows/backup-pg.yml).
Schedule: Sundays 04:00 UTC. The dump itself is produced by
[`scripts/pg-backup.sh`](../scripts/pg-backup.sh), which is also
runnable from any operator's machine for an ad-hoc snapshot.

#### Required repository secrets

Add these in **Settings → Secrets and variables → Actions**:

| Secret                  | Value                                                                                              |
|-------------------------|----------------------------------------------------------------------------------------------------|
| `DATABASE_URL`          | Railway Postgres **public** connection URL (the `DATABASE_PUBLIC_URL` variable on the plugin).     |
| `AWS_ACCESS_KEY_ID`     | IAM user with `s3:PutObject` + `s3:ListBucket` on the backup bucket below — and **nothing else**.  |
| `AWS_SECRET_ACCESS_KEY` | Paired secret.                                                                                     |
| `AWS_REGION`            | Bucket region, e.g. `eu-west-2`.                                                                   |
| `FOLDO_BACKUP_BUCKET`   | Bucket name, e.g. `foldo-backups`.                                                                 |

The IAM policy for that user — copy/paste-able starting point:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "FoldoBackupWrite",
      "Effect": "Allow",
      "Action": ["s3:PutObject", "s3:PutObjectAcl"],
      "Resource": "arn:aws:s3:::foldo-backups/postgres/*"
    },
    {
      "Sid": "FoldoBackupVerify",
      "Effect": "Allow",
      "Action": ["s3:ListBucket", "s3:GetObject"],
      "Resource": [
        "arn:aws:s3:::foldo-backups",
        "arn:aws:s3:::foldo-backups/postgres/*"
      ]
    }
  ]
}
```

On failure, the workflow opens (or updates) a `backup-failure` GitHub
Issue with diagnostic links to this section and `RUNBOOK-INCIDENT.md`.

### 7.2 Weekly `pg_dump` (mechanics)

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

Pass = the dump is restorable. Log the drill in
[`docs/RUNBOOK-LOG.md`](./RUNBOOK-LOG.md).

---

## 8. Observability

### 8.1 Logs

The server logs structured JSON via Pino (`apps/server/src/index.ts`).
Every line has `service: 'foldo-server'`, `env`, `reqId`, and (when
authenticated) `userId`. Today logs are visible only through:

```bash
railway logs --service server
```

**TODO** — log shipping is **not wired**. The choice between providers
is a business decision (cost, retention, alerting features), so this
doc gives you two opinionated free-tier options and the exact steps for
each. Pick **one** — having two is worse than having one.

#### Option A — Grafana Loki (cloud, free tier)

Free tier: 50 GB log ingest/month, 14-day retention, 10 k active series.
Good fit if you're already using Grafana Cloud for metrics (§8.2).

1. Sign up at https://grafana.com/auth/sign-up/create-user (no card).
2. Grafana Cloud → **Connections → Add new connection → Logs → Loki**.
   Note the **endpoint URL** (looks like
   `https://logs-prod-xxx.grafana.net/loki/api/v1/push`).
3. Create an **API token** with the `metrics-publisher` scope (despite
   the name, it covers Loki push).
4. Railway dashboard → `server` service → **Settings → Log Drains →
   +Add → HTTP**.
   - URL: `https://<user>:<token>@logs-prod-xxx.grafana.net/loki/api/v1/push`
   - Content-Type: `application/json`
5. Save. Logs appear in **Explore → data source = grafanacloud-loki**
   within ~30 s. Verify with `{service="foldo-server"} |= "started"`.

#### Option B — Datadog (free tier, 5-day retention)

Free tier is 5 hosts and 14-day metric retention; logs are a paid
add-on **but** the first 1 GB/day of log ingest is free under the
"Pro" trial (no card for 14 days). After trial: ~$0.10/GB.

1. Sign up at https://www.datadoghq.com/free-datadog-trial/. Pick the
   US1 or EU1 region — note this, it changes the endpoint.
2. Org Settings → **API Keys** → create a key named `railway-drain`.
3. Railway dashboard → `server` service → **Settings → Log Drains →
   +Add → Datadog**.
   - Region: same one you picked above.
   - API key: paste from step 2.
4. Save. Logs appear in **Logs → Live Tail** within ~30 s. Filter
   `service:foldo-server` to confirm.

Both options consume the Pino JSON-per-line format the server already
emits (`apps/server/src/index.ts`) without any code change. If you pick
something else (Better Stack, Axiom, New Relic), the pattern is the
same: their UI gives you an HTTP endpoint, you paste it into Railway's
HTTP log drain config.

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
  container start. As of the A+ W1 ops slice (2026-05), the web and
  sample-app services serve their `dist/` via the `serve` package
  (https://www.npmjs.com/package/serve) instead of `vite preview`.
  Reasons: gzip/brotli on text assets, range requests, and a sane
  cache-header policy driven by `apps/<app>/serve.json` (long-lived
  `immutable` for content-hashed JS/CSS, `no-cache` for `index.html`
  so a new deploy is picked up on the next page load). `--single`
  enables SPA history-mode fallback. The container's PATH includes
  `/app/node_modules/.bin` so `serve` resolves to the hoisted CLI shim
  with no extra global install.
- `services.shotter` — **defined but not deployed today**. See §3.5
  for when to turn it on. The block is kept in `railway.json` so the
  config travels with the repo and the second-engineer onboarding
  doesn't have to invent it.

---

## 10. Known gaps (honesty section)

- **Log shipping**: still not enabled — but §8.1 now spells out the
  two free-tier options (Grafana Loki, Datadog) and the exact Railway
  log drain config. Pick one before you need to grep last week's logs.
  *Doc done, account creation pending operator.*
- **Backup cron**: **DONE** — runs via
  `.github/workflows/backup-pg.yml`. Requires the 5 secrets in §7.1
  to be configured before it'll do anything useful.
- **Post-deploy gate in CI**: **DONE** —
  `.github/workflows/post-deploy-smoke.yml` runs on
  `repository_dispatch`. Requires the Railway → GitHub webhook to be
  wired (§6.2) and the `FOLDO_PROD_SMOKE_TOKEN` secret set.
- **S3 recordings in prod**: code path exists, prod is using the
  local volume (`/data/foldo-storage`). Fine while recordings are
  rare; switch when storage on the volume crosses ~3 GB.
- **WS hub scaling**: multi-replica is supported when `REDIS_URL` is
  set (see §1 + §1.1). Without `REDIS_URL` the server falls back to
  the in-memory hub and you MUST keep `replicas=1` — broadcasts on
  one replica won't reach clients on another and the canvas will
  desync silently.
- **Down-migrations**: don't exist. Roll-forward only; restore from
  backup if you need to undo a schema change.
- **Incident response**: see [`RUNBOOK-INCIDENT.md`](./RUNBOOK-INCIDENT.md)
  for severity scale, decision tree, common subsystem runbooks
  (DB, auth, WS, storage), and post-mortem template.
