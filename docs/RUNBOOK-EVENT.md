# Foldo event runbook: keep it up, and what to do when it isn't

Audience: the 2-3 organizers on call. Read sections 1-3 before doors open; keep section 4 open all night.

## 0. What we measured (so you know what "normal" looks like)

Tested 2026-10-07 against a production-mode build (same code and Dockerfile as Railway).

| Test | Result |
|---|---|
| 50 teams, 3 long builds each (150 streams, ~18 KB replies), plus template and 58 MB-unpacked packages downloads, stubbed AI | 50/50 succeeded, `/healthz` max 10 ms, server memory 101 -> 255 MB |
| 25 teams building at once on the real DeepSeek V4 Pro via OpenRouter | 25/25 succeeded. With throughput routing: first text p50 5 s, p95 21 s; full reply p50 16 s, p95 68 s. About $0.018 per reply |
| `kill -9` during 30 teams' builds, then restart | Back in 0.6 s locally (Railway: expect 15-60 s). Database intact (integrity ok, all users and sessions kept). Builds in flight at that moment were cut off; teams press send again |
| Restore a backup by environment variable | Works; never restores twice; keeps the damaged DB as `f.db.before-restore` |

Our server is not the bottleneck. The things that can actually hurt the night, in order: **the AI provider's tail latency or outage, the venue Wi-Fi, OpenRouter credit running out, a bad deploy.**

## 1. Before doors open

- [ ] `railway deployment list --service web` shows the newest deployment SUCCESS; `https://foldo.dev/healthz` returns `ok` (header `X-Foldo-Backups: on`).
- [ ] Railway variables on `web` (see below) are set. **Do not deploy during the event** unless fixing an outage (section 4).
- [ ] `/admin`: model Test button passes for the main model and the reserve; fallback is set; per-team limit, global cap, invite code, event name/end time are set.
- [ ] `/admin/templates`: both packs show "Snapshot ready" (they ship in the image, so this should already be true).
- [ ] OpenRouter: key credit is comfortably above expected spend (about $0.02 per build; 25 teams x 60 builds = about $30). **The key has a hard limit; raise it.**
- [ ] OpenRouter guardrail: allow `deepseek/deepseek-v4-flash` (fast, cheap) so the fallback is faster than the slow main-model tail. Today only V4 Pro and GPT-6.1 Sol are allowed, and Sol (the current fallback) takes ~140 s per reply.
- [ ] Create a monitor account (`monitor@...`) and start the monitor on **two** laptops (section 3).
- [ ] Run the load test from the venue Wi-Fi once: `node scripts/load-test.mjs --url https://foldo.dev --accounts accounts.txt --users 20 --messages 1 --download` (create the accounts first; sign-up is throttled per IP).
- [ ] Download a database backup from `/admin` (belt and braces: it also leaves the Railway volume).
- [ ] Tell teams: **Download zip** in the workbench every 30 minutes. It is their copy if everything goes wrong.
- [ ] Pin this runbook and the status channel link.

Recommended `web` variables (all are in the README / `.env.example`):

```
MAX_CONCURRENT_STREAMS=80      # default 40 is too low for 25 teams x 2 builds
FIRST_TOKEN_TIMEOUT_MS=60000   # wait longer before failing over to the (slower) reserve
BACKUP_INTERVAL_MIN=10 BACKUP_KEEP=36   # automatic backups: every 10 min, last 6 hours
OPENROUTER_SORT=throughput     # on by default; fastest provider first
REASONING_EFFORT=low  LLM_MAX_TOKENS=32000
DAILY_MESSAGE_LIMIT=80  GLOBAL_DAILY_LIMIT=2500
```

## 2. Roles

- **Incident lead** (one person): decides, posts updates, nobody else changes production.
- **Operator**: runs the commands below.
- **Floor lead**: talks to teams, collects symptoms (screenshots, team name, time).

Post a status message within **5 minutes** of any problem, even if it is "we are looking": use the templates in section 5.

## 3. What to watch

1. **Monitor script** (terminal bell + optional Slack webhook on any state change):
   `node scripts/monitor.mjs --url https://foldo.dev --login monitor@example.com:PASSWORD --chat-every 5 --webhook <slack url>`
   It checks `/healthz`, the home page, the template catalogue and packages file, a real sign-in, and one real AI build every 5 minutes.
2. **`/admin` Live panel** (refreshes every 10 s): builds running, requests per minute, failovers, errors per model, top teams, estimated spend, backups.
3. **Railway dashboard -> web -> Metrics / Logs**: memory (normal 100-300 MB), restarts. Logs contain one JSON line per AI request (`"evt":"chat"`, with `failover` and `ms`).
4. **OpenRouter -> Activity**: credit remaining, errors, per-provider latency.

Rules of thumb: first text slower than 30 s for several teams, or failovers climbing = provider trouble (4.2). `/healthz` slow or failing = our service (4.1).

## 4. Incident playbooks

Target: acknowledge in 2 min, mitigate in 10, full recovery or Plan C in 30.

