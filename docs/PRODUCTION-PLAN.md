# Foldo — Production-grade A+ plan

> Companion to `ROADMAP-AAA.md`. That doc is the *substrate* — how the
> code is shaped. This doc is the *product* — what a real user can
> actually do end-to-end, and what's currently fake/stubbed/half-wired.
>
> Every numbered step here is gated on Playwright coverage of the flow
> it ships. "Done" means: feature works + Vitest unit covers the logic +
> Playwright covers the flow + CI runs both + the test would catch a
> regression. Anything looser doesn't count.
>
> Source: 2026-05-23 product audit on `phase-3-scale-ops` branch.

---

## Honest audit — what works today vs what's fake

### ✅ Works end-to-end (verified)

- **Signup / login / logout** (`/api/auth/{signup,login,logout}`). Real
  scrypt password hashing with cost params in the hash format + lazy
  rehash on login. Rate-limited.
- **Session management**. 30-day sliding expiry, GC sweep of expired
  rows. List active sessions, revoke one by token.
- **Board read**. `GET /api/boards/:id` returns the whole board + new
  paginated `/api/boards/:id/frames` endpoint.
- **Markdown frame edit & save**. Double-click or "Edit" button →
  textarea → ⌘-Enter saves. Source of truth is `sources` table; round-
  trip verified.
- **Comments** (pin, reply, resolve, delete). Optimistic UI, atomic
  reply append.
- **App frame element selection**. Click → highlight → opens EditPanel.
  Iframe ⇄ canvas bridge with origin-pinned `postMessage`.
- **In-process dispatch simulation**. Sending an "edit" with no MCP
  online → fakes the lifecycle locally. Lets the demo work standalone.
- **WebSocket multiplayer**. Cursors, presence, selection ghosts,
  follow-me. Versioned protocol, seq-stamped broadcasts, last-256
  replay buffer.
- **GitHub webhook ingest**. HMAC-SHA256 signature verification on
  `X-Hub-Signature-256`. Push events create branch/commit/frame rows.
- **GET /share/:token** read-only board view.

### ⚠️ Half-wired — works in a narrow path, breaks anywhere else

- **AI dispatch ("send to Claude Code")**.
  - With **no** MCP attached: in-process simulator runs. Looks real,
    isn't. Returns canned `[heuristic]` text and synthesises a child
    frame.
  - With MCP attached (`npm run dev:mcp`): the MCP server connects to
    the cloud, but its `editSim.ts` runner does *heuristic edits*, not
    real Claude. The comment is literal: *"real claude CLI would edit
    code"*.
  - **No path today shells out to the real `claude` CLI**.
- **Chrome extension capture-from-URL**. Built only if you
  `npm run build:extension` and load unpacked. The Foldo canvas's
  "Capture from URL" modal calls the same `/api/captures` route the
  extension does — same payload shape, but no actual screenshot
  happens server-side without the extension or shotter.
- **Server-side screenshots (shotter)**. Has its own workspace, NOT
  in `npm run dev`, no auto-start. Optional fallback when extension
  isn't installed.
- **Board sharing link minting**. POST works, but the share viewer
  read path needs the click-through to actually verify.
- **User Tests recording → result frame**. Recording uploads work,
  but downstream (transcription, synthesis) are stubs that produce
  placeholder text. The end frame appears; its content is fake.

### ❌ Not wired — declared in code/UI, doesn't do anything

- **Forgot password / password reset**. `/forgot` page exists; on
  submit it calls `setSubmitted(true)` and that's it. No API
  endpoint, no email, no token. The page openly says "a human will
  reach out by hand".
- **Email verification**. `users.email_verified_at` column exists,
  defaults NULL on signup, never set. No verification email, no
  "please verify" wall, no resend flow.
- **Real transcription**. `StubTranscriber` returns one cue with text
  `"(transcription provider not configured)"`. Documented as a stub.
- **Real synthesis**. Without `ANTHROPIC_API_KEY`, returns a
  deterministic heuristic with `generatedBy: 'stub'`.
- **MCP as a Claude Code plugin**. The `/plugin install
  lukataylo/foldo-claude` thing in `docs/marketing/Docs.tsx` is a
  story, not a tested install path.
- **Account deletion / data export (GDPR)**. Privacy page mentions
  it; no endpoint.
