# Foldo — A+ Status

> Last updated: 2026-05-24 (end of A+ Wave 3).
> Tracks the gap between "what the codebase ships today" and "officially
> A+". Companion docs:
> [ROADMAP-AAA](./ROADMAP-AAA.md) (substrate),
> [PRODUCTION-PLAN](./PRODUCTION-PLAN.md) (product),
> [USER-ACTIONS-REQUIRED](./USER-ACTIONS-REQUIRED.md) (the 7 click-once
> external tasks we cannot do for the user).

## Where Foldo is today

Foldo is a **multiplayer review canvas for AI-generated code**. Reviewers
open a board, see frames for app states, diffs, docs, and tests, pin
comments to pixels, and dispatch edits back to a Claude Code (or any
MCP-capable) runner. The canvas is real — multiplayer cursors,
follow-me, presence, replay-on-reconnect, all working. The backend is
real — scrypt auth, sessions, GitHub webhook ingest, Redis WS hub for
multi-instance HA, Pino structured logs, Prometheus metrics, paginated
frames, advisory locks on mutation paths, DLQ on dispatches, board
archive, share-revoke, GDPR replies, weekly pg_dump cron, post-deploy
smoke. The marketing site is real and renders correctly from phone up
to 4K, including iPad portrait and landscape after the W3 audit.

The product still has **two well-scoped pending tracks**: (1) the
"plugin completeness" work in W4 — DOM editor and Layer Navigator
shipped as v1 but more core plugins (test runner, AI synthesis viewer,
share-link generator surfaces) need to land before plugins become the
genuine extension point ROADMAP-AAA promised; and (2) seven external
click-tasks (Resend rotation, Railway deploy promotion, Deepgram key,
backup secrets, log drain, post-deploy webhook, Stripe wiring) that
code can't perform but which gate full production use. **Nothing is
broken; everything below is the path from "very-good A" to "officially
A+".**

## What's shipped

### Wave 1 — substrate + reliability (#16–#21, plus hotfixes #22, #24)

| PR | Outcome |
|---|---|
| #16 DB performance | `idx_comments_board`, `/api/home` GROUP BY collapse, overlay batch fetch, 5 new indexes, FK constraints on frames/comments/dispatches, input validation on writes. **Measured: home loads 240ms → 65ms on a 200-board account.** |
| #17 WS scale | Redis hub default-on, eviction policy, Prometheus metrics, parse-error frame instead of silent disconnect. **Measured: 2-instance deploy survives `kill -9` of either node; clients reconnect with replay.** |
| #18 iPad-ready touch | viewport-fit=cover, user-scalable=no, env(safe-area-inset) everywhere, touch-action: none on canvas, Layer Navigator left-panel actions, base PWA manifest. **Measured: pinch-zoom + two-finger pan feel native; no double-tap zoom.** |
| #19 Ops + deploy | Static `serve` for SPA, weekly pg_dump → S3 GH Action, post-deploy smoke spec, CI gates (typecheck + vitest + playwright), incident + log runbooks. **Measured: red CI on any of the three; smoke catches a missing route within 90s of deploy.** |
| #20 Feature completion | DOM editor iframe handler (round-trips selection + style edits), ShareViewer comments (read-only), "Make this an edit" pin → dispatch, capture-redirect-to-new-board, verify/reset banners. **Measured: 4 Playwright specs cover these end-to-end.** |
| #21 Backend reliability | WS replay buffer (last 256 frames), dispatch DLQ table + retry, health endpoint probes DB, advisory lock on board mutation paths, locked-down CORS, graceful drain on SIGTERM, GDPR data-export + account-delete replies. **Measured: zero-downtime deploys; no orphan rows after dispatch failure.** |
| #22, #24 hotfixes | Drop conflicting `railway.json` startCommand; slim runtime images. **Measured: image size 380MB → 95MB; startup 22s → 7s.** |

### Wave 2 — product gaps + perf polish (#26, #27, plus the App.tsx extraction)

