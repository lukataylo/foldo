# Foldo

Vibe-coding platform for hackathons: a team describes an app, an LLM writes it, and it runs live in the browser
([WebContainers](https://webcontainers.io)). Accounts, saved projects, public share links, a gallery with likes,
and an organizer console. Based on [bolt.new](https://github.com/stackblitz/bolt.new) (MIT), ported to Node.

## Run locally (Node >= 22.13)

    cp .env.example .env     # add at least one model key; npm scripts load .env
    npm install && npm run dev
    npm run build && npm start      # production mode, port $PORT (default 3000)

## Deploy to Railway

1. New service from this repo (Dockerfile via `railway.json`, health check `/healthz`).
2. Add a **Volume** at `/data`. SQLite lives there, so run exactly **one instance**.
3. Set `APP_SECRET`, `ADMIN_EMAILS`, `DB_PATH=/data/foldo.db`, and one model key (or add keys later in `/admin`).
4. Sign up with an `ADMIN_EMAILS` address, open `/admin`.

## Running a hackathon

Everything is in **/admin**: paste provider keys (OpenRouter, DeepSeek, OpenAI, Xiaomi MiMo, Qwen, Kimi, GLM, MiniMax, or any
OpenAI-compatible endpoint), press **Test**, pick the default, set an invite code, event name + countdown, an
announcement banner, per-team and global daily message caps, and manage teams (disable, reset password) and the gallery.
The base URLs and model ids for the Chinese providers are defaults to verify against each provider's docs; edit them in
the admin card if they differ. Teams can pick between enabled models in the prompt box.

Safeguards: per-team daily quota, a global daily cap, one generation at a time per team, conversation size caps, failed
generations are refunded, login/sign-up/invite-code throttling, Origin checks on writes, encrypted provider keys.

## Event-night controls (/admin)

- **Live:** builds running, requests per minute, failovers, errors and answers per model, top teams, estimated spend.
- **Emergency pause:** one switch plus a message teams see; running builds finish, saved work is untouched.
- **Reply length / failover / concurrency:** default max tokens, continuations, builds per login (teams share logins, default 2),
  and a fallback model that is tried once if the main model fails to start (charged once). Set a per-model max tokens in each
  model card (DeepSeek and GLM cap near 16k).
- **Database backup:** one-click download of a consistent SQLite snapshot.
- Teams get **Download zip** in the workbench and a **Fix this error** button on failed commands, compile errors and preview crashes.
  An error right after a build is fixed automatically once (never for a reply that was itself a fix).

Tip: to use OpenRouter for both main and fallback, put the main model in the OpenRouter card and a second OpenRouter model
(different id) in the Custom card with the same base URL and key, then choose Custom as the fallback.

## Templates (finance starters)

Teams start from a ready, running app instead of waiting for an AI build and an `npm install`:

| Track | Template |
|---|---|
| Payments | Checkout & payment links (Stripe-style), Cross-border transfers |
| Access to Finance | Fair micro-loans, Budget & savings coach |
| Fraud and Security | Scam message checker, Fraud monitoring console (IBM Carbon) |
| Any | Blank finance kit, Blank IBM Carbon kit |

All use shadcn/ui-style components (Vercel ecosystem), Radix, Tailwind 3, Recharts, Lucide, Sonner, Zod, Framer Motion and
the Stripe JS packages (core pack), or IBM Carbon (carbon pack). Sources live in `templates/` (a shared `packs/<pack>` base
plus a small overlay per template); `npm run templates` bundles them into `public/templates/` and `npm run test:templates`
installs each pack and `vite build`s every template.

**How the network stays free on the night.** A template never runs `npm install` in the team's browser. The pack's
`node_modules` (with Vite's pre-bundle cache) is built once into a snapshot (~14 MB for core, ~33 MB for carbon, gzip),
served by Foldo from `/snapshots/<pack>-<hash>.snap` with an immutable cache header and mounted into the WebContainer
(2 to 3 s to a live preview locally once downloaded). The browser downloads each file once; the home page also prefetches the core one at a
random moment in the first two minutes so a room never hits the network together. In template mode the AI edits files in
the project instead of regenerating it, which also makes replies shorter and cheaper (a template chat costs nothing until
the first change request).

**Building the snapshots (once, before the event):** sign in as an admin, open **/admin/templates**, press **Build
snapshot** on each pack from a fast connection (about 2-3 minutes each; the page installs the packages inside a
WebContainer, warms Vite, packs and uploads). They are stored on the volume at `/data/snapshots`. To ship them in the Docker
image instead (no admin step on a fresh deploy), copy the two `*.snap.gz` files into `templates/snapshots/` and commit; a
snapshot on the volume wins over the bundled one. Changing `packs/*/package.json` or `vite.config.js` changes the hash, so
rebuild after dependency changes. Without a snapshot everything still works: the template falls back to a normal install.

## Models for the event (researched on OpenRouter, 2026-10-07)

| Role | Model id | Notes |
|---|---|---|
| Main (default harness) | `deepseek/deepseek-v4-pro-0813` | GA slug of DeepSeek V4 Pro with an 8k-token thinking budget (high). ~10s to first text and 30-40s for a new app with 40 teams building; about $0.03 per reply. |
| Main (Sol harness) | `openai/gpt-6.1-sol` | About 3-8s to first text; 60-200s for a full new app (25-70k characters), 15-75s for a change. About $0.10 per reply. |

Each harness uses the other model as its reserve (failover only, hidden from the team picker).

The OpenRouter workspace guardrail on this account allows only those two models; anything else (including the undated
`deepseek/deepseek-v4-pro` alias) returns "blocked by guardrail". Set via env: `LLM_PROVIDER=openrouter` (its default model
follows the harness), `CUSTOM_API_KEY`, `CUSTOM_BASE_URL=https://openrouter.ai/api/v1`, `CUSTOM_MODEL=openai/gpt-6.1-sol`,
`FALLBACK_PROVIDER=custom`, `REASONING_EFFORT=low`, `LLM_MAX_TOKENS=32000`. A model saved in the /admin card overrides the
default. If the main model says nothing for `FIRST_TOKEN_TIMEOUT_MS` (default 40s) the request is retried once on the reserve.

**Harness (in /admin):** pick *GPT-6.1 Sol* (Sol main, DeepSeek reserve, low reasoning, extra prompt rules for Sol's
habits) or *DeepSeek V4 Pro* (DeepSeek main with high reasoning and a 120s first-token allowance, Sol reserve). Applying one
sets the OpenRouter/Custom model cards, default and fallback. The default is DeepSeek V4 Pro; `FOLDO_HARNESS=sol|deepseek` changes the starting choice. A key
field (or `OPENROUTER_API_KEY`) can hold several comma-separated keys, used in turn; only keys from different OpenRouter
accounts add rate limit and credit.

Before an event with GPT-6.1 Sol as main: OpenRouter caps new accounts at 20 requests per minute for this model (the 21st
gets a rate-limit error), and it rejects requests when the balance cannot cover every in-flight request at its max tokens.
Lift the account tier and top up credits first, or many teams building at once will see "The AI is having a moment".

## Reliability: backups, monitoring, runbook

- **Automatic backups** of the SQLite database to `/data/backups` every `BACKUP_INTERVAL_MIN` (default 10) minutes, newest
  `BACKUP_KEEP` (default 36) kept; list, download and "back up now" in `/admin`. **Restore** by setting
  `RESTORE_BACKUP=<file name>` on Railway and redeploying (a marker stops repeat restores).
- **Restart policy** is *always* (`railway.json`), health check `/healthz`.
- Teams' saves retry through a server restart, with a "Saved / Reconnecting / Not saved" indicator.
- `node scripts/monitor.mjs --url https://foldo.dev --login monitor@x:pw --webhook <slack>` watches the site, the packages file,
  sign-in and a real AI build, and alerts on any change.
- **`docs/RUNBOOK-EVENT.md`**: stress-test results, pre-event checklist, roles, incident playbooks (site down, AI trouble, data
  loss, WebContainer outage, Wi-Fi saturation, abuse) and message templates.

## Load test

    node scripts/stub-llm.mjs &                                   # fake model, no tokens
    LLM_BASE_URL=http://localhost:9999/v1 DEEPSEEK_API_KEY=x DAILY_MESSAGE_LIMIT=100 npm start &
    node scripts/load-test.mjs --url http://localhost:3000 --users 25 --messages 3 --download --expect-artifact

Against a real provider drop the stub and `LLM_BASE_URL`. Behind Railway's proxy sign-ups are throttled per real IP, so create
logins first and pass `--accounts file.txt` (one `email:password` per line).

## Test

    npm run build && npm run test:e2e

Boots the server against a fake LLM and plays adversarial personas (anonymous attacker, malicious teammate, cost abuser,
brute-forcer, organizer, account owner, 30-team burst). No tokens are spent.

## Known limits

- **WebContainers need a commercial licence from StackBlitz for production use** (<https://webcontainers.io/enterprise>).
- Single instance (SQLite, in-memory throttles). A burst of ~90 simultaneous page loads takes a few seconds (SSR is
  single-threaded); steady load is fine. Move to Postgres + multiple instances if you need more.
- No email verification or self-serve password reset (organizers reset passwords in /admin).
- A shared project runs the author's generated code in the viewer's browser sandbox; only list projects you moderate.
- Desktop-first; WebContainers don't run on most mobile browsers.

## Brand and art

Tokens: `uno.config.ts` and `app/styles/variables.scss` (dark default, light "Paper"). Artwork in `public/art/` comes from
`npm run art` (OpenAI `gpt-image-1`, edits of the original Foldo renders).
