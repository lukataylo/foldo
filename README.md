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