- **Pricing / billing**. Pricing marketing page exists; no Stripe,
  no subscription enforcement.

### 🟡 Operational gaps

- **Pino logs are structured** (just shipped), no log shipping
  configured anywhere — Loki / Datadog / etc.
- **Prometheus `/metrics` endpoint is live** (just shipped), no
  scraper running anywhere — Grafana, Railway plugin, etc.
- **WS hub: Redis impl exists, not wired** (just shipped). Single
  instance still the default.
- **Backup / restore for Postgres** — no documented runbook.

---

## Test substrate — where we are

- **19 Vitest unit tests** seeded today (hub, version compat,
  markdown authorship). Solid base, narrow coverage.
- **4 Playwright E2E specs** (creator: 1, tester: 3). Doesn't cover
  any of the flows in the audit above.
- **CI workflow** runs typecheck + vitest + playwright on PR (just
  shipped). Fails loudly the moment any of the three break.
- **The Playwright tests have no `data-testid` discipline** yet —
  they rely on text-content matching, which is fragile.

For "production grade" the Playwright suite has to cover **every flow
in the audit above**. The new test cadence (gating every step in the
plan below) builds that suite incrementally.

---

## Production-grade plan — gated, sequenced, test-first

Each numbered item below has the same shape:

> **What ships** · **Why** · **Test gate (Playwright + Vitest)** ·
> **Exit criterion**

The order is "what makes the demo path bullet-proof first, then unblock
real users". Substrate Phase 2/3 work continues in parallel where it
doesn't conflict.

### Step 1 — Real password reset (email + token + flow)

**Ships**:
- `POST /api/auth/password-reset/request` → mint a single-use,
  time-boxed token (15 min TTL), stored hashed in a
  `password_reset_tokens` table keyed by user_id, returns 200 even on
  unknown email (no enumeration).
- `POST /api/auth/password-reset/complete` → consume the token,
  set the new password hash (current params), invalidate every
  session except the new one created by this call.
- Email transport behind an interface (`EmailSender`). Default
  implementation is a **dev stub** that logs the reset link to the
  server log AND writes it to `.foldo-email-outbox/` so dev/test can
  pick it up. Real backend (Resend / Postmark / SES) is one
  `class FooEmailSender implements EmailSender` away.
- `/forgot` page actually calls the request endpoint. New
  `/reset?token=...` page that calls complete and redirects to login.

**Why**: A real product has password reset. Without it, every
forgotten password is a hand-rolled support ticket.

**Test gate**:
- **Vitest**: token mint + verify (hash, TTL, single-use, replay
  fails); EmailSender stub writes the expected payload.
- **Playwright** `e2e/auth/password-reset.spec.ts`:
  signup → log out → /forgot → submit email → poll
  `.foldo-email-outbox/` for the link → visit `/reset?token=...` →
  set new password → confirm login with the new password →
  confirm login with the old password fails → confirm any
  pre-existing session was invalidated.

**Exit**: All four assertions in the Playwright spec pass in CI.

---

### Step 2 — Email verification

**Ships**:
- On signup, generate a verification token, write a row in
  `email_verifications`, send via `EmailSender`.
- `GET /api/auth/verify-email?token=...` → set
  `users.email_verified_at`, redirect to `/home?verified=1`.
- Gate any *new account* actions that should require a verified
  email (e.g., publishing a User Test, sharing a board publicly)
  behind an `assertEmailVerified(req)` helper. Existing demo
  accounts are grandfathered.
- "Verify your email" banner on `/home` when unverified; resend
  button.

**Why**: Mandatory for any real product before the first paid feature
ships. Closes a class of spam-signup attacks.

**Test gate**:
- **Vitest**: `assertEmailVerified` throws 403 for unverified, passes
  for verified. Token TTL + single-use.
- **Playwright** `e2e/auth/email-verification.spec.ts`:
  signup → outbox link → visit → confirm banner gone →
  try the gated action pre- and post-verification, expect
  403 then 200.

**Exit**: Spec passes; resend button rate-limited and exercised.

---

### Step 3 — Real Claude Code MCP dispatch (the headline feature)

**Ships**:
- `apps/mcp/src/runner/claudeCli.ts` — actually shells out to `claude`
  CLI with the dispatch's `intent`, `target` (file + line), and the
  recipe. Captures stdout/stderr, parses the diff Claude produces,
  applies it via `simple-git`, pushes the branch, returns the new
  commit SHA. Falls back to `editSim.ts` only when `claude` isn't on
  PATH AND `FOLDO_MCP_FORCE_SIM=1`.
