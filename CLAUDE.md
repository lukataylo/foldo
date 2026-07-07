# CLAUDE.md — Foldo onboarding

> If you are a new engineer (or a new agent) reading this for the first
> time: this is the doc to read first. Get through it once, and you'll
> know roughly where every system lives, which files to open for any
> given change, and what conventions to follow so your patch matches the
> rest of the tree.

## 30-second pitch

Foldo is **living documentation for agent-built software**. Teams whose
coding agents merge PRs weekly point Foldo at a repo (GitHub App) and a
deployed preview URL; every merged PR triggers the **director**, which
re-films a narrated video walkthrough of the product — re-rendering only
the steps the diff touched, reusing the rest **byte-for-byte** — and lands
it on a board beside its predecessor. Stakeholders who will never clone
the repo watch what changed; a comment on a walkthrough frame can be
dispatched as a change request to the coding agent, closing the loop.

Three product surfaces, deliberately few:

1. **The board as a viewer** — frames (walkthroughs, live app previews,
   markdown docs), pan/zoom, share links (`/s/:token`, no auth).
2. **Comments** — pinned threads on frames, resolve/reply.
3. **The dispatch loop** — "Make this an edit" turns a comment into an
   agent dispatch, streamed back over WS to a result frame.

£79/month per product, 14-day trial, Stripe checkout on `/pricing`.
The pre-pivot platform surfaces (multiplayer cursors/presence, user-test
recording, the plugin substrate, the capture extension) were **removed**
in the 2026-07 living-docs pivot — see §8.

## 1. Monorepo layout

```
/
├── apps/
│   ├── web/         Vite + React board viewer + marketing site (5173)
│   ├── server/      Fastify + Postgres (4000) — source of truth + the director
│   ├── mcp/         MCP server (stdio + WS bridge) — Claude Code's tools
│   └── sample-app/  Vite app (5174) — demo target the seeded walkthrough films
├── packages/
│   └── protocol/    Shared types: domain, REST, WS, MCP. Single source of truth.
├── docs/            Architecture, deployment, protocol, emails, runbooks
├── e2e/             Playwright tests (incl. the merge→walkthrough→dispatch path)
└── scripts/         dev orchestrator, bundle-size gate, render-foldo-demo.mjs
```

npm workspaces; Node 20+; TypeScript 5.6; React 18; Fastify 5; Vite 5.
The DB is Postgres-only (`pg`), local dev included.

## 2. The director (the core engine)

Ported from the Foley project (Python → TS), it lives in
`apps/server/src/director/`:

