# Foldo — Path to A++ : Review & Roadmap

> Source: three parallel read-only audits (server, web, protocol/schema/tests) on
> commit `81bfdf4` plus the fixes shipped on top of it (markdown save round-trip,
> iframe zoom forwarding, dev-server watch ignoring node_modules).
> Date: 2026-05-23.

---

## Executive summary

Foldo is a **clean, functional codebase** with strong fundamentals: tight TypeScript,
no `as any` graveyards, a sensible Map+`useSyncExternalStore` state, a real
multiplayer pipeline, a shared `@foldo/protocol` package, and almost no dead code
or stray TODOs. That's the good news.

The bad news is that several "demo-grade" choices are now load-bearing:

- The **frontend is one giant 1,644-line `App.tsx`** subscribed to the *entire*
  store via `useBoardSnapshot()`, so any change anywhere re-renders the whole
  canvas tree.
- The **database mixes** `TEXT` and `TIMESTAMPTZ` timestamps, stores 11 JSON
  columns as `TEXT` not `JSONB`, and has **no FKs on `frames`, `comments`, or
  `dispatches`** — i.e. no referential integrity on the things users edit most.
- Two classes of bug are baked into the architecture: **duplicated state**
  (the `frames.content_json` ↔ `sources` drift you hit yesterday is one of
  several) and **N+1 query patterns** in the comment + test-session listers.
- The **WebSocket hub is single-instance in-memory** — multi-instance HA breaks
  silently. WS messages have **no version field**, so any protocol change is a
  hard break.
- Security has multiple **demo-mode footguns still wired into production paths**:
  bearer-token aliases that map `demo-user` → `u-you`, `postMessage(..., '*')`,
  no rate-limit on `/api/auth/login`, sessions that never expire, weak
  `isSampleAppOutbound` type guard that accepts any `'foldo.sample.*'` string.
- **No `ErrorBoundary` anywhere**, **no code-splitting** (the marketing landing
  ships the entire canvas bundle), **no unit tests**, and only 4 E2E tests cover
  the whole product.

None of this is "broken" today. All of it makes "A++ highly performant,
scalable, high quality" impossible without a deliberate refactor pass. **The
12 issues below, grouped by theme, are the things blocking that grade.**

The good news on top of the bad news: each is well-scoped. We can land the full
A++ refactor in 4 phases (~5–6 focused weeks), and then the plugin registry +
layer navigator + DOM editor + dev handoff are *significantly easier* once the
substrate is right.

---

## 12 cross-cutting findings (prioritized)

Severity = the cost of NOT fixing this before scaling / before shipping the new
features.

### 🔴 Critical — fix before any new feature work

**1. Frontend re-render storm — single root subscription** 
`apps/web/src/App.tsx:100` reads `useBoardSnapshot()` (full store). Any
`frame.updated` / `cursor.move` / `presence` change re-runs all 1,600 lines and
re-evaluates every memo. `useBoardSelector` exists but is barely used.
*Fix:* convert subscriptions to per-slice selectors (`frames`, `comments`,
`presence`, `board`) and extract a `<FrameLayer/>` sub-component so frame
rendering has its own subscription scope.
*Impact:* the biggest single perf win in the codebase. Estimated 60–80% fewer
React commits on a busy multiplayer board.

**2. Duplicated state — `frames.content_json` ↔ `sources` (and friends)** 
This is the bug class behind yesterday's "save doesn't save" issue. The
markdown body lives in *two* tables; the PATCH route originally wrote one and
the GET path read the other. We fixed it for markdown — but the same pattern is
latent in `comments.replies_json`, `dispatches.events_json`, the test
`synthesis_json`, and `frames.content_json` (which itself caches text that also
lives in `sources`).
*Fix:* pick a single source of truth per concept. For markdown: source of
truth is `sources`, frame holds metadata only; OR drop the `sources` table
mirror entirely and serve from `content_json`. Then enforce with a DB-level
check or remove the second copy.

