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
- Teams get **Download zip** in the workbench and a **Fix this error** button on failed commands and preview crashes.

Tip: to use OpenRouter for both main and fallback, put the main model in the OpenRouter card and a second OpenRouter model
(different id) in the Custom card with the same base URL and key, then choose Custom as the fallback.

## Models for the event (researched on OpenRouter, 2026-10-07)

| Role | Model id | Notes |
|---|---|---|
| Main | `deepseek/deepseek-v4-pro-0813` | GA slug of DeepSeek V4 Pro. About 3s to first text and 15-30s per reply at low reasoning; roughly $0.02 per reply. |
| Reserve | `openai/gpt-6.1-sol` | About 5s to first text but 140s+ per reply and roughly $0.10 per reply, so it is failover only (hidden from the team picker). |

The OpenRouter workspace guardrail on this account allows only those two models; anything else (including the undated
`deepseek/deepseek-v4-pro` alias) returns "blocked by guardrail". Set via env: `CUSTOM_API_KEY`, `CUSTOM_BASE_URL=https://openrouter.ai/api/v1`,
`CUSTOM_MODEL=openai/gpt-6.1-sol`, `FALLBACK_PROVIDER=custom`, `REASONING_EFFORT=low`, `LLM_MAX_TOKENS=32000`. If the main model says nothing for
`FIRST_TOKEN_TIMEOUT_MS` (default 40s) the request is retried once on the reserve.

## Load test

    node scripts/stub-llm.mjs &                                   # fake model, no tokens
    LLM_BASE_URL=http://localhost:9999/v1 DEEPSEEK_API_KEY=x DAILY_MESSAGE_LIMIT=100 npm start &
    node scripts/load-test.mjs --url http://localhost:3000 --users 25 --expect-artifact

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