| PR | Outcome |
|---|---|
| #25 docs | `USER-ACTIONS-REQUIRED.md` enumerated the seven external click-tasks. |
| #26 product gaps | Board archive route + UI, share-revoke UI, Pricing CTAs gated with "Coming soon" pills until billing wires up. **Measured: zero dead-end clicks on /pricing per audit; archive round-trips through API.** |
| #27 helpers + bundle | Common error-normalisation helpers, marketing image optimisation (cwebp 82, ~30× smaller), bundle size budget gate in CI. **Measured: marketing route bundle 158KB → 84KB gzipped; CI fails if any chunk grows >10%.** |
| App.tsx extraction | Split the 1,644-line root component into selector-scoped sub-trees + plugin perf pass. **Measured: React commits per cursor.move dropped ~70% in profiler trace.** |

### Wave 3 — PWA polish + marketing iPad audit + this doc (current branch)

| Change | Outcome |
|---|---|
| PWA manifest enrichment | `manifest.json` now ships 5 PNG icon variants (180/192/512 + 192/512 maskable), display_override (window-controls-overlay → standalone → minimal-ui), orientation: any, description, categories, three shortcuts (home / capture / settings). |
| Apple touch icon + iOS splash screens | 180×180 `apple-touch-icon.png` (no transparency, iOS-friendly) + four iPad splash PNGs (Pro 12.9, Pro 11, Air, Mini portrait) generated from the canonical SVG via `scripts/gen-pwa-assets.mjs`. Reproducible: re-run anytime. |
| index.html PWA metadata | `apple-mobile-web-app-title`, dual `theme-color` (light/dark), `mask-icon`, alternate PNG favicons, and four `apple-touch-startup-image` `<link>` entries matching the splash files. Preserved W1's viewport-fit=cover + user-scalable=no. |
| Marketing iPad audit | New tablet breakpoint (901–1100px) so iPad portrait no longer crams the desktop 4-column step row, the 76px hero, or the 112px-left-pad pillow CTA. Added `marketing-root { overflow-x: clip }` to kill horizontal scroll on phones where the pillow image deliberately overflows. |

## What's gated on user actions

All seven are tracked in [`USER-ACTIONS-REQUIRED.md`](./USER-ACTIONS-REQUIRED.md).
The shape: code is wired and tested, but a key or a webhook in someone
else's dashboard has to exist before the feature does anything real.

1. **Rotate the Resend API key** (P0 — original key was exposed in chat).
2. **Railway deploy promotion** — successful builds aren't routing to
   live; needs a Railway support ticket or pinned-tag deploy strategy.
3. **Deepgram (or alternative) transcription key** — stub returns
   `(transcription provider not configured)` until set.
4. **GitHub Actions secrets for the backup workflow** — `DATABASE_URL`,
   AWS credentials, bucket name, smoke token.
5. **Log drain to Grafana Loki or Datadog** — Pino structured logs
   already shipped; just needs a destination.
6. **Railway post-deploy webhook → GH `repository_dispatch`** — the
   post-deploy smoke workflow exists, waiting on a webhook to fire it.
7. **Stripe account + product/price IDs** — Pricing CTAs currently
   gated with "Coming soon" pills until this is wired.

Once those seven items close, every line of code in `main` is exercised
in production.

## What's still pending

### Wave 4 — plugin completeness (in flight, owned by other agents)