**3. N+1 queries in two hot paths** 
- `apps/server/src/repo/comments.ts:33,66-71` — `listCommentsForBoard()`
  calls `getUserById()` per comment row.
- `apps/server/src/repo/testSessions.ts:194-205` — `listSessionsForTest()`
  calls `listTaskResults(sessionId)` per row.
*Fix:* one JOIN with `users` for comments; one JOIN-or-batch for task results.
*Impact:* 100 comments → 1 query instead of 101.

**4. Missing FK constraints & indexes**
- No FK on `frames.board_id`, `comments.{board_id,frame_id}`,
  `dispatches.{board_id,frame_id}`, `frames.parent_frame_id`. Deletes silently
  orphan rows.
- No index on `branches(board_id)`, `commits(branch_id)`,
  `frames(parent_frame_id)`, `frames(kind)`, `test_sessions(status)`.
*Fix:* add FKs with `ON DELETE CASCADE` where appropriate; add the five
indexes above. ~30 minutes of DDL.

**5. Iframe bridge security holes**
- `apps/web/src/components/AppFrame.tsx:334` — `postMessage(msg, '*')`. Should
  target the iframe's own origin.
- `apps/web/src/iframe/messages.ts:58-62` — `isSampleAppOutbound` accepts ANY
  object whose `type` string starts with `'foldo.sample.'`. A malicious iframe
  can send `{type:'foldo.sample.pwn', ...}` and bypass validation.
- WS message handler in `App.tsx` doesn't validate incoming `ServerMessage`
  shapes.
*Fix:* pass `new URL(iframeUrl).origin` to postMessage; replace the prefix check
with an explicit `type` whitelist (or a Zod parser).

**6. Production-unsafe auth surface**
- `apps/server/src/auth.ts:16-45` — `TOKEN_ALIASES` (`demo-user`, `demo-mcp`)
  + a fallback that treats *any user id* as a valid bearer token. Anyone who
  knows a user id is logged in as them.
- `apps/server/src/routes/auth.ts:109-184` — **no rate limit** on
  `/api/auth/login` or `/signup`. Brute-force is free.
- Sessions never expire (`db.ts:60-68`); compromised tokens are forever.
- Password hashing uses scrypt with **default** cost params — no `N`, `r`, `p`
  stored in the hash format.
- `getUserByEmail` is case-sensitive in code but the index is
  `lower(email)` — small account enumeration vector.
*Fix:* gate aliases + id-as-token behind `NODE_ENV !== 'production'`; add
`rateLimitPreHandler` (already exists in `rateLimit.ts`) to auth routes; add
`expires_at` to `sessions`; store scrypt cost in the hash format; normalize
emails to lowercase before lookup.

---

### 🟠 High — fix before scaling to multi-instance / >100 frames per board

**7. WebSocket hub doesn't scale; no protocol version; no replay**
- `apps/server/src/ws/hub.ts` is an in-memory `Map`. Two server instances =
  two disconnected universes; multiplayer breaks silently.
- `apps/web/src/api/ws.ts` reconnects but doesn't replay missed messages.
  After 5s offline you can be permanently out of sync.
- `packages/protocol/src/ws.ts` has a `version` field only on
  `McpClientMessage` (line 107). Browser ⇄ server messages have **none**. Any
  protocol bump = hard break for clients in flight.
*Fix:* swap hub for Redis pub/sub (interface is already designed for it); add
a per-board monotonic `seq` on broadcasts + a `since:seq` replay endpoint
(or just store last N broadcasts in memory for a soft fix);
add `version?: string` to `ClientMessage`/`ServerMessage` with a server-side
compat layer.

**8. Race & lost-write bugs**
- `addReply` in `comments.ts:151-163` reads → mutates → writes the
  `replies_json` array without a transaction. Two concurrent replies = one
  silently lost.
- Frame PATCH (now also writes `sources`) isn't wrapped in a transaction —
  if step 2 fails, the two tables drift again.