| Module        | Job                                                              |
| ------------- | ---------------------------------------------------------------- |
| `models.ts`   | Step fingerprints (sha256 of id+narration+actions+duration) — the content-addressing everything hangs off |
| `verdict.ts`  | Merged-PR diff → per-step `unchanged/changed/added/removed`. LLM (`ANTHROPIC_API_KEY`) with a deterministic heuristic fallback (diff text vs the step's visible-text anchors) |
| `capture.ts`  | Grounded Playwright filming. Text locators ONLY (`getByText`/`getByLabel`) — never CSS/XPath. Per-action failures are warnings, not aborts; every step always tries a final-frame PNG still; auth recipes run once per take |
| `narrator.ts` | ElevenLabs TTS, hash-cached (identical text+voice → identical bytes). No key → silent segments + captions |
| `captions.ts` | WebVTT, one cue per step — the degradation floor |
| `assemble.ts` | Segments muxed with **pinned** encode args; unchanged steps copied byte-for-byte from the parent take; master is concat `-c copy` (never re-encoded) |
| `service.ts`  | Orchestration: take row + frame land immediately (status `queued`), then capturing → rendering → ready/degraded/error, broadcast live via `frame.updated` |
| `github.ts`   | PR diff fetch (GitHub API; `FOLDO_GITHUB_TOKEN` for private repos) |

**The reliability ladder** (worst case at each rung, never a dead take):
full video+narration → silent video+captions (no ElevenLabs key) →
stills-as-video segments (per-step capture failure) → poster+captions only
(no ffmpeg). `degradedStepIds` on the frame tells the viewer which steps
are stills.

**Byte-identity invariant:** `ENCODE_ARGS` in `ffmpeg.ts` are pinned.
Change them and every cached segment invalidates silently — don't, without
a migration plan. The unit test in
`director/__tests__/director-core.test.ts` proves reuse produces
byte-identical segments; the e2e in `e2e/walkthrough/` proves it through
the full HTTP + storage path.

Triggers: `POST /api/webhooks/github` with `pull_request` (action=closed,
merged=true) → one take per walkthrough on the repo's board; or manual
`POST /api/walkthroughs/:id/takes` (first render, retries, the Docs modal's
"Render now").

## 3. Data flow at a glance

```
GitHub (PR merged) ──► /api/webhooks/github ──► director/service.ts
                                                   │ capture (chromium)
Browser tab                                        │ narrate (ElevenLabs)
┌─────────────┐   REST   ┌────────────┐            │ assemble (ffmpeg)
│ App.tsx     │ ───────► │ apps/server│ ◄──────────┘
│ (board)     │ ◄─── WS ─│ /api /ws   │──► Storage (walkthroughs/<takeId>/…)
└──┬──────────┘          └──────┬─────┘
   │ optimistic                 │ Postgres
   ▼                            ▼
BoardStore (Maps)          walkthroughs / walkthrough_takes / frames /
                           comments / dispatches / subscriptions /
                           analytics_events
                                ▲
                          ┌──────────┐
                          │ apps/mcp │ /ws/mcp — dispatch.execute → agent
                          └──────────┘
```

- `apps/web/src/state/BoardStore.ts` — single source of truth for the open
  board: Maps for `frames`, `comments`, `branches`, `users`, `dispatches`.
- `apps/web/src/state/reducers.ts` — the ONLY thing that mutates the store
  from WS messages (exhaustive switch; adding a `ServerMessage` type forces
  a reducer branch).
- Optimistic updates: `api/*.ts` patch the store first, REST second,
  server broadcast reconciles, rollback on failure (copy
  `api/comments.ts`).
- WS reconnect = full rehydrate of `GET /api/boards/:id`. No client-only
  state in BoardStore.
- Protocol version is `2.0.0` (presence + test messages removed; major
  bump = hard refusal across a mismatch).

## 4. Walkthrough domain model

In `packages/protocol` (wire truth — never define shapes locally):

- **Walkthrough** — board-scoped spec: `targetUrl`, `steps[]`, optional
  `authActions` (login recipe). Steps: `{id, title, narration, actions[],
  durationMs}`; actions are visible-text grounded
  (`goto/click/fill/hover/press/scroll/wait`).
- **Take** — one rendering: `stepDiffs[]` (the verdict), `segments[]`
  (`reused | rebuilt | still` + `segmentSha256`), `masterSha256`,
  video/poster/captions URLs, `status`.
- **WalkthroughFrameContent** — what the board renders
  (`components/WalkthroughFrame.tsx`): video + "what changed" list.

The walkthrough spec advances to the filmed steps after every successful
take, so the next PR diffs against reality.

## 5. Naming conventions

`data-testid`: `foldo-{area}-{element}-{noun}` (kebab-cased) — e.g.
`foldo-canvas-frame`, `foldo-walkthrough-video`, `foldo-comment-make-edit`,
`foldo-pricing-checkout`. Playwright reaches the DOM by these — search
`e2e/` before renaming one.

REST route families (one file per family in `apps/server/src/routes/`,
mirrored in `apps/web/src/api/`): boards, frames, comments, dispatches,
walkthroughs, billing, auth, me, home, shares, sources, uploads,
recordings, webhooks, demoRequests.

URLs: `/` marketing landing · `/pricing` · `/security` · `/data-policy` ·
`/board/:id[/frame/:fid[/comment/:cid]]` deep links · `/home` ·
`/settings/*` · `/s/:token` public share (`/s/demo` is the seeded
prospect demo).

## 6. Where to look for what

| Change…                              | Open…                                              |
| ------------------------------------ | -------------------------------------------------- |
| The director pipeline                | `apps/server/src/director/`                        |
| Walkthrough REST + video serving     | `apps/server/src/routes/walkthroughs.ts`           |
| PR-merge trigger                     | `apps/server/src/routes/webhooks.ts`               |
| Walkthrough frame on the board       | `apps/web/src/components/WalkthroughFrame.tsx`     |
| Create/render walkthrough UI         | `apps/web/src/components/WalkthroughsModal.tsx`    |
| The board itself                     | `apps/web/src/App.tsx`                             |
| Tool rail (select/hand/comment/edit) | `apps/web/src/components/LeftRail.tsx` (hardcoded) |
| Comments + pin UX                    | `apps/web/src/components/Comment*.tsx`, `hooks/useCommentHandlers.ts` |
| Dispatch loop (client)               | `hooks/useDispatchFlow.ts`, `components/EditPanel.tsx` |
| Dispatch loop (server/agent)         | `routes/dispatches.ts`, `ws/mcp.ts`, `apps/mcp/`   |
| Billing (Stripe, SDK-free)           | `apps/server/src/routes/billing.ts`, `apps/web/src/api/billing.ts` |
| Funnel analytics (6 events)          | `apps/server/src/repo/analytics.ts` + emit points in routes |
| Onboarding emails                    | `apps/server/src/email/templates.ts`, `lifecycle.ts`, `docs/EMAILS.md` |
| Marketing pages                      | `apps/web/src/marketing/`                          |
| Auth / sessions                      | `apps/server/src/auth.ts`, `routes/auth.ts`        |
| Storage (S3/local, Range serving)    | `apps/server/src/storage/`, `routes/recordings.ts` |
| Wire types                           | `packages/protocol/src/*.ts`                       |
| Demo seed (`/s/demo`)                | `apps/server/src/seed.ts`                          |
| Foldo-of-Foldo demo video            | `scripts/render-foldo-demo.mjs`                    |
| Sales script + objections            | `SALES.md`                                         |

## 7. Environment knobs

| Env                        | Effect                                                    |
| -------------------------- | --------------------------------------------------------- |
| `DATABASE_URL`             | Required — Postgres                                       |
| `ANTHROPIC_API_KEY`        | LLM verdicts + proposed step rewrites (else heuristic)    |
| `ELEVENLABS_API_KEY`       | Narration audio (else silent + captions)                  |
| `FOLDO_GITHUB_TOKEN`       | PR diff fetch for private repos                           |
| `FOLDO_GITHUB_WEBHOOK_SECRET` | HMAC verify on `/api/webhooks/github` (unset = dev bypass) |
| `STRIPE_SECRET_KEY` / `STRIPE_PRICE_ID` / `STRIPE_WEBHOOK_SECRET` | Checkout + billing webhook (unset = 503 BILLING_UNCONFIGURED) |
| `FOLDO_S3_BUCKET` (+ `FOLDO_S3_*`) | Object storage (else local disk `FOLDO_STORAGE_DIR`) |
| `FOLDO_CHROMIUM_PATH`      | Explicit chromium binary for capture + e2e (hosts with pre-provisioned browsers) |
| `FOLDO_DIRECTOR_SIM=1`     | Force the heuristic verdict even with an API key           |
| `REDIS_URL`                | Redis-backed WS hub (multi-replica)                        |

## 8. What was cut (2026-07 pivot) — don't re-add casually

- **Presence/multiplayer**: cursors, selection ghosts, follow-me,
  `presence.*` WS messages. The WS hub, seq/replay buffer, and
  `mcp.online` remain (they carry frames/comments/dispatches).
- **User Tests**: tester runtime, recording, transcription, synthesis,
  `tests/test_*` tables (orphaned in pre-pivot DBs, not dropped).
- **Plugin substrate**: `packages/plugin` and all `window.__foldo*`
  escape hatches. Tools are hardcoded in `LeftRail.tsx`; hotkeys in
  `useKeyboardShortcuts.ts`.
- **Chrome extension + shotter + captures route**.
- Sticky/arrow/image *authoring* (renderers kept for old boards).

## 9. CI gates

`.github/workflows/ci.yml`: `typecheck`, `unit` (vitest), `e2e`
(Playwright + Postgres service; includes the walkthrough render path —
chromium + ffmpeg are present on the runner), `format` (prettier),
`audit`, `secrets` (gitleaks), `bundle-size`. All must pass. Local
pre-flight:

```bash
npm run typecheck
npx vitest run
npm --workspace @foldo/web run build
DATABASE_URL=… npx playwright test        # needs Postgres + `npm run dev`
npx prettier --check "**/*.{ts,tsx,js,mjs,json,md,yml,yaml}" \
  --ignore-path .gitignore --ignore-path .prettierignore
```

DB-gated unit suites skip without `DATABASE_URL` (see the `describe.skip`
pattern in `apps/server/src/__tests__/`).

## 10. Run it locally

```bash
npm install
npm run dev     # web 5173 · server 4000 · sample-app 5174 (needs DATABASE_URL)
```

Open http://localhost:5173/board/board-acme-landing — seeded board with a
ready-to-render walkthrough (`w-demo-acme`, films the sample app). Public
share: http://localhost:5173/s/demo. Render a take: the Docs button on the
board, or

```bash
curl -X POST localhost:4000/api/walkthroughs/w-demo-acme/takes \
  -H 'Authorization: Bearer demo-user' -H 'Content-Type: application/json' -d '{}'
```

`ffmpeg` must be on PATH for video (else the take degrades to stills +
captions — by design). Produce the marketing demo with
`node scripts/render-foldo-demo.mjs` (films Foldo with Foldo).

## 11. Common pitfalls

- **Pinned encode args** (§2). Don't touch `ENCODE_ARGS`.
- **Grounded selectors only.** A walkthrough step with a CSS selector is
  a validation error on purpose. If a click can't be expressed as visible
  text, the step should probably be redesigned, not the validator.
- **Optimistic updates can wedge.** Every `api/*.ts` mutation that patches
  the store optimistically must roll back on error (copy
  `api/comments.ts`).
- **WS reconnect = full rehydrate.** Client-only state in BoardStore
  vanishes on reconnect.
- **`packages/protocol` is the wire truth.** Never define a
  request/response shape in `apps/web/src/api/*` or
  `apps/server/src/routes/*`.
- **Test ids matter.** `e2e/` reaches the DOM by `data-testid`; search
  before renaming.
- **The director runs in the API process.** A pathological render blocks
  CPU alongside request handling — acceptable at this scale, split it out
  when it hurts (the Dockerfile note says the same).

## 12. When you finish a change

1. `npm run typecheck` — clean.
2. `npx vitest run` — clean.
3. `npm --workspace @foldo/web run build` — clean.
4. `npx prettier --check` on what you touched.
5. Open a PR; CI runs all seven gates. Squash-merge on green.

## 13. Where else to read

- [README.md](README.md) — the product pitch.
- [SALES.md](SALES.md) — demo script, objections, prospects.
- [docs/EMAILS.md](docs/EMAILS.md) — onboarding email sequence.
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) /
  [docs/PROTOCOL.md](docs/PROTOCOL.md) / [docs/MCP.md](docs/MCP.md) —
  deep wiki (pre-pivot in places; this file wins on conflict).
- [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) — Railway runbook.

Welcome aboard.