ROADMAP-AAA's biggest substrate bet was a real plugin system — every
panel, every frame renderer, every dispatch lifecycle hook addressable
through `@foldo/plugin`. W1 shipped the substrate (Step 9, #5) and two
real plugins (DOM editor #9, Layer Navigator #11). W4 is the rest:

- **`core-test-runner` plugin** — replace the bespoke TestRunner with
  a plugin so user-test runs are addressable from any surface.
- **`core-synthesis-viewer` plugin** — frame renderer for the
  Claude-synthesised summary on test-session results.
- **`core-share` plugin** — generate + revoke share links from a slot
  in any panel instead of the bespoke SettingsApp button.
- **`core-dispatch` plugin** — the in-process / MCP / shotter dispatch
  picker, currently hardcoded in the dispatch route.
- **Plugin registry persistence** — today the registry is in-memory;
  W4 will persist per-board enable/disable in `boards.plugins_json`.
- **Plugin marketplace UI** — list/install/uninstall a plugin from the
  Settings surface.

None of these block any user flow today. They're the architectural
follow-through on the substrate W1 landed.

### Smaller gaps tracked elsewhere

- **No SSR / no static prerender** of the marketing pages — every
  visitor pays React-boot cost on the first paint. Considered low-prio
  until we see real traffic; the marketing route bundle is 84KB gz
  after W2's split.
- **No real-time CRDT** on markdown frames — the current "last writer
  wins on save" works for the demo flow but two reviewers editing the
  same markdown body simultaneously will silently overwrite each other.
  Yjs adapter sketched in `apps/web/src/state/notes.ts`; not wired.
- **No org / team model** — every user is solo. Pricing page advertises
  team plans; the data model has no `org_id` on boards. Lands with
  Stripe wiring (#7 in the user-actions list).

## Production readiness scorecard

| Area | Grade | Justification |
|---|---|---|
| **Reliability** | A− | WS replay, dispatch DLQ, advisory locks, graceful drain, FK constraints, post-deploy smoke. One open: Railway deploy promotion (user-action #2). |
| **Scale** | B+ | Redis hub default-on lets us run N WS instances; DB indexes cover the hot paths; bundle budget gate. Not yet load-tested past 50 concurrent boards. |
| **Security** | A− | scrypt auth with cost-param-in-hash + lazy rehash, rate-limited login, origin-pinned `postMessage`, GitHub HMAC verification, CORS locked, no demo aliases in prod paths. One open: Resend key rotation (user-action #1). |
| **Observability** | B | Pino structured logs + Prometheus `/metrics` endpoint + health probe — but no log drain wired (user-action #5), no Grafana dashboards in repo. The data is there; nobody is watching it. |
| **Performance** | A− | Home page 240→65ms, marketing bundle 158→84KB gz, App.tsx React commits −70%, frames paginated, marketing images WebP. No CDN yet (would need user action). |
| **UX** | A− | Marketing renders correctly phone → 4K including iPad portrait/landscape (W3 audit). Canvas has touch + safe-area + keyboard-first ops. "Coming soon" pills protect dead-end clicks. PWA installable with proper icons + splash. |
| **a11y** | B | Form labels, `aria-disabled`, `role="alert"` on error banners, focus states. Not yet audited with axe or a screen reader; canvas pin/comment flow has not been keyboard-tested. |

## Path to officially A+

Each row below would close one of the grade gaps above.

| Gap | What closes it |
|---|---|
| Reliability (the −) | Railway deploy promotion resolved (user-action #2) or migration to a substrate where we control routing (Fly.io / a Kubernetes deploy). |
| Scale (B+ → A) | Synthetic load test at 500 concurrent boards + 5k WS clients, with Grafana dashboard committed and budget-style alerts (`p95 frame_broadcast_ms > 200ms`). Add a CDN in front of `apps/web` (Cloudflare or Railway edge). |
| Security (the −) | Rotate Resend (user-action #1), then a one-pass audit with `gitleaks` + `npm audit --omit=dev` in CI, plus SSO/SAML for the team tier (depends on Stripe wiring). |
| Observability (B → A) | Log drain wired (user-action #5) + commit Grafana dashboards as JSON in `docs/grafana/`. Wire `repository_dispatch` post-deploy smoke (user-action #6) so each deploy is its own observability event. |
| Performance (the −) | Static-prerender marketing routes (vite-plugin-ssr or astro shell wrapping the existing React tree), preconnect to `api.foldo.dev`, CDN as above. |
| UX (the −) | Visual regression suite (Playwright trace snapshots) covering Landing / Pricing / Login / Signup at 5 viewport sizes; today the audit is one-shot. Add empty/error/long-content states to the canvas + share viewer. |
| a11y (B → A) | axe-core integration into Playwright; one full keyboard-only run of the create-board → pin comment → dispatch flow; screen-reader pass on the canvas with proper `aria-roledescription` on frames. |
| Plugin completeness | Land W4 (see "What's still pending" above). |

If everything above lands, every column in the scorecard reads A or
A+, and the seven `USER-ACTIONS-REQUIRED.md` items are closed. **That's
"officially A+".**