*Fix:* wrap multi-write handlers in `BEGIN…COMMIT`; for `replies_json`,
prefer an atomic `jsonb` append once we migrate to JSONB.

**9. App.tsx is the monolith** 
1,644 lines, 8 distinct responsibilities (bootstrap, viewport, keyboard,
multiplayer outbound, comments, dispatches, frame tools, render loop). Every
extraction below is a forward-fit for the plugin work:
- `<FrameLayer/>` (lines 1055-1148) — frame rendering loop with its own store
  subscription.
- `<CommentSystem/>` (lines 442-668) — 10 handlers in one tree.
- `<DispatchPanel/>` (lines 670-754) — dispatch lifecycle.
- `<FrameTools/>` (lines 769-932) — sticky/arrow/image creation.
- A `useKeyboardShortcuts()` hook (lines 333-368).
Each extraction is independently shippable.

**10. JSON-as-TEXT + TEXT timestamps**
- 11 JSON columns stored as `TEXT` (`content_json`, `replies_json`,
  `events_json`, `target_json`, `recording_modes_json`, `questionnaire_json`,
  `start_recipe_json`, `tester_meta_json`, `transcript_json`,
  `responses_json`, `synthesis_json`). No SQL-side validation, no indexing,
  every read parses.
- ~14 timestamp columns are `TEXT` ISO strings; mixed with `TIMESTAMPTZ`
  elsewhere. Time-zone bugs latent; date math impossible in SQL.
*Fix:* `ALTER COLUMN … TYPE JSONB USING content_json::jsonb` (and friends);
standardize to `TIMESTAMPTZ`. Also: replace the schema-as-string approach with
a `schema_migrations` table and versioned files.

**11. Forward-fit & extensibility gaps for the planned features**
- `LeftRail` hardcodes a fixed `Tool` enum and a fixed position
  (`absolute left-3 top-1/2`). Repositioning to bottom + plugin tool injection
  is a refactor, not a CSS tweak.
- `EditPanel` is *the* right panel, mounted on `selectedElement`. There's no
  generic "right panel slot" a plugin could fill.
- The iframe bridge only emits `element.click` / `element.hover` /
  `recipe.completed`. The DOM editor will need
  `queryStyle` / `mutateElement` / `screenshot` / `undo`.
- The `sample-app` bridge is hardcoded to one app. To make the DOM editor work
  on customer apps it needs to ship as a separate `@foldo/preview-bridge`
  package (DEPLOYMENT.md already calls this out as a TODO).

**12. Test substrate too thin to support a refactor of this size**
- 4 E2E tests total (1 creator path, 3 tester paths).
- Zero unit tests on repos, routes, reducers, the markdown parser, the
  store, or the WS reconciler.
- `tsconfig.base.json` has `"strict": true` but is missing
  `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`,
  `noImplicitOverride`.
- No CI workflow file.
*Fix:* add Vitest (cheap; works alongside Playwright), seed it with reducer +
markdown-parser + comment-authorship-stamping tests; raise tsconfig strictness
in one pass + fix fallout; add a minimal GitHub Actions workflow
(`typecheck`, `vitest`, `playwright` on PRs).

---

### 🟡 Medium — fix while the substrate is open

- **No `ErrorBoundary`** anywhere (`apps/web/src/App.tsx`). One component throw
  = whole canvas blank. Add a root boundary + per-frame boundary.
- **No code-splitting** (`apps/web/src/main.tsx`). Marketing landing ships the
  canvas bundle. Wrap each route in `lazy()` + `<Suspense>`.
- **`SELECT *` everywhere** in the repo layer — costs 20–50% wire bandwidth on
  the big JSON-bearing tables.
- **No structured logging / request IDs.** Logs from concurrent requests
  interleave; debugging prod will be brutal.
