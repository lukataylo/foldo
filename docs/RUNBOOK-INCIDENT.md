# Incident response playbook

> Read this BEFORE the incident. The first 10 minutes are when you most
> want a checklist and least want to be reading documentation cold.

This file is the on-call playbook for Foldo. It's opinionated, concrete,
and assumes the engineer reading it has shell access to the Railway
project and the Postgres plugin. Pair it with:

- `docs/DEPLOYMENT.md` — env-var matrix, first-deploy, rollback, backups.
- `docs/RUNBOOK-LOG.md` — append a row for every incident or drill.

---

## 1. Severity scale

| SEV | Definition                                                                                | Response                                                                                       |
|-----|-------------------------------------------------------------------------------------------|------------------------------------------------------------------------------------------------|
| 1   | **Data loss or corruption**, or a security incident with confirmed unauthorised access.   | Drop everything. Open incident channel. Page everyone. Do **not** restart anything until §6.1. |
| 2   | **Auth or core API down** (login broken, /api/* 5xx for all users, WS hub unreachable).   | Within 15 min: ack + start §3. Time-to-fix target: <60 min.                                    |
| 3   | **Feature broken** for some users (a board fails to load, dispatch flaps, recordings 503). | Within 1 h: ack + diagnose. Time-to-fix target: same-day.                                      |
| 4   | **Cosmetic / non-blocking** (slow page load, stale metric, log noise).                    | Next business day. Open a GitHub Issue. No paging.                                             |

If you can't classify within 5 minutes, **treat it as one severity higher**
than your guess until you can prove otherwise.

---

## 2. First 10 minutes (regardless of severity)

1. **Acknowledge** in the incident channel: "I have this. SEV-X. Starting
   diagnosis." Even if you're the only engineer — you'll thank yourself
   when you write the post-mortem.
2. **Snapshot now**, not later:
   ```bash
   railway logs --service server > /tmp/incident-$(date +%s)-server.log
   railway logs --service web    > /tmp/incident-$(date +%s)-web.log
   ```
3. **Capture metrics** if you have a Grafana dashboard up. Screenshot
   wins over "I'll go look later".
4. **Don't restart anything yet.** A restart wipes the very state you
   need to diagnose. The exception is SEV-1 with active data loss — see
   §6.1.
5. Move to the decision tree (§3).

---

## 3. Decision tree

```
        ┌─── what's broken? ───┐
        │                      │
   ┌────▼────┐           ┌─────▼─────┐
   │ users   │           │ infra     │
   │ report  │           │ alerts    │
   └────┬────┘           └─────┬─────┘
        │                      │
        ▼                      ▼
   "I can't log in"     /metrics is missing, /health 5xx,
   "the canvas        Railway shows ● Failed, DB at 100% CPU
    is blank"
        │                      │
        ├─ §4.1 Auth            ├─ §4.2 DB
        ├─ §4.3 Web             ├─ §4.4 Server / API
        ├─ §4.5 WS              └─ §4.6 Storage
        └─ §4.7 Email
```

Pick the right subsection based on the *symptom*, not your gut. Symptoms
that span multiple categories (e.g. "the whole thing is down") almost
always trace back to **DB unreachable** or **server crashed at boot**
— start with §4.2 and §4.4 in that order.

---

## 4. Common runbooks

### 4.1 Auth — `/api/auth/*` 500s, login fails, magic-link emails not arriving

**Symptoms:** users see "Sign-in failed", magic-link emails delayed or
missing, OR every authenticated endpoint returns 401 even with a fresh
token.

**First diagnostic:**

```bash
# 1. Confirm the request lifecycle reaches the server at all.
curl -i https://api.foldo.dev/api/auth/whoami
#   → 200 + JSON  ⇒ auth service alive, issue is per-user
#   → 401         ⇒ token rejected. Mint a fresh prod-smoke token and retry.
#   → 5xx         ⇒ server-side. Pull last 200 lines of logs:
railway logs --service server | tail -200 | grep -Ei 'auth|scrypt|email|token'
```

**Likely causes, in order:**

1. **Email transport down** — magic-link flow can't send. Check
   `FOLDO_EMAIL_PROVIDER` is set on the `server` service and that
   `RESEND_API_KEY` is still valid (Resend rotates keys aggressively).
   Failover: temporarily unset `FOLDO_EMAIL_PROVIDER` so the local-outbox
   stub kicks in and users can paste links from the server logs (degraded
   mode — communicate this).
2. **scrypt mismatch** — if a recent deploy changed `FOLDO_AUTH_SECRET`,
   every existing session token is invalidated. Roll back the deploy
   (`docs/DEPLOYMENT.md §5.1`).
3. **DB unreachable** — auth needs to read/write `sessions`. If `/health`
   is also 5xx, jump to §4.2.

---

### 4.2 DB — Postgres unreachable, slow, or at capacity

**Symptoms:** `/health` returns 5xx with `db: false`, OR everything is
slow, OR Grafana shows `foldo_db_pool_idle == 0` for >2 minutes.

**First diagnostic:**

```bash
# Can we reach the Postgres plugin at all?
railway connect Postgres
# inside psql:
SELECT count(*) FROM pg_stat_activity;            -- alive at all?
SELECT pid, state, wait_event_type, wait_event, query
  FROM pg_stat_activity WHERE state <> 'idle';    -- what's blocked?
SELECT pg_size_pretty(pg_database_size('railway')); -- close to volume limit?
```

**Likely causes, in order:**

1. **Pool exhausted** — `foldo_db_pool_idle == 0`, many `state='active'`
   rows. Bump `DATABASE_POOL_MAX` (currently `10`) by 2× and restart the
   `server` service. Then file an issue to investigate the long-running
   query.
2. **Volume full** — Railway hobby Postgres has a 5 GB volume. If
   `pg_database_size` is >90% of that, the DB will start rejecting
   writes. Trim the noisiest table (usually `dispatches` event JSON) or
   upgrade the volume in the Railway dashboard.
3. **Migration stuck mid-boot** — if `pg_stat_activity` shows an
   `ALTER TABLE` running, see `docs/DEPLOYMENT.md §4.3`. Do **not**
   kill it on a TIMESTAMPTZ/JSONB conversion — partial state is harder
   to recover than waiting it out.
4. **Plugin actually down** — Railway status page (status.railway.app).
   No fix from us; wait it out and communicate.

---

### 4.3 Web — `https://foldo.dev` is blank, 502, or stuck loading

**Symptoms:** the canvas SPA fails to load, the marketing page is white,
DNS resolves but the page doesn't.

**First diagnostic:**

```bash
# 1. Is the web service even up?
curl -sSI https://foldo.dev/
#   → 200 ⇒ static is fine, issue is downstream (API). Jump to §4.4.
#   → 502 ⇒ container crashed or not bound. Logs:
railway logs --service web | tail -100
#   → 404 ⇒ deploy succeeded but dist is empty (build broke silently).
```

**Likely causes, in order:**

1. **Build-time env var missing or wrong** — the bundle was built with
   `VITE_API_URL=http://localhost:4000` (the default) and is now trying
   to hit localhost from the browser. Confirm in browser devtools
   Network tab. Fix: set the variable + `railway redeploy --service web`.
2. **Container crash loop** — `serve` failed to bind `$PORT`. Should be
   rare since `--no-port-switching` makes a collision a hard fail. Logs
   will show `EADDRINUSE`.
3. **CDN / DNS** — if it's just slow, not broken, blame the network and
   wait.

---

### 4.4 Server / API — `/health` 5xx, `/api/*` 5xx, requests hanging

**Symptoms:** API errors across the board, `/health` returns non-200,
boot loop in Railway logs.

**First diagnostic:**

```bash
curl -sS https://api.foldo.dev/health
#   → {"ok":true,...}                  ⇒ healthy. Look elsewhere.
#   → {"ok":false,"reason":"db"}       ⇒ §4.2.
#   → 502/504                          ⇒ server crashed. Logs:
railway logs --service server | tail -300
```

**Likely causes, in order:**

1. **Boot crash** — top of the logs will show an unhandled rejection or
   a missing env var. Most common: `DATABASE_URL` reference variable
   broke after renaming the Postgres plugin.
2. **OOM** — Railway hobby plan caps containers at 8 GB. If the heap
   chart spikes near boot, it's a leak; bisect deploys.
3. **Health-check timing out** — `healthcheckTimeout=30` in
   `railway.json`. If migrations take >30 s on first boot (rare), Railway
   will kill the container. Temporary fix: bump the timeout. Long-term:
   move heavy migrations out-of-band (see `docs/DEPLOYMENT.md §4.4`).

---

### 4.5 WS — live cursors gone, comments don't sync, hub disconnects

**Symptoms:** users on the same board don't see each other; presence
flickers; `wss://api.foldo.dev/ws` returns 502 on upgrade.

**First diagnostic:**

```bash
# Browser devtools: Network → WS → connect to wss://api.foldo.dev/ws
# Expect: 101 Switching Protocols. Anything else = server-side.

# Server-side:
railway logs --service server | grep -Ei 'hub|ws|upgrade|redis'

# Hub stats endpoint (if exposed):
curl -sS -H "authorization: Bearer $FOLDO_PROD_SMOKE_TOKEN" \
  https://api.foldo.dev/api/_internal/hub-stats | jq .
```

**Likely causes, in order:**

1. **Single instance restarted** — the in-memory hub is per-process.
   Every restart drops all WS connections; clients reconnect within ~2 s.
   If you see this happening every few minutes, the underlying issue is
   §4.4 (boot loop), not WS itself.
2. **Redis hub enabled but unreachable** — only relevant if a future
   deploy turns on `apps/server/src/ws/hub-redis.ts`. Check
   `REDIS_URL` is set and the plugin is online.
3. **Origin rejection** — `FOLDO_WEB_ORIGIN` doesn't include the host
   the user came from. Look for `origin not allowed` in logs.

---

### 4.6 Storage — recordings 503, attachments missing

**Symptoms:** "Failed to upload recording" in the UI; existing
recordings 404; the `foldo_storage_*` metrics show errors.

**First diagnostic:**

```bash
# Where IS storage today?
railway variables --service server --kv | grep -E 'FOLDO_STORAGE|FOLDO_S3'

# Volume-backed (default):
railway run --service server -- df -h /data
#   → if Use% > 90, volume is full. Bump the volume size in dashboard.

# S3-backed:
aws s3 ls "s3://${FOLDO_S3_BUCKET}/recordings/" | head -5
#   → if empty / 403, IAM credentials rotated.
```

**Likely causes, in order:**

1. **Volume full** — trim old recordings, bump volume.
2. **S3 credentials rotated** — `FOLDO_S3_ACCESS_KEY` / `_SECRET`
   silently expired. Rotate, set in Railway, redeploy.
3. **MIME-type rejection** — code paths that whitelist
   `audio/webm; codecs=opus` may reject a recording from a new browser.
   Check logs for "unsupported content-type".

---

### 4.7 Email — magic-links not landing, password resets bouncing

**Symptoms:** users say "I never got the email"; webhook from Resend
reports bounces; outbox is full.

**First diagnostic:**

```bash
# Is the provider even configured in prod?
railway variables --service server --kv | grep FOLDO_EMAIL
#   FOLDO_EMAIL_PROVIDER=resend → provider mode
#   (unset / empty)              → local-outbox stub (NOT FOR PROD)

# Resend dashboard: https://resend.com/emails  — check delivery status,
# bounces, and the From-domain DKIM/SPF.
```

**Likely causes, in order:**

1. **DKIM/SPF unverified for sender domain** — Resend silently drops to
   spam. Re-verify in the Resend dashboard.
2. **`RESEND_API_KEY` rotated** — every Resend send returns 401. Rotate
   in their dashboard, set the new key, redeploy `server`.
3. **Recipient blocklisted** — bounce-back loop. Check the Resend
   suppression list.

---

## 5. Escalation matrix

We're a single-engineer team today. Document it anyway so it scales:

| Role               | Who           | When to wake up                         | Channel          |
|--------------------|---------------|-----------------------------------------|------------------|
| On-call engineer   | luka          | SEV-1, SEV-2                            | Slack DM + phone |
| Backup engineer    | (none today)  | On-call unreachable, SEV-1 still active | n/a              |
| Customer comms     | luka          | Any customer-facing impact >5 min       | status page      |
| Vendor escalation  | Railway       | Platform-wide outage (status.railway.app) | support ticket  |
| Vendor escalation  | Resend        | Email outage with vendor confirmation   | support ticket   |
| Vendor escalation  | AWS support   | S3 outage in the bucket's region        | support ticket   |

When the team grows, replace "(none today)" with a real name and a real
phone number.

---

## 6. Special procedures

### 6.1 SEV-1 data loss — do this BEFORE you restart anything

1. **Stop writes.** Quickest: set `READ_ONLY=1` on the `server` service
   (TODO — code support not wired yet; until then, scale `server` to 0
   replicas, which kills the API but preserves the DB).
2. **Snapshot the database NOW**, even if you're not sure you'll need it:
   ```bash
   railway run --service server -- bash scripts/pg-backup.sh
   # OR: from a local machine, if the script env is exported:
   DATABASE_URL=$(railway variables --service Postgres --kv | awk -F= '/^DATABASE_PUBLIC_URL=/{print $2}') \
     FOLDO_BACKUP_BUCKET=foldo-backups \
     bash scripts/pg-backup.sh
   ```
3. **Confirm the most recent automatic backup** (`s3://${FOLDO_BACKUP_BUCKET}/postgres/`)
   is reachable. Restore drill from `docs/DEPLOYMENT.md §7.3` should be
   green from your last quarterly drill — if it isn't, you find out now.
4. Only then start diagnosing.

### 6.2 Rolling back a bad deploy

See `docs/DEPLOYMENT.md §5`. Summary:

```bash
railway deployment list --service server | head -3
# Dashboard → server → Deployments → ⋯ → Redeploy on the row you want.
# Time-to-rollback: ~20 s (image cached).
```

If the bad deploy ran a destructive migration, see §5.2 of the same doc
*before* rolling code back — old code against new schema is a different
problem.

### 6.3 Communicating to users

We don't have a hosted status page yet. Until then:

- **In-product**: post a banner via the canvas's `<MaintenanceBanner>`
  prop (set `VITE_MAINTENANCE_MESSAGE` at build time + redeploy — fast,
  but requires a build). For sub-5-min outages, skip this.
- **Out-of-product**: post to the `#status` channel in the user community
  (TODO: doesn't exist yet) or DM the top 10 customer admins directly.

---

## 7. Post-mortem template

Within 48 h of any SEV-1 or SEV-2, fill this out and commit to
`docs/incidents/YYYY-MM-DD-shortname.md` (directory created on first
use).

```markdown
# Incident: <short name>

- **Date / time (UTC):**
- **Severity:**
- **Duration:** detected at HH:MM, mitigated at HH:MM, root-caused at HH:MM
- **Customer impact:** (concrete, e.g. "all writes failed for 14 min")
- **On-call:**
- **Detected by:** (alert / customer report / Grafana / luck)

## Root cause

Two paragraphs max. Mechanical cause, not "the deploy broke things".

## Timeline (UTC)

- HH:MM — symptom appeared (log line / metric / customer report)
- HH:MM — first action taken
- HH:MM — mitigation in place
- HH:MM — full recovery confirmed (prod-smoke green)
- HH:MM — root cause identified

## What went well

(Genuinely — not corporate filler. e.g. "the post-deploy smoke caught
this within 90 s of the bad deploy going live".)

## What went badly

(Equally genuine. e.g. "I restarted server before snapshotting, so we
lost the original error from the pino logger.")

## Action items

- [ ] (owner, due-date) Make X observable so we don't have to ssh next time.
- [ ] (owner, due-date) Add a regression test that would catch this.
- [ ] (owner, due-date) Fix the root cause permanently.

## Metric to add

What single metric, if it had existed and been alerting, would have
caught this 10 minutes earlier? Add it.
```

Cross-reference: add a row to `docs/RUNBOOK-LOG.md` once the post-mortem
is in.

---

## 8. Drills (do these quarterly)

| Drill              | What it proves                                          | Doc reference                    |
|--------------------|---------------------------------------------------------|----------------------------------|
| Rollback drill     | A bad deploy is reversible in <2 min.                   | `docs/DEPLOYMENT.md §5.3`        |
| Restore drill      | Backups in S3 are restorable into a scratch DB.         | `docs/DEPLOYMENT.md §7.3`        |
| Failover drill     | (Future) Promote a standby DB.                          | N/A — single-instance today.     |
| Comms drill        | "Down for 10 min, write the customer email." (5 min.)   | N/A — practise it anyway.        |

Log every drill in `docs/RUNBOOK-LOG.md`, even when it passes uneventfully.
The pattern of drills happening is itself the evidence that they work.