- Add MCP to `npm run dev` behind an opt-in flag `FOLDO_MCP_DEV=1`
  (default off — running it consumes `claude` API budget). Document
  the toggle prominently.
- A `claude doctor`-style preflight in `apps/mcp/src/index.ts`: at
  boot, verify the CLI is reachable, log the version, log "ready".
- Document the Claude Code `~/.config/claude-code/settings.json`
  wiring in a single `make claude-mcp-install` target that writes
  the snippet for the user.

**Why**: The product is *"send the change you want and Claude ships
it"*. If that's heuristic-only, the product is a demo.

**Test gate**:
- **Vitest**: `claudeCli.ts` with a mocked `claude` binary; parse the
  diff Claude produces; refuse to apply on a malformed diff;
  permission denials surface as `dispatch.failed`.
- **Playwright** `e2e/mcp/dispatch-real.spec.ts` — runs only when
  `RUN_CLAUDE_E2E=1` is set in CI (so it doesn't burn Claude credits
  on every PR). Spins up the MCP runner pointed at a **fixture
  `claude` shell script** that emits a deterministic diff; verifies
  the full lifecycle: comment → "Send to Claude" → dispatch row in
  DB → `dispatch.status` events stream → new frame appears on the
  canvas with the diff applied.

**Exit**: A real `claude` CLI run from the MCP server produces a real
commit on a test branch; the spec gates this end-to-end behind a
fixture so PR CI stays cheap.

---

### Step 4 — Capture-from-URL: extension + shotter, both working

**Ships**:
- Add `apps/shotter` to `npm run dev` (port 5175). Document that it
  needs Playwright browsers installed (`npx playwright install`).
- Wire `VITE_SHOTTER_URL` in dev `.env.example` to
  `http://localhost:5175` so the canvas's "Capture from URL" modal
  actually has a screenshot path even without the extension.
- Sign the request to shotter with a shared secret (already plumbed
  via `SHARED_SECRET`); make sure dev defaults to *no* secret rather
  than an empty-string accepted-secret.
- Chrome extension: build script outputs a versioned zip
  (`apps/extension/dist-pack/foldo-extension-<sha>.zip`) ready to
  upload to the Chrome Web Store.

**Why**: Capture is a marketed feature. Today it works only if you
manually load the unpacked extension.

**Test gate**:
- **Vitest**: shotter's `/shot` endpoint with a stubbed `chromium`
  launcher (mocked Playwright) — verifies auth, allowed-host policy,
  timeout handling.
- **Playwright** `e2e/capture/url-capture-via-shotter.spec.ts`:
  in the canvas, open "Capture from URL", paste a URL pointing at
  the local sample-app, wait for the frame to appear with the
  expected metadata + the screenshot.

**Exit**: Capture works without the user touching `chrome://extensions`.

---

### Step 5 — Make every other "demo path" Playwright-tested

**Ships**: a single PR per flow that adds a `data-testid`
discipline to the touched components AND ships the spec.

Flows to cover (one spec each):
1. `e2e/board/create-and-open.spec.ts` — create a new board from
   `/home`, land on the canvas, see seeded frames.
2. `e2e/frames/sticky-arrow-image.spec.ts` — sticky tool drops a
   note, arrow tool draws an arrow, image upload via the hidden
   input creates an image frame.
3. `e2e/comments/full-thread.spec.ts` — drop pin, type comment,
   open popover, reply, resolve, delete.
4. `e2e/comments/make-edit-from-comment.spec.ts` — comment →
   "Make this an edit" → EditPanel opens with intent prefilled →
   send → simulator runs → child frame appears.
5. `e2e/markdown/save-roundtrip.spec.ts` — already mostly covered
   ad-hoc; formalise as a spec with `data-testid`s.
6. `e2e/multiplayer/two-tabs.spec.ts` — two pages, two users,
   cursor visible on both, comment added on one shows on the other.
7. `e2e/multiplayer/replay-on-reconnect.spec.ts` — disconnect WS,
   make a change, reconnect, confirm the change shows via the
   `sinceSeq` replay path. Asserts the replay payload via the
   browser's WebSocket frame log.