- **Toast UX swallows back-to-back errors.** Stack/queue the messages.
- **No pagination** on list endpoints or `GET /api/boards/:id` (which returns
  the entire board: frames + comments + users in one shot).
- **Transcription / synthesis failures swallow errors** — sessions stuck in
  `processing` with no visible failure.
- **S3 signed URL TTL is 1 hour** — too long; drop to 5–10 min.
- **Bare-string ID types** (`type BoardId = string`). Brand them to prevent
  swapped-arg bugs.
- **CommentPin + Connectors aren't viewport-culled** — DOM nodes proportional
  to total comment/connector count, not visible count.
- **Bunch of low-leverage `useCallback` deps chains** in `App.tsx` keep
  invalidating callbacks; mostly resolved by the FrameLayer extraction in #9.

---

### 🟢 Low — polish

- `Math.exp(-deltaY * 0.01)` zoom step jumps with large mouse-wheel deltas.
- Drag threshold doesn't compensate for zoom.
- LeftRail buttons have `title` but no `aria-label`.
- Canvas container has no `role="region"` / `aria-label`.
- No focus auto-management in `CommentPopover`.
- `gc.ts` job has no metrics / no surface for failure.
- `CORS` allows any `chrome-extension://` origin.

---

## What "A++" looks like

The grading rubric we're aiming for:

1. **Predictable performance.** A 1,000-frame, 20-user board feels the same as a
   10-frame, 1-user board for cursor work and panning. Re-renders are scoped to
   what actually changed. iframes only mount when on-screen.
2. **Predictable correctness.** No data lives in two places; every multi-write
   handler is transactional; FKs catch dangling refs at the DB; protocol
   messages are validated at every boundary; broken plugins can't break the
   canvas.
3. **Predictable evolution.** Protocol messages carry a version. Schema changes
   go through versioned migrations. New tools, panels, and frame kinds are
   *plugin contributions*, not core diffs.
4. **Predictable security.** No demo backdoors in prod; rate-limited auth;
   signed URLs with short TTLs; iframe messages validated by origin AND shape.
5. **Predictable operations.** Structured logs, request IDs, basic metrics
   (request rate, query latency, WS connections, GC progress). CI gates merges
   on typecheck + unit + E2E.
6. **Predictable contribution.** A new contributor can run the demo, find the
   change they want to make, and ship a PR without spelunking — because the
   monolith is broken into named domains and there's a plugin substrate for
   anything that doesn't belong in core.

---

## Phased roadmap

Estimated effort assumes one focused engineer. Each phase is independently
shippable; the order matters because later phases assume the substrate of
earlier ones.

### Phase 0 — Stabilize (≈4 days) ✅ **shipped 2026-05-23**
Stop-the-bleeding fixes. None requires architectural rework.

- [x] `postMessage` origin fix + tightened `isSampleAppOutbound` + inbound
      `ev.origin` check. Bridge can no longer accept spoofed messages or leak
      to a navigated-away iframe.
- [x] Root `<ErrorBoundary/>` in `main.tsx`. Per-frame boundaries deferred to
      Phase 1 alongside the `<FrameLayer/>` extraction.
- [x] Rate-limit `/api/auth/signup` (5/min), `/login` (5/min),
      `/change-password` (10/min) via existing `rateLimitPreHandler`.
- [x] `TOKEN_ALIASES` map + id-as-token fall-through gated to
      `process.env.NODE_ENV !== 'production'`.
- [x] `sessions.expires_at TIMESTAMPTZ` added (additive migration with
      backfill to `last_seen_at + 30 days`). `getUserIdForToken` now rejects
      expired sessions and slides the window on every browser-session touch.
      GC sweep also deletes expired rows.
- [x] 5 missing indexes added (`branches(board_id)`,
      `commits(branch_id)`, `frames(parent_frame_id)`,
      `frames(board_id, kind)`, `test_sessions(status)`).
