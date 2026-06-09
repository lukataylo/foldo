# User actions required for full A+ production readiness

Items the code can't do for you — each takes 5–30 minutes of clicking
in an external dashboard, after which the corresponding code path can
be wired without further engineering work.

Track each item to closure here. Cross-link to the PRs that landed the
code waiting on these actions.

---

## P0 — deploy correctness

### 0. Point each Railway service at its per-app railway.json

**Why:** Railway config-as-code is service-scoped — the old root
`railway.json` used a `services` map the schema doesn't support, so
Railway was ignoring it entirely (services built with root Nixpacks,
no `/health` deploy gate). The config now lives at
`apps/<app>/railway.json`, but Railway only reads those files once each
service's **Settings → Config-as-code → Config file path** points at
its own file. Until that's done, services deploy with dashboard
defaults only.

**How:** in the Railway dashboard, for each service set the config
file path:

| Service      | Config file path               |
| ------------ | ------------------------------ |
| `server`     | `apps/server/railway.json`     |
| `web`        | `apps/web/railway.json`        |
| `sample-app` | `apps/sample-app/railway.json` |
| `shotter`    | `apps/shotter/railway.json` (when/if deployed) |

Then redeploy each service once.

**Done when:** each service's build log shows it using its Dockerfile
(`apps/<app>/Dockerfile`), and the server's deployment waits on the
`/health` healthcheck before traffic switches over.

---

## P0 — security

### 1. Rotate the Resend API key

**Why:** the original key (`re_7jZokA5E_…`) was pasted into a Claude
Code chat earlier in development. Treat as compromised.

**How:**
1. `https://resend.com/api-keys` → revoke `re_7jZokA5E_…`
2. Create a new key. Name it `foldo-server-prod`.
3. `railway variables set RESEND_API_KEY=<new>` on the `server` service.
4. `railway redeploy --service server --from-source --yes`
5. Send a test password-reset to confirm delivery.

**Done when:** the old key returns 401 from a curl test, the new key
returns 200, and a password-reset email lands in your inbox.

---

### 2. Railway deploy promotion (open ticket if it persists)

**Symptom:** every push since `2026-05-23T19:42` has built successfully
on Railway and its API reports `SUCCESS` for the new deployment, but
the **actively-routed container** keeps being the old one. Tail
`railway logs --service web --deployment` and you'll see
`vite preview` output (the pre-substrate image), not the new `serve`
output the current Dockerfile would produce.

**What we tried:**
- PR #22 — drop the conflicting railway.json `startCommand` override
- PR #24 — slim the runtime image (was COPYing 260MB of workspace
  node_modules into the container, suspected OOM-kill on hobby tier)

Neither caused the bundle hash to rotate. The Railway CLI returns
"Deployment not found" when queried by the IDs that the active list
shows as SUCCESS. Looks like an upstream Railway issue.

**How:**
1. Open Railway dashboard → web service → Deployments tab
2. Look for any deploy in `Deploying` or `Crashed` state since 19:42
3. If you see crashed deploys: click for the runtime log, that'll tell
   us what's actually killing the container
4. If everything looks SUCCESS but the bundle still doesn't rotate:
   raise a Railway support ticket with the project ID + a screenshot

Alternatively: pin a known-good image by tagging today's main commit
as `release/aplus-w1` and configuring Railway to deploy from that tag
explicitly rather than auto-deploy-on-push.

---

## P1 — feature unblockers

### 3. Pick a transcription provider

**Why:** Today every user-test session shows `(transcription provider
not configured)` in the result frame. The pluggable interface is wired
(`apps/server/src/transcription/`), it just needs a real provider.

**Recommended:** Deepgram (cheapest + best-in-class for short voice
clips; $0.0043/min nova-2 model; free $200 credit on signup).
Alternative: AssemblyAI (similar price, slower API).

**How:**
1. `https://console.deepgram.com/signup`
2. Create a project → "Foldo prod"
3. Copy the API key
4. `railway variables set DEEPGRAM_API_KEY=<key>` on the `server`
   service
5. Wire `apps/server/src/transcription/deepgram.ts` — exists as a stub
   per the task description, swap the stub call for the real
   `@deepgram/sdk` `transcribeUrl()` and return the transcript text