8. `e2e/share/read-only-link.spec.ts` — mint a share token, open
   the share URL in a non-authed page, verify read-only.
9. `e2e/extension/popup-capture.spec.ts` — load the built
   extension in Playwright, popup → capture this tab → frame
   appears in the chosen board.
10. `e2e/tests/creator-publish.spec.ts` — already exists; expand
    with question-bank edits + delete.
11. `e2e/tests/tester-end-to-end.spec.ts` — already partly there;
    add the result frame appearing on the creator's canvas via WS.

Each spec lives in its own file so failures localise.

**Test gate**: each spec must pass in CI; total wall time stays
under 5 min on the GH runner (parallelise across two shards if
needed).

**Exit**: 15+ green Playwright specs covering every flow above.

---

### Step 6 — Real transcription + real synthesis (User Tests)

**Ships**:
- Deepgram (or AssemblyAI — pick one) transcription provider behind
  the existing `Transcriber` interface, env-gated by
  `FOLDO_TRANSCRIPTION_PROVIDER=deepgram` + `DEEPGRAM_API_KEY`.
- Synthesis: it's already wired to call Anthropic when
  `ANTHROPIC_API_KEY` is set; the missing piece is **caching** the
  synthesis result so the same recording isn't re-summarised on
  every page load. Add a `synthesis_status` column + a
  `(session_id) UNIQUE` table.

**Why**: Without these, every "result frame" on a User Test is
boilerplate. The feature reads as fake.

**Test gate**:
- **Vitest**: provider switch (stub vs deepgram); deepgram client
  with a mock fetch — happy path + 429 backoff + cache hit.
- **Playwright** `e2e/tests/transcription-pipeline.spec.ts` — runs
  with `FOLDO_TRANSCRIPTION_PROVIDER=stub` (deterministic) so PR
  CI doesn't need an API key. Asserts the session's `transcript`
  field populates within the SLA window.

**Exit**: A real recorded session, in dev with the env vars set,
produces a real transcript + a real Claude-written synthesis.

---

### Step 7 — Account deletion + data export (GDPR posture)

**Ships**:
- `POST /api/me/export` → returns a tar.gz of every row owned by
  the user (boards they own, comments they wrote, sessions they
  uploaded).
- `POST /api/me/delete` → requires password re-entry, soft-deletes
  the user (anonymises their author rows, removes their session
  rows), background job hard-deletes after 7 days.
- Settings page UI buttons for both.

**Test gate**:
- **Vitest**: export tarball contents include the user's comment
  but not someone else's; delete anonymises author_user_id but
  keeps the comment row.
- **Playwright** `e2e/account/delete-flow.spec.ts` — signup →
  comment → delete → confirm comment's authorName becomes
  "deleted user" + login fails.

**Exit**: GDPR-relevant flows are real. The Privacy page stops
making promises we can't keep.

---

### Step 8 — Production deployment runbook

**Ships**:
- `docs/DEPLOYMENT.md` rewritten as a real runbook for Railway +
  Postgres + Redis + S3/R2. Includes:
  - env var matrix
  - migration cutover steps
  - rollback procedure
  - Prometheus scrape config snippet
  - log-shipping snippet (Loki/Datadog)
  - backup cron
- `railway.json` updated to include the metrics service surface +
  the Redis + Postgres plugin references.
- A working `make prod-smoke` target that hits the deployed
  `/health` + a couple of authenticated endpoints with a
  scrape-only token.

**Test gate**:
- **Playwright** `e2e/deploy/prod-smoke.spec.ts` — runs only when
  `RUN_PROD_SMOKE=1` is set; hits the live `/health` and
  `/metrics` of the deployed instance. Reused as a post-deploy
  gate.

**Exit**: A second engineer can deploy Foldo from scratch by
following the runbook in under 30 minutes.

---

### Step 9 — Plugin substrate (registry + mount points)

**Ships**:
- New `@foldo/plugin` package: `PluginManifest`, `PluginSurface`
  enums, `PluginContext` (store / bridge / dispatch / notify), and a
  registry+loader that boots from a static `plugins/index.ts` list
  in `apps/web`. v1 = **in-tree, trusted, no sandbox** (per locked
  decision in ROADMAP-AAA.md).