- [x] 8 FK constraints added with orphan cleanup
      (`branches→boards`, `commits→branches`, `frames→boards`,
      `frames.parent_frame_id→frames` (SET NULL),
      `comments→{boards,frames}`, `dispatches→{boards,frames}`).
- [x] N+1 in `listCommentsForBoard` fixed (now 1 SELECT comments + 1
      batch SELECT users, regardless of comment count).
- [x] N+1 in `listSessionsForTest` fixed (now 1 SELECT sessions + 1 batch
      SELECT task_results, regardless of session count).
- [x] `addReply` made atomic via `replies_json::jsonb || $1::jsonb` —
      concurrent replies serialise on the row lock, no read-mutate-write
      clobbering.
- [x] Frame PATCH + sources mirror now wrapped in `withTransaction(...)` —
      both writes succeed or both roll back, broadcast happens after commit.
- [x] **Sources is the single source of truth for markdown body.** Server
      reads always overlay `sources.body` on top of `frames.content.body` via
      `overlayMarkdownBodies()` in `repo/frames.ts`, so a stale cache can no
      longer surface to the client. Verified end-to-end: edit → save →
      reflects immediately → survives reload.
- [x] Dev-server `tsx watch` ignores `node_modules` (`apps/server/package.json`)
      so the restart-loop bug that kept corrupting installs is gone.

**Substrate now safe enough to start Phase 1.** Remaining: per-frame
ErrorBoundary, password-hash cost factor format (moved to Phase 3).

### Phase 1 — Frontend foundation (≈1.5 weeks) ✅ **shipped 2026-05-23**
Make the canvas not re-render the world.

- [x] `useBoardSnapshot()` replaced by 10 scoped `useBoardSelector` reads in
      App.tsx. Cursor moves and presence updates no longer re-evaluate the
      whole component.
- [x] `<FrameLayer/>` extracted to `components/FrameLayer.tsx` with its own
      store subscription to `frames` / `branches` / `board` + React.memo on
      the outer component. Closes the Phase-0 deferred per-frame
      `ErrorBoundary` work as a bonus.
- [x] `useFrameTools` hook (sticky / arrow / image create + arrow draft +
      hidden file input) extracted to `hooks/useFrameTools.tsx`.
- [x] `useDispatchFlow` hook (activeDispatch state + sendDispatch +
      closeEditPanel + onJumpToResult + auto-pan-on-completion effect)
      extracted to `hooks/useDispatchFlow.ts`.
- [x] `useCommentHandlers` hook (drop-pin / click / make-edit / reply /
      resolve / delete; popover state stays in App since 8+ sites set it)
      extracted to `hooks/useCommentHandlers.ts`.
- [x] `useKeyboardShortcuts` hook extracted to
      `hooks/useKeyboardShortcuts.ts`.
- [x] CommentPin viewport-gated in `AppFrame` and `MarkdownFrame`; new
      `inViewportFrameIds` prop on `Connectors` drops off-screen links from
      the SVG.
- [x] Route-level code splitting via `React.lazy` in `main.tsx`. Marketing
      / canvas / home / settings / share / capture / tester / cookie banner
      are now their own chunks. `isMarketingPath` moved to a tiny
      `marketing/path.ts` so the classifier import doesn't drag the 16
      marketing screens with it.
- [x] Vite `manualChunks` for `react`/`react-dom` (`react-vendor`) and
      `@foldo/protocol` (`protocol`).
- [x] Toast queue with `useToastQueue` + `<ToastStack/>` — 4-deep, per-item
      1.4s dismiss timer.

App.tsx: **1644 → 1123 lines (-32%)**. Whole-repo typecheck clean.

### Phase 2 — Schema, types, protocol (≈1 week)

- [ ] Migrate 11 JSON columns to `JSONB` + add validation triggers (1d)
- [ ] Standardize timestamps to `TIMESTAMPTZ` (1d)
- [ ] Add the missing CHECK constraints + composite uniques (2h)
- [ ] Introduce a `schema_migrations` table; split inline schema into
      versioned files (1d)