### 4.1 Site down, 502/503, or `/healthz` failing

1. `railway deployment list --service web | head -4` and Railway dashboard: crashed, building, or healthy?
2. Restart without rebuilding: `railway restart --service web` (about 30 s). The policy is already *always restart*, so a crash loop recovers by itself; a loop that keeps failing means a bad deploy or full disk (below).
3. Bad deploy (started right after a push)? Dashboard -> web -> Deployments -> the previous SUCCESS one -> **Redeploy/Rollback**. If you must go through git: `git revert <bad sha> && git push origin main` (about 3 minutes). Freeze all other changes.
4. Disk full? Dashboard -> web -> Volume usage. Backups are small, but lower `BACKUP_KEEP` and redeploy, or delete old files in `/data/backups` via `railway ssh`.
5. Still down after 15 minutes: **Plan C** (4.7).

Teams keep what is already in their browser: running previews and the editor still work, only saving and the AI are affected. Their work saves automatically once we are back (the "Reconnecting" indicator beside the project name).

### 4.2 AI slow, erroring, or one model down

1. `/admin` -> Live: look at "Errors by model" and "Answered by".
2. Main model failing, reserve working: nothing to do, failover is automatic (a request whose first words take over 60 s moves to the reserve).
3. Both slow or failing: **Emergency controls -> Pause new requests** with a message ("The AI provider is having trouble. Your projects are safe. Back soon."), post status, then switch the default model in the model cards (any provider whose key is set; OpenAI direct, DeepSeek direct, etc.), press **Test**, unpause.
4. Spread the load: lower **Reasoning effort** to `minimal`, or **Builds at once per login** to 1.
5. OpenRouter says credit exhausted / 402: top up and raise the key limit. Until then pause.

### 4.3 Data lost, corrupted, or wrong (accounts or projects missing)

1. Pause new requests. Do not keep serving on a damaged database.
2. `/admin` -> Backups: pick the newest good file (names carry the UTC time).
3. Railway -> web -> Variables: set `RESTORE_BACKUP=<file name>` and redeploy (or `railway redeploy`). Watch logs for `[restore] database restored from ...`. The damaged DB is kept as `foldo.db.before-restore` on the volume.
4. **Remove `RESTORE_BACKUP`** afterwards (a marker file already stops repeats, but keep the config clean), unpause.
5. You lose at most 10 minutes of saves; teams with the "Saved" indicator in their browser re-save automatically on their next message, and everyone has their zip.

### 4.4 Previews will not start for anyone (WebContainer / StackBlitz problem)

Symptoms: "Setting up" never finishes, white preview, console errors from `stackblitz.com`. Cause is outside our control (StackBlitz outage, or licence/origin rejection).

1. Check <https://status.stackblitz.com> and open `https://foldo.dev` in a private window.
2. Teams can keep editing code and chatting; the AI still works. Tell them to **Download zip** and run it locally: `npm install && npm run dev` (Node 20+).
3. If it is a licence/origin block, you cannot fix it live: Plan C.

### 4.5 Venue Wi-Fi is saturated (pages hang, packages download crawls)

- Each device downloads the packages once (14 MB core, 33 MB Carbon, cached afterwards). Ask teams to **not** open many tabs/templates at once.
- Ask 5 teams at a time to start (stagger), or put the organizer hotspot / wired laptop on `https://foldo.dev` first: it does not warm other devices, but proves whether it is Wi-Fi or us (compare with the monitor on a different network).
- Pause the AI from the admin if everyone is retrying; retries make congestion worse.

### 4.6 Abuse or runaway spend

- `/admin` -> Teams: **Disable** the account (its sessions end immediately); lower the per-team and global caps; the global daily cap already stops all AI spend when reached.
- Forgotten password: **Reset password** gives a one-time temporary password.

### 4.7 Plan C: Foldo is gone and not coming back in time

1. Floor lead: announce, with the template of section 5.
2. Teams continue from their **zip** (30-minute habit) locally, or from a fresh machine: `npm create vite@latest`, paste the files.
3. Submissions need only a title, description, members, and a Loom/YouTube video: nothing in Foldo is required to submit.
4. After the event: restore the database from the latest backup into a new service and re-share links. Share links (`/p/...`) work again as soon as the database is back.

## 5. Message templates

- *Acknowledge (within 5 min)*: "We know Foldo is having trouble ([saving / building / loading]). Your projects are safe. Next update in 10 minutes."
- *Mitigation*: "Fixed for most teams. If the build button still errors, wait 10 s and press send again. Still stuck? Tell the floor lead your team name."
- *Plan C*: "Foldo is down for now. Please press **Download zip** in the workbench if you still can, or keep working from your last zip. Submissions do not depend on Foldo."
- *All clear*: "Foldo is back. Nothing was lost beyond the last few minutes. Thanks for your patience."

## 6. After the event

Download a last backup, export `/admin` numbers (spend, top teams), note timings of any incident, and delete the monitor account.