- Refactor the canvas surfaces so the *existing* tooling becomes the
  first set of plugins, not a special case:
    - `core/comments` (the comment system + popover host)
    - `core/dispatch` (the EditPanel)
    - `core/tests` (the TestsPanel)
    - `core/tools` (the current LeftRail tool buttons)
    - `core/shortcuts` (the keyboard hook)
  Each wraps its current component in a plugin shell; behaviour
  unchanged, but it's now a contribution rather than a core diff.
- New layout slots that plugins contribute to:
    - **LeftPanel** (was empty, becomes the home of the Layer Navigator
      in Step 10)
    - **RightPanel** (was the EditPanel only, becomes pluggable for
      Step 11's DOM editor)
    - **Toolbar** (was the fixed LeftRail; new mount accepts
      contributions and ships at bottom-center per the locked
      decision)
    - **TopBarRight** (existing TopBar buttons become plugin
      contributions)
    - **FrameContextMenu** (new surface for plugins that add per-
      frame actions)

**Why**: Without this, every new feature is a core diff. With it,
every later step in this doc — Layer Navigator, DOM editor, handoff —
ships as an isolated plugin instead of touching App.tsx.

**Test gate**:
- **Vitest** `plugin/__tests__/registry.test.ts`: register two
  plugins both contributing toolbar tools → `usePluginSurfaces('toolbar')`
  returns both, in stable order; deactivating one removes its
  contribution without affecting the other.
- **Playwright** `e2e/plugin/core-plugins-still-work.spec.ts`:
  after the core-plugins refactor, every previously-working flow
  (comment thread, dispatch, sticky create) still passes. No new
  behaviour; this is a *no-regression gate* for the refactor.

**Exit**: App.tsx no longer imports `LeftRail`, `EditPanel`,
`TestsPanel` directly — they come from the plugin registry. All
Playwright specs from Step 5 still green.

---

### Step 10 — Layer Navigator (the left-panel "Figma layers" plugin)

**Ships**:
- `apps/web/src/plugins/layers/` — new in-tree plugin. Contributes
  a `leftPanel` surface tab.
- Tree model: `selectFrameTree(boardId)` selector that memoises
  `Branch[] → {branch, roots: Frame[], childrenOf: Map<frameId, Frame[]>}`
  from the existing `frame.parentFrameId` relation.
- UI: collapsible indented list, icon per `frame.kind`, name from
  the doc title / commit message / sticky body, hover row reveals
  edit-pencil. Click row → set `selectedElement` + canvas pans to
  fit (`fitToFrame`). Two-way bound: clicking a frame on canvas
  highlights its tree row.
- Toolbar moved to bottom-center (the second part of the locked
  layout decision). The existing `useFrameTools`-driven tools render
  there now.

**Why**: First *user-visible* delivery of the plugin substrate.
Solves the "I have 40 frames and can't find the one I want" problem
that hits every board past ~10 frames.

**Test gate**:
- **Vitest** `plugins/layers/__tests__/tree-selector.test.ts`:
  flat `frames` Map with mixed parent_frame_id → expected tree
  shape; ordering by `created_at`; orphaned `parentFrameId` rows
  surface as roots (not lost).
- **Playwright** `e2e/plugin/layer-navigator.spec.ts`:
  open canvas with seeded board → left panel shows 3 branches with
  their frames nested under each → click a row → canvas pans to
  that frame → click a different frame on canvas → tree row
  highlights. Toolbar appears at bottom, not left.

**Exit**: Layer Navigator usable as a Figma user expects on
day one of the muscle memory.

---

### Step 11 — DOM-element design editor (the right-panel plugin)

**Ships**:
- `packages/preview-bridge` — extracted from `apps/sample-app/src/bridge`,
  shipped as an installable lib so customer apps can drop in a
  one-line script tag to opt into Foldo's design-editor surface.
- Bridge protocol extensions (mirrored both sides of
  `iframe/messages.ts`):
    - `foldo.design.queryStyle({selector, props}) → {computed, inline}`
    - `foldo.design.mutate({selector, css, undoToken?}) → {undoToken}`
    - `foldo.design.screenshot() → {dataUrl}`
    - `foldo.design.locate({selector}) → {file, line}` (when the
      element is instrumented with `data-foldo-element`)
- `apps/web/src/plugins/designer/` — new plugin contributing a
  `rightPanel` tab. Sections (each collapsible):
  Position & Size · Layout (display/flex/gap/padding/margin) ·
  Typography · Fill · Border · Shadow · Effects · Inspect.
  Every edit is live-preview via the bridge; persistence is
  appended to `frame.content.overrides` (existing field). On
  iframe mount the bridge replays the overrides.
- "Commit as edit" button on each section → packages the override
  set as a `Dispatch` and hands off to the existing MCP pipeline
  → Claude rewrites the source → new commit → new frame. Closes
  the loop from "I changed this in the UI" to "Claude shipped the
  change in code".

**Why**: This is the headline ask. Foldo becomes *Figma for
running code*.

**Test gate**:
- **Vitest** `plugins/designer/__tests__/bridge-protocol.test.ts`:
  every new message type has a typed validator; mutate then
  query-style returns the mutated value; undoToken reverses the
  mutation.
- **Vitest** `plugins/designer/__tests__/overrides-merge.test.ts`:
  two overrides on the same selector merge correctly; a third
  override with `undoToken` removes the matching prior change.
- **Playwright** `e2e/plugin/designer-edit-and-commit.spec.ts`:
  select an element on an instrumented sample-app frame → change
  its `background-color` and `padding` in the right panel →
  iframe reflects the change → click "Commit as edit" → dispatch
  status streams `sending → running → done` → new child frame
  appears with the diff applied to `Pricing.tsx`.

**Exit**: A real designer can change spacing/typography/shadow on
the live sample-app, commit it, and see a real diff land via Claude.

---

### Step 12 — Dev Handoff plugin (optional, additive)

**Ships**:
- `apps/web/src/plugins/handoff/` — overlays a section in the
  right panel called "Inspect" with:
    - Raw CSS block for the selected element.
    - Tailwind utility class equivalent (token-matched if a
      `tailwind.config` is present; arbitrary value otherwise).
    - styled-components / emotion interpolated string.
    - Copy-to-clipboard on each + a "Download as `.css`" button.
- Optional design-tokens alignment: if a `design-tokens.json` is
  available, raw values map back to token names in the output.

**Why**: Closes the "designer hands off to engineer" loop without
either party leaving the canvas. Optional because the DOM editor
already ships before it.

**Test gate**:
- **Vitest** `plugins/handoff/__tests__/tailwind-mapper.test.ts`:
  raw px values map to closest Tailwind scale; arbitrary value
  syntax for non-matches; tokens beat both when present.
- **Playwright** `e2e/plugin/handoff-export.spec.ts`:
  select element → Inspect section appears with the three outputs
  → click "Copy as Tailwind" → clipboard contents match
  expected string.

**Exit**: An engineer can copy a Tailwind class string for any
selected element with one click.

---

### Step 13 — Lock the gate

**Ships**:
- CI workflow updated to **require** the Playwright suite to pass
  before merge to `main` (branch protection).
- A `e2e/SMOKE.md` index that pairs each flow with the spec file —
  any new flow without an entry there fails a CI lint job.
- A pre-commit hook (lefthook) that runs `vitest --changed` +
  `typecheck` on staged files so local commits don't push obviously
  broken code.

**Test gate**: the CI workflow itself is the gate.

**Exit**: no feature ships without a test gating it. Every step
above is enforced by CI on every PR.

---

## Test conventions to lock in now

These are the only-write-it-once decisions that make the rest of the
plan work:

1. **`data-testid` on every interactable in a flow**.
   Convention: `foldo-{area}-{element}-{noun}` e.g.
   `foldo-canvas-tool-comment`, `foldo-edit-panel-send`.
   Add an ESLint rule that flags `<button>` without `data-testid`
   inside `apps/web/src/components/` over time.
2. **Page-object pattern** in `e2e/pages/` — every spec interacts
   with the app through page objects, never raw selectors. Keeps
   selectors changeable in one place.
3. **Test users** seeded by a `e2e/helpers/factory.ts` —
   `createUser(role)`, `createBoardWithFrames(n)`, `loginAs(user)`.
   No raw fetch in specs.
4. **Each spec is independent**. Spin up DB state via factory; tear
   down via a per-test "create then delete the board" pattern OR a
   per-spec database transaction that rolls back.
5. **The Playwright e2e job in CI gets its own dedicated Postgres
   service container** so test runs don't share state with prod-
   shaped boards.

---

## Order of operations recommendation

Two tracks, run in parallel because they mostly don't conflict.

**Track A — "make the demo path real" (product gaps)**
Order: 1 (password reset) → 5 specs 1-4 (auth + canvas flows
get test coverage) → 3 (real MCP dispatch) → 2 (email verification)
→ 4 (capture flows) → 5 specs 5-11 (remainder) → 6 (transcription)
→ 7 (GDPR) → 8 (deployment runbook).

**Track B — "build what users actually asked for" (canvas features)**
Order: 9 (plugin substrate — *prerequisite for B*) → 10 (Layer
Navigator + bottom toolbar) → 11 (DOM editor) → 12 (Dev handoff,
if time).

Track B starts as soon as Step 1 lands (the auth substrate the
plugin testing depends on). The plugin substrate (Step 9) is a
big-block refactor — do it on a dedicated branch and coordinate
the merge with whatever Track A work is in flight.

Step 13 (lock the gate) is the final merge — both tracks done,
branch protection enabled.

---

## What this doc is NOT

- Not the substrate roadmap (that's `ROADMAP-AAA.md` — schema,
  protocol, code-org). The two run in parallel; the plugin and
  canvas-feature work in Steps 9-12 here is the same surface
  ROADMAP-AAA called "Phase 4-5", just folded in here so the
  whole product-grade picture lives in one place.
- Not a marketing roadmap. Pricing, paid tiers, billing surfaces
  are deliberately out of scope until the steps above land.
- Not an exhaustive bug list. Specific bugs found during the
  step work get filed as issues and linked from the relevant step.

---

## Step → spec index (the test surface this plan ships)

When all 13 steps land, the Playwright suite covers these flows
end-to-end. Each row is gated as part of the step that ships it
(reference for the Step 13 lint job):

| Step | Spec file | Flow under test |
|------|-----------|-----------------|
| 1 | `e2e/auth/password-reset.spec.ts` | Forgot → email → reset → sessions invalidated |
| 2 | `e2e/auth/email-verification.spec.ts` | Signup → verify → gated action 403→200 |
| 3 | `e2e/mcp/dispatch-real.spec.ts` | Comment → "Send to Claude" → real diff applied |
| 4 | `e2e/capture/url-capture-via-shotter.spec.ts` | Capture-from-URL with shotter, no extension |
| 5.1 | `e2e/board/create-and-open.spec.ts` | New board → canvas hydrates |
| 5.2 | `e2e/frames/sticky-arrow-image.spec.ts` | Each create tool produces the right frame |
| 5.3 | `e2e/comments/full-thread.spec.ts` | Pin → reply → resolve → delete |
| 5.4 | `e2e/comments/make-edit-from-comment.spec.ts` | Comment → edit panel → simulated dispatch |
| 5.5 | `e2e/markdown/save-roundtrip.spec.ts` | Edit → save → reload survives |
| 5.6 | `e2e/multiplayer/two-tabs.spec.ts` | Cross-tab cursor + comment delivery |
| 5.7 | `e2e/multiplayer/replay-on-reconnect.spec.ts` | WS replay via `sinceSeq` |
| 5.8 | `e2e/share/read-only-link.spec.ts` | Share token grants read-only |
| 5.9 | `e2e/extension/popup-capture.spec.ts` | Loaded extension → capture tab → frame |
| 5.10 | `e2e/tests/creator-publish.spec.ts` | Build, publish, edit, delete a test |
| 5.11 | `e2e/tests/tester-end-to-end.spec.ts` | Tester records → result frame appears |
| 6 | `e2e/tests/transcription-pipeline.spec.ts` | Transcript populates within SLA |
| 7 | `e2e/account/delete-flow.spec.ts` | Delete → anonymise → login fails |
| 8 | `e2e/deploy/prod-smoke.spec.ts` | Health + metrics post-deploy |
| 9 | `e2e/plugin/core-plugins-still-work.spec.ts` | No-regression after plugin refactor |
| 10 | `e2e/plugin/layer-navigator.spec.ts` | Tree ↔ canvas selection two-way bound |
| 11 | `e2e/plugin/designer-edit-and-commit.spec.ts` | DOM edit → live preview → commit → diff |
| 12 | `e2e/plugin/handoff-export.spec.ts` | Inspect section copies as Tailwind |