- [ ] Add `version?: string` to `ClientMessage`/`ServerMessage` + compat layer
      (4h)
- [ ] WS broadcast `seq` numbers + last-N replay buffer (1d)
- [ ] Branded ID types in `@foldo/protocol` (3h, mostly fallout)
- [ ] Adopt Zod for REST request bodies + WS messages; collapse manual
      validation (1d)
- [ ] Turn on `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`,
      `noImplicitOverride` + fix fallout (1d)

### Phase 3 — Scale & operations (≈1 week)

- [ ] Replace in-memory WS hub with Redis pub/sub behind the same interface
      (2d)
- [ ] Strengthen password hashing (store `N:r:p:salt:key`); normalize emails
      (3h)
- [ ] Pagination on list endpoints + `GET /api/boards/:id` split (1d)
- [ ] Structured Pino logging + request IDs middleware (3h)
- [ ] Minimal Prometheus metrics surface (4h)
- [ ] Cut S3 signed URL TTL; opaque recording keys (3h)
- [ ] Add Vitest; seed with reducer + markdown-parser + comment-stamping +
      auth tests (1d)
- [ ] Expand E2E to ~20 flows with a `createBoardWithFrames(n)` factory (1d)
- [ ] GitHub Actions: typecheck + vitest + playwright on PRs (3h)

### Phase 4 — Plugin substrate + Layer Navigator + Bottom Toolbar (≈1.5 weeks)

This is the first **feature** phase. The previous phases make it cheap.

- [ ] Define `@foldo/plugin` package: `PluginManifest`, surface enums, capability
      bus, lifecycle. (1d)
- [ ] Plugin registry + loader in `apps/web` (1d)
- [ ] Refactor the existing canvas into plugin contributions:
  - "core/comments" plugin
  - "core/dispatch" plugin (the EditPanel)
  - "core/tools" plugin (the current LeftRail buttons)
  - "core/tests" plugin (the TestsPanel)
  (2d — these wrap existing components in plugin shells)
- [ ] Replace `LeftRail`'s fixed position with a `<ToolBar/>` component that's
      mounted by a layout that puts it bottom-center (1d)
- [ ] New `<LeftPanel/>` slot; "core/layers" plugin becomes its first
      contribution → **Figma-style Layer Navigator** (2d)

### Phase 5 — DOM Editor plugin (≈2 weeks)

- [ ] Extract `apps/sample-app/src/bridge` into `packages/preview-bridge`; ship
      as installable lib for customer apps. (2d)
- [ ] Extend the bridge protocol:
  - `foldo.element.queryStyle({selector, props}) → ElementStyles`
  - `foldo.element.mutate({selector, css, undoToken?}) → undoToken`
  - `foldo.element.screenshot({frameId}) → dataUrl`
  - `foldo.element.commit({selector}) → SourceLocation` (for handoff)
  (2d)
- [ ] New `<RightPanel/>` slot in the layout (3h)
- [ ] "design/properties" plugin: typography, spacing, color, fill, border,
      shadow, layout sections — each editable with live preview via the bridge
      (4d)
- [ ] Persistence: per-element overrides stored on `frame.content.overrides`
      (the field already exists); reapplied on iframe mount (1d)
- [ ] "Commit as edit" path: turn an override into a dispatch via the existing
      MCP pipeline (1d)

### Phase 6 — Dev Handoff plugin (≈1 week, optional)

- [ ] "design/handoff" plugin: read SelectedElement + computed styles, emit
      CSS / Tailwind / styled-components, copy-to-clipboard, file download.
- [ ] Optional design-token alignment (read a `tokens.json` if the project ships
      one; map raw values back to token names in the output).

---

## New feature architecture

### Plugin registry

**Trust model (v1):** in-tree plugins only, run with full app privileges, no
sandbox. Third-party / sandboxed plugins are explicitly **out of scope for v1**
— that's a separate iframe-with-postMessage substrate that would double the
work for negative near-term value. Land the registry first; sandbox later if/when
a marketplace becomes a thing.