6. Add a CI smoke that uploads a known short clip and asserts
   non-stub transcript text

**Done when:** running a user-test → finishing recording → the summary
frame shows real transcribed text within 30s.

---

### 4. Configure backup secrets

**Why:** PR #19 landed the weekly pg_dump → S3 GitHub Action
(`.github/workflows/backup-pg.yml`), but the workflow refuses to run
until the secrets exist.

**How:** in `https://github.com/lukataylo/foldo/settings/secrets/actions`,
add these repository secrets:

| Secret | Value |
|---|---|
| `DATABASE_URL` | The connection string from the Railway Postgres plugin |
| `AWS_ACCESS_KEY_ID` | IAM user with the policy from `docs/DEPLOYMENT.md` §7.1 |
| `AWS_SECRET_ACCESS_KEY` | Matching secret |
| `AWS_REGION` | e.g. `eu-west-2` |
| `FOLDO_BACKUP_BUCKET` | The S3 bucket name (create it first) |
| `FOLDO_PROD_SMOKE_TOKEN` | Mint via the Foldo settings UI after first deploy |

Then manually trigger `.github/workflows/backup-pg.yml` via
`Actions → Backup Postgres → Run workflow` to verify it works once,
before relying on the weekly cron.

**Done when:** the manual run uploads a dump to S3 and a verification
issue is NOT opened.

---

### 5. Configure log shipping

**Why:** Pino emits structured JSON logs but they only live in
Railway's 7-day-retention log viewer. Investigating incidents > 7 days
old becomes impossible.

**How:** pick ONE:
- **Grafana Cloud Loki** (free tier: 50GB/month, 14-day retention).
  https://grafana.com/auth/sign-up → create a Loki data source → copy
  the push URL + tenant ID + API key → Railway → web/server services
  → add log drain at `https://logs-prod-…/loki/api/v1/push` with HTTP
  basic auth.
- **Datadog** (free tier: 5GB/day, 7-day retention). Same shape; URL
  pattern in `docs/DEPLOYMENT.md` §8.1.

**Done when:** logs from a `curl https://foldo.dev/health` appear in
the new log destination within 30s, and a Grafana/Datadog dashboard
shows requests-per-second + error rate.

---

### 6. Wire Railway post-deploy webhook → GitHub repository_dispatch

**Why:** PR #19 landed `.github/workflows/post-deploy-smoke.yml` that
re-runs the prod-smoke Playwright spec on every Railway deploy. It
won't fire until Railway is told to dispatch on deploy completion.

**How:** documented in `docs/DEPLOYMENT.md` §6.2 — needs a personal
access token with `repo` scope, then Railway → Settings → Webhooks
→ point at the GH API endpoint.

**Done when:** pushing a no-op commit triggers a green
`post-deploy-smoke` run on the next Railway deploy.

---

## P2 — billing readiness

### 7. Stripe wiring for the Pricing page

**Why:** the /pricing marketing page exists but Upgrade buttons are
currently gated with "Coming soon" pills (PR W2 #68). Real
subscription flow needs a Stripe account + product/price IDs +
webhook secret.

**How:**
1. Stripe account → create products: "Foldo Free" ($0), "Foldo Pro"
   ($X/mo), "Foldo Team" ($Y/seat/mo)
2. Copy each product's price ID (`price_…`)
3. Create a webhook endpoint: `POST https://api.foldo.dev/api/billing/webhook`
   subscribing to `customer.subscription.{created,updated,deleted}`
4. `railway variables set` STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET,
   STRIPE_PRICE_FREE, STRIPE_PRICE_PRO, STRIPE_PRICE_TEAM on `server`
5. New PR wires the Checkout Session creation route + webhook handler

**Done when:** clicking "Upgrade to Pro" on /pricing redirects to a
real Stripe checkout, payment goes through, server marks the user as
on the Pro tier, subscription cancellation flows back via webhook.

---

## Checklist

- [ ] Resend key rotated
- [ ] Railway deploy promotion debugged + working
- [ ] Deepgram (or alternative) wired
- [ ] Backup secrets set + manual run succeeded
- [ ] Log drain wired + verified
- [ ] Post-deploy webhook wired + verified
- [ ] Stripe account + price IDs ready (just for when we wire it)