**Package:** `@foldo/plugin` exporting:

```ts
export interface PluginManifest {
  id: string;            // "core/layers", "design/properties", …
  name: string;
  version: string;
  surfaces: PluginSurface[];   // where this plugin contributes UI
  permissions?: Permission[];  // future: scopes for sandboxed plugins
}

export type PluginSurface =
  | { kind: 'toolbar'; tools: ToolSpec[] }
  | { kind: 'leftPanel'; tab: PanelTab }
  | { kind: 'rightPanel'; tab: PanelTab }
  | { kind: 'topBarRight'; node: ReactNode }
  | { kind: 'frameContextMenu'; items: ContextMenuItem[] }
  | { kind: 'wsHandler'; type: string; handler: (msg: unknown) => void };

export interface Plugin {
  manifest: PluginManifest;
  activate(ctx: PluginContext): void | (() => void);
}

export interface PluginContext {
  store: PluginStoreAPI;         // get/select/subscribe slices
  bridge: PluginBridgeAPI;       // iframe message send/receive
  dispatch: PluginDispatchAPI;   // create comments / dispatches
  notify: (msg: string) => void;
}
```

**Lifecycle:** registered at app boot from a static list (`plugins/index.ts`);
each plugin's `activate(ctx)` returns an optional teardown. Surfaces are
collected into a `PluginRegistryState` exposed via `usePluginSurfaces(kind)`.

**Migration plan:** today's `LeftRail`, `EditPanel`, `TestsPanel`, `TopBar`
right-side buttons each get wrapped as a built-in plugin. App.tsx becomes a
*layout* that pulls surfaces from the registry instead of importing those
components by name. After this, *every* new feature can be a plugin instead
of a core diff.

### Layer Navigator (left panel, first new plugin)

**Data model.** The frame tree already exists implicitly:
`Board → Branch → Frame → child Frame` via `frame.parentFrameId`. A new
selector `selectFrameTree(boardId)` memoizes
`Branch[] → { branch, roots: Frame[], childrenOf: Map<frameId, Frame[]> }`.

**UI.** Standard Figma-style indented tree:
```
[branches]
├─ main
│  ├─ 📄 README.md
│  └─ 🖼 pricing.tsx (default)
├─ feat/cta-revamp
│  ├─ 📝 cta-revamp.md
│  └─ 🖼 pricing.tsx (cta)
└─ feat/pro-tier-highlight
   ├─ 📝 pro-highlight.md
   ├─ 🖼 pricing.tsx (default)
   └─ 🖼 pricing.tsx (pro modal open)
```

Each row: icon by frame kind, name, edit-pencil on hover, visibility toggle
(later), drag-to-reparent (later). Click → set `selectedFrameId` + pan canvas
to fit. Two-way bound: clicking a frame on the canvas highlights its tree row.

**Surface:** `{ kind: 'leftPanel', tab: { id: 'layers', icon, label, render } }`.

### Tool switcher → bottom

The current `LeftRail` becomes a `<ToolBar/>` component with no positioning
opinion. A new `<BottomBar/>` layout slot mounts it centered along the bottom
(Figma-style). The plugin contract is:

```ts
{ kind: 'toolbar', tools: [
  { id: 'select', icon, shortcut: 'V', activate: ctx => …, group: 'navigation' },
  { id: 'comment', icon, shortcut: 'C', activate: ctx => …, group: 'review' },
  …
] }
```

Tools are grouped (`navigation`, `review`, `create`, …) and the toolbar renders
groups with dividers. New tools come from plugins, not core diffs.

### DOM editor (right panel, Figma-style design panel)

**Scope decision needed (see questions below):** v1 will target apps that have
the new `@foldo/preview-bridge` library installed (initially: the
`sample-app`, then customer apps via a one-line `<script>`). Arbitrary
captured-DOM frames are **not** in scope for v1 — that requires either a Chrome
extension content script or proxy-rewriting and is its own multi-week project.

**Bridge protocol extensions** (additions to `iframe/messages.ts`):

```ts
type DesignInbound =
  | { type: 'foldo.design.queryStyle';
      requestId: string; selector: string; props: string[] }
  | { type: 'foldo.design.mutate';
      requestId: string; selector: string; css: Record<string,string>;
      undoToken?: string }
  | { type: 'foldo.design.screenshot'; requestId: string }
  | { type: 'foldo.design.locate';
      requestId: string; selector: string }; // returns file:line if instrumented

type DesignOutbound =
  | { type: 'foldo.design.styleResponse';
      requestId: string; computed: Record<string,string>; inline: …; }
  | { type: 'foldo.design.mutateResponse';
      requestId: string; undoToken: string }
  | { type: 'foldo.design.screenshotResponse';
      requestId: string; dataUrl: string }
  | { type: 'foldo.design.locateResponse';
      requestId: string; file: string; line: number };
```

**Right-panel UI** (sections collapse independently):

- **Position & size** — x/y/w/h, locked aspect, alignment.
- **Layout** — display, flex/grid props, gap, padding/margin (the 4-edge widget).
- **Typography** — family, weight, size, line-height, letter-spacing,
  decoration, color.
- **Fill** — background color / image / gradient.
- **Border** — stroke / radius (per-corner widget).
- **Shadow** — drop, inset, list of multiple shadows with reorder.
- **Effects** — opacity, blend mode, filter.
- **Inspect** (the Phase-6 handoff plugin overlays this section): the raw CSS
  block + a "Copy as Tailwind" button.

**Persistence.** Each mutation produces an `{ selector, prop, value }` override
appended to `frame.content.overrides` (the field already exists in the
protocol). On iframe mount, the bridge replays overrides before painting.
*Live preview is always against the local overrides*; **committing** the
override turns it into a dispatch through the existing pipeline:
```
override → /api/dispatches → MCP → claude edits Pricing.tsx → new commit → new frame
```
This is what makes the design panel actually *ship* code, not just paint
pictures. It connects Figma-style editing to the existing agent loop.

### Dev Handoff (Phase 6, optional)

A small plugin reading the same `SelectedElement` + style data. Outputs:

- **CSS** — vanilla rule block.
- **Tailwind** — best-match utility classes (uses a tokens map; emits arbitrary
  values for non-matches).
- **styled-components** / **emotion** — interpolated string.
- **iOS / Android** — out of scope unless we add the platform-specific
  formatters.

Token alignment: if the project ships `design-tokens.json` (or any of the
standard token formats), the plugin maps raw values back to token names in the
output. The plugin is *additive* — it doesn't need to be installed for the
DOM editor to work, but adds significant value for design-system teams.

---

## Locked decisions (2026-05-23)

1. **Plugin trust model = in-tree, trusted (v1).** Plugins live in this repo
   and run with full app privileges. Sandbox / marketplace model is explicitly
   out of scope until / unless third-party plugins become a goal.
2. **DOM editor scope = `@foldo/preview-bridge`-instrumented apps only (v1).**
   The bridge gets extracted into `packages/preview-bridge` and ships as a
   one-line script tag drop-in for customer apps. Arbitrary captured DOM /
   cross-origin iframes are a later project (Chrome extension content-script
   path).
3. **Phase ordering = correctness first, strict sequence 0 → 1 → 2 → 3 →
   4 → 5 → 6.** Each phase strictly builds on the previous; no parallel
   feature track until the substrate is right.

---

## How to use this doc

This is the source of truth. As we ship each phase:
- check the boxes in the relevant phase block
- bump the "as-of" date at the top
- move anything we discover into the right severity bucket
- when a phase completes, write a short retro section underneath it

If a finding turns out to be wrong, delete it rather than letting it rot.
