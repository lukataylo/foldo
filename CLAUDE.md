# CLAUDE.md — Foldo onboarding

> If you are a new engineer (or a new agent) reading this for the first
> time: this is the doc to read first. Get through it once, and you'll
> know roughly where every system lives, which files to open for any
> given change, and what conventions to follow so your patch matches the
> rest of the tree.

## 30-second pitch

Foldo is a **Figma-style multiplayer review canvas for AI-generated
code**. Developers run Claude Code (or a similar agent) locally; that
work shows up as live, interactive frames on a spatial canvas where
humans (and other agents) can comment, compare variants, and ship the
chosen version. Plus a **User Tests** flow where real end-users record
screen+voice sessions against your build and the results land on the
same canvas as evidence to act on. See [README.md](README.md) for the
marketing version.

This file covers the **engineering** side: how the monorepo is laid
out, how data flows, the plugin substrate, naming conventions, where
to find things, and how to ship a change without breaking the canvas.

---

## 1. Monorepo layout

```
/
├── apps/
│   ├── web/         Vite + React canvas (5173) — what users see
│   ├── server/      Fastify + SQLite/Postgres (4000) — source of truth
│   ├── mcp/         MCP server (stdio + WS bridge) — Claude Code's tools
│   ├── sample-app/  Vite app (5174) — "the user's running app" rendered in frames
│   ├── extension/   Chrome MV3 capture extension
│   └── shotter/     Headless screenshot helper for the extension
├── packages/
│   ├── protocol/    Shared types: domain, REST, WS, MCP. Single source of truth.
│   └── plugin/      `@foldo/plugin` substrate (manifest, surfaces, registry).
├── docs/            Architecture, deployment, protocol, roadmap, runbooks
├── e2e/             Playwright tests
└── scripts/         dev orchestrator, bundle-size gate, ad-hoc utilities
```

Workspaces are managed by npm workspaces (root `package.json`). Everything
runs on Node 20+; TypeScript 5.6; React 18; Fastify 5; Vite 5.

The deep architecture wiki is [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md);
the wire protocol reference is [docs/PROTOCOL.md](docs/PROTOCOL.md); the
agent bridge spec is [docs/MCP.md](docs/MCP.md). This file is the
**entry point** — it tells you which of those to read next based on
what you're trying to do.

---

## 2. Data flow at a glance

There is **one cloud, many clients**. Cloud = `apps/server`. Clients =
any open browser tab, any running MCP server, the Chrome extension.

```
┌────────────────────────────────────────────────────────────────────┐
│  Browser tab                                                        │
│  ┌────────────┐   REST   ┌────────────┐                             │
│  │ App.tsx    │ ───────► │ apps/server│                             │
│  │ + plugins  │ ◄─── WS ─│ /api/*     │                             │
│  └────┬───────┘          │ /ws        │                             │
│       │ optimistic       └──────┬─────┘                             │
│       ▼                         │ SQLite (dev) / Postgres (Railway) │
│  ┌────────────┐                 ▼                                   │
│  │ BoardStore │            ┌─────────┐                              │
│  │ (Map-based)│            │  data   │                              │
│  └────────────┘            └─────────┘                              │
└────────────────────────────────────────────────────────────────────┘
                                ▲
                                │ WS /ws/mcp
                                │
                          ┌──────────┐
                          │ apps/mcp │  (stdio to local Claude Code)
                          └──────────┘
```

### Inside the browser

- `apps/web/src/main.tsx` boots plugins and picks a route component
  (`<App/>` for the canvas, `<HomeApp/>`, `<SettingsApp/>`, …).
- `apps/web/src/App.tsx` is the canvas. It owns the WS connection, the
  viewport, the selection, the toast queue, the dispatch UI. It reads
  state via `useBoardSelector(...)` from `state/useBoardStore.ts`.
- `apps/web/src/state/BoardStore.ts` is the **single source of truth**
  for the open board. It holds five Maps (`frames`, `comments`,
  `branches`, `users`, `dispatches`) plus presence + flags. The Maps
  are kept stable by reference when their slice didn't change, so
  selectors are cheap to memoise.
- `apps/web/src/state/reducers.ts` is the **only** thing that mutates
  the store from incoming WS messages. New `ServerMessage` types
  → new branch in `applyServerMessage(...)`.
- `apps/web/src/api/*` are thin REST clients (one file per route
  family) + the WS plumbing in `api/ws.ts`.

### Optimistic updates + reconciliation

Mutating endpoints in `apps/web/src/api/*` follow the pattern:

1. **Patch the BoardStore first** (optimistic) so the UI updates on
   click without waiting for the network.
2. Fire the REST call.
3. On success, the **server's** WS broadcast (`frame.added`,
   `comment.updated`, …) hits `applyServerMessage` and reconciles the
   optimistic patch against authoritative state.
4. On failure, roll back the optimistic patch (or surface a toast
   asking the user to retry — there's no automatic retry today).

When the WS reconnects after a drop, `apps/web/src/api/ws.ts` re-fetches
`GET /api/boards/:id` and the store is rehydrated wholesale — no
delta replay protocol yet.

### Inside the cloud

- `apps/server/src/index.ts` — Fastify boot, plugin registration, CORS.
- `apps/server/src/db.ts` — SQLite (dev) / Postgres (Railway) schema +
  query helpers. See `docs/PROTOCOL-DESIGN-IDEAS.md` for the deferred
  `schema_migrations` table plan.
- `apps/server/src/routes/*` — one file per `/api/*` route family.
  Authoritative for who can do what.
- `apps/server/src/ws/*` — `/ws` (browser) and `/ws/mcp` (agent)
  handlers + the broadcast hub.
- `apps/server/src/repo/*` — typed repository functions wrapping the DB
  calls. Routes call repos; repos call `db.ts`.
- `apps/server/src/seed.ts` — idempotent demo seed (`board-acme-landing`).

### Inside the MCP

- `apps/mcp/src/index.ts` picks a mode: `stdio` (Claude Code spawned us),
  `bridge` (cloud-only headless), or `both` (dev shell).
- Talks to the cloud over `/ws/mcp` and to Claude Code over stdio.
- Receives `dispatch.execute` (do an edit) and `freeze.request` (capture
  the running app's DOM), runs them, streams progress back.

---

## 3. The plugin substrate

`@foldo/plugin` (the `packages/plugin` package) is a tiny, in-tree,
non-sandboxed plugin substrate. Every layout slot in the canvas
(toolbar, side panels, top-bar items, frame context menu, WS handlers)
pulls its contributions from the plugin registry.

This is **deliberately not** a marketplace plugin system. v1 trusts
every plugin with full app privileges; the sandboxed marketplace
flavour is out of scope until we need it.

### How a plugin is shaped

```ts
import type { Plugin } from '@foldo/plugin';

export const myPlugin: Plugin = {
  manifest: {
    id: 'core/example',          // <scope>/<name>; "core/*" is reserved for in-tree
    name: 'Example',
    version: '1.0.0',
    surfaces: [
      { kind: 'leftPanel', tab: { id: 'example', label: 'Example',
                                   icon: <Icon/>, render: () => <Body/> }},
      { kind: 'toolbar', tools: [{ id: 'pick', label: 'Pick',
                                    icon: <Icon/>, activate() { … } }] },
    ],
  },
  activate(ctx) {
    // Called once at boot. Optionally return a teardown.
    // ctx.notify('hello'); ctx.subscribe(key, fn);
  },
};
```

### The 6 surface kinds

| Surface             | What it contributes                                |
| ------------------- | -------------------------------------------------- |
| `toolbar`           | Click-targets in the left rail (`ToolBar.tsx`)     |
| `leftPanel`         | A tab in the left side panel (`SidePanel.tsx`)     |
| `rightPanel`        | A tab in the right side panel                      |
| `topBarRight`       | An item in the top bar's right rail                |
| `frameContextMenu`  | Rows in a frame's right-click / hover menu         |
| `wsHandler`         | A listener for a `ServerMessage` type (rare)       |

Each layout slot pulls its contributions via
`usePluginSurfaces('leftPanel')` (etc.) — a thin wrapper around the
registry. The registry is **frozen after boot**: install order = render
order, and nothing mutates it once `bootPlugins(...)` returns.

### PluginContext (v1 surface)

```ts
interface PluginContext {
  notify: (msg: string) => void;                        // toast in the canvas
  subscribe: <T>(key: string, listener: (v: T) => void) // observe a store slice
    => () => void;
}
```

Plugins **do not** import `BoardStore` directly — that's a host concern.
For state they don't strictly need to own, they go through
`ctx.subscribe(...)`. For state they do need (e.g. the Layer
Navigator's full frame Map), they import `useBoardSnapshot` /
`useBoardSelector` — which is fine because plugins live in-tree.

### Window-level escape hatches (when to use vs avoid)

There are five `window.__foldo*` properties wired up between
`App.tsx` and `plugins/registry.ts`:

| Name                    | Producer              | Consumer                 |
| ----------------------- | --------------------- | ------------------------ |
| `__foldoToast`          | `App.tsx` toast queue | any plugin via `ctx.notify` |
| `__foldoSetTool`        | `App.tsx` tool state  | `core/tools` plugin      |
| `__foldoSelectFrame`    | `App.tsx`             | `core/layers` plugin     |
| `__foldoDeleteFrame`    | `App.tsx`             | `core/layers` plugin     |
| `__foldoRenameFrame`    | `App.tsx`             | `core/layers` plugin     |
| `__foldoReorderFrame`   | `App.tsx`             | `core/layers` plugin     |

**Use the escape hatch** when the alternative is to thread a callback
through a four-deep `PluginContext` field that only one plugin will ever
need. **Avoid it** when the same data could flow through `ctx.subscribe`
or a typed selector. Every escape hatch we add is a v2 plugin-context
refactor cost; keep the list short.

The full list of registration helpers is in
`apps/web/src/plugins/registry.ts`; the call sites are in `App.tsx`
(`registerToastHook`, `registerSetToolHook`, …).

### BUILTIN vs EXPERIMENTAL

`apps/web/src/plugins/index.ts` exports two arrays:

- **`BUILTIN_PLUGINS`** — always loaded. A plugin lives here once its
  happy-path UX is shipped and the substrate gaps (if any) are
  "missing feature" rather than "broken UX". Today: `core/tools`,
  `core/layers`, `core/dom-editor`.
- **`EXPERIMENTAL_PLUGINS`** — loaded only when the Vite build is
  produced with `VITE_FOLDO_EXPERIMENTAL_PLUGINS=1`. Empty today;
  wave-4+ will add `core/keyboard`, `core/history`, etc. here as they
  land so they can merge + CI without regressing the default canvas.

Promote a plugin from EXPERIMENTAL → BUILTIN when:
- every button/affordance it ships does **something** sensible,
- the remaining work is "missing feature" not "broken UX",
- there are unit tests around the user-visible behaviour, and
- the default canvas survives a manual smoke test with it enabled.

The wiring is in `apps/web/src/main.tsx`:

```ts
const experimentalEnabled =
  import.meta.env.VITE_FOLDO_EXPERIMENTAL_PLUGINS === '1';
bootPlugins(
  experimentalEnabled
    ? [...BUILTIN_PLUGINS, ...EXPERIMENTAL_PLUGINS]
    : BUILTIN_PLUGINS,
);
```

---

## 4. State patterns

Two hooks live in `apps/web/src/state/useBoardStore.ts`. They both
subscribe via React 18's `useSyncExternalStore`.

### `useBoardSelector(selector)` — **preferred**

```ts
const frame = useBoardSelector((s) => s.frames.get(frameId));
const meId  = useBoardSelector((s) => s.meUserId);
```

- Re-renders only when the selector's return value changes by
  reference.
- The store keeps inner Maps reference-stable when their entries
  didn't change, so `s.frames` is the same object across renders that
  didn't touch frames.
- Use this for **almost everything**. It's the cheapest read pattern.

### `useBoardSnapshot()` — **legacy, accepts whole-store re-renders**

```ts
const snap = useBoardSnapshot(); // entire BoardSnapshot object
```

- Re-renders on **every** store change.
- Used today only inside the Layer Navigator, which iterates over many
  Maps at once and is fine being chunky.
- Don't reach for this in new code — write a selector. The hook only
  stays for the one legitimate caller.

### Direct `boardStore.getSnapshot()` (no hook)

- Used outside React (in `api/*.ts`, in the optimistic-update helpers,
  in event handlers that fire-and-forget).
- Fine for one-shot reads. Don't use it inside a component body — use
  the hook so React knows to re-render.

---

## 5. Naming conventions

### `data-testid`

`foldo-{area}-{element}-{noun}` (kebab-cased). Examples from the tree:

- `foldo-canvas-frame`              — a frame on the canvas
- `foldo-canvas-leftrail`           — the left tool rail
- `foldo-canvas-topbar-share`       — the share button in the top bar
- `foldo-comment-popover`           — an open comment popover
- `foldo-comment-make-edit`         — the "Make this an edit" button

`{area}` is one of `canvas`, `home`, `settings`, `marketing`, `share`,
`capture`, `comment`, `dispatch`, `test`, `claude-simulator`, …
`{element}` is the visual chunk (`topbar`, `frame`, `popover`,
`banner`, `modal`, `redirect`). `{noun}` is the specific affordance.

Playwright tests in `e2e/*` rely on these — add `data-testid` to any
new affordance you want a test to reach.

### Routes (REST)

- `/api/boards`, `/api/boards/:id` — board hydration + list
- `/api/boards/:id/frames`, `/api/frames/:id` — frame CRUD
- `/api/comments/:id`, `/api/boards/:id/comments` — comment CRUD
- `/api/dispatches`, `/api/dispatches/:id` — agent dispatch lifecycle
- `/api/tests/*`, `/api/test-sessions/*` — User Tests flow
- `/api/captures`, `/api/uploads` — extension + recording uploads
- `/api/auth/*`, `/api/me` — auth + identity
- `/api/webhooks/github` — GitHub App receiver

One route file per family in `apps/server/src/routes/`. Mirror in
`apps/web/src/api/`.

### URLs (web)

- `/`                 — canvas (lands on most-recent board)
- `/board/:id`        — explicit board
- `/board/:id?frame=` — deep link to a frame
- `/home`, `/home/*`  — board picker + recent activity
- `/settings/*`       — account + workspace settings
- `/s/:token`, `/share/:token` — public share viewer
- `/c/:id`            — capture viewer (extension landing)
- `/t/:token`         — public User Tests tester page (no auth)
- everything else is the marketing site (see `marketing/path.ts`)

---

## 6. Where to look for what

| If you want to change…              | Open…                                                 |
| ----------------------------------- | ----------------------------------------------------- |
| Authentication / sign-in            | `apps/server/src/routes/auth.ts`, `apps/server/src/auth.ts` |
| The canvas itself                   | `apps/web/src/App.tsx`                                |
| A toolbar button                    | `apps/web/src/plugins/core-tools/index.tsx`           |
| The left layer navigator            | `apps/web/src/plugins/core-layers/`                   |
| The DOM-pick / inspect overlay      | `apps/web/src/plugins/core-dom-editor/`               |
| Frame rendering inside the canvas   | `apps/web/src/components/*Frame*.tsx`                 |
| Comments + pin UX                   | `apps/web/src/components/Comment*.tsx`                |
| Agent dispatches (UI)               | `apps/web/src/App.tsx`, look for `dispatch`           |
| Agent dispatches (server)           | `apps/server/src/routes/dispatches.ts` + `apps/mcp/`  |
| User Tests (server)                 | `apps/server/src/routes/tests.ts`, `…/testSessions.ts`|
| User Tests (web tester page)        | `apps/web/src/test/TestRunner.tsx`                    |
| GitHub webhook handling             | `apps/server/src/routes/webhooks.ts`                  |
| Storage (S3/local)                  | `apps/server/src/storage/`                            |
| Wire types (REST/WS/MCP)            | `packages/protocol/src/*.ts`                          |
| Plugin substrate                    | `packages/plugin/src/index.ts`                        |
| Plugin host wiring                  | `apps/web/src/plugins/registry.ts`                    |
| Layout slots (where plugins render) | `apps/web/src/plugins/slots/*.tsx`                    |
| Marketing pages                     | `apps/web/src/marketing/`                             |
| Chrome extension                    | `apps/extension/`                                     |
| Dev orchestrator                    | `scripts/dev.mjs`                                     |
| Bundle-size gate                    | `scripts/check-bundle-size.mjs` + `docs/PERF-BUDGETS.md`|

When a search doesn't turn anything up: the wiring is usually in
`apps/web/src/App.tsx` (it's still the largest single file) or
`apps/server/src/index.ts`.

---

## 7. Deployment

The full deployment runbook is [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md);
the Railway readiness audit is [docs/RAILWAY_READINESS.md](docs/RAILWAY_READINESS.md).

Production = **Railway**. Three deployed services (plus an optional
fourth):

- `web` — Vite `build` → static `dist/` served by the `serve` package
  on `$PORT` (`apps/web/Dockerfile`), behind a Railway domain.
- `server` — `apps/server/Dockerfile` (Node 20 slim), Fastify on
  `$PORT`. Mounted Postgres add-on for the DB. S3-compatible object
  storage add-on for recordings/uploads.
- `sample-app` — same static-`serve` shape as `web`
  (`apps/sample-app/Dockerfile`).
- `shotter` — optional headless-Chromium screenshot service
  (`apps/shotter/Dockerfile`); not deployed today.

Railway config-as-code is service-scoped (one file per service), so
each app carries its own `apps/<app>/railway.json`; point each Railway
service's "Config file path" setting at its file. See
docs/DEPLOYMENT.md §9.

The MCP server (`apps/mcp`) **does not deploy**. It runs on the user's
laptop (spawned by Claude Code, or via `npm run dev:mcp`). It opens a
WS to the cloud's `/ws/mcp` endpoint with a token.

---

## 8. CI gates

`.github/workflows/ci.yml` runs on every PR + push to `main`. Six jobs:

| Job          | What it checks                                                 |
| ------------ | -------------------------------------------------------------- |
| `typecheck`  | `tsc -b --noEmit` across all workspaces                        |
| `unit`       | `vitest run` (root)                                            |
| `e2e`        | `playwright test` against `npm run dev` with a Postgres service |
| `format`     | `prettier --check`                                             |
| `audit`      | `npm audit --omit=dev --audit-level=critical`                  |
| `secrets`    | `gitleaks` scan over full history                              |
| `bundle-size`| Web build + `scripts/check-bundle-size.mjs`                    |

All seven must pass before merge. Local pre-flight:

```bash
npm run typecheck
npx vitest run
npm --workspace @foldo/web run build
npx playwright test                # needs Postgres + dev servers
npx prettier --check "**/*.{ts,tsx,js,mjs,json,md,yml,yaml}" \
  --ignore-path .gitignore --ignore-path .prettierignore
```

---

## 9. Known issues — skipped tests

These tests are conditionally skipped because the CI environment doesn't
always have the binding they need. They run locally when the binding is
present and in CI's `e2e` job (which spins up Postgres). Add to this
list when you skip a new test — and link to the follow-up issue or PR.

| File                                                  | Why skipped                          | Follow-up |
| ----------------------------------------------------- | ------------------------------------ | --------- |
| `apps/server/src/__tests__/boards-archive.test.ts`    | `describe.skip` when `!HAS_DB`       | Run with Postgres |
| `apps/server/src/__tests__/emailVerifications.test.ts`| `describe.skip` when `!HAS_DB`       | Run with Postgres |
| `apps/server/src/__tests__/passwordResets.test.ts`    | `describe.skip` when `!HAS_DB`       | Run with Postgres |
| `apps/server/src/__tests__/me-export-delete.test.ts`  | `describe.skip` when `!HAS_DB`       | Run with Postgres |

(`HAS_DB` is true when `DATABASE_URL` is set — the CI `e2e` job sets
it; the `unit` job doesn't. Run `DATABASE_URL=… npx vitest run` to
exercise them locally.)

---

## 10. Run it locally

```bash
git clone https://github.com/lukataylo/foldo.git
cd foldo
npm install
npm run dev
```

`npm run dev` boots three services concurrently:

| Service     | URL                       | What it is                           |
| ----------- | ------------------------- | ------------------------------------ |
| Web canvas  | http://localhost:5173     | The Foldo canvas                     |
| Cloud       | http://localhost:4000     | REST + WS + SQLite                   |
| Sample app  | http://localhost:5174     | The "user's running app"             |

Open http://localhost:5173 — you'll land on `board-acme-landing`, a
seeded board with three branches and four pre-pinned comments.

### Individual workspaces

```bash
npm run dev:web       # just the canvas (port 5173)
npm run dev:server    # just the cloud (port 4000)
npm run dev:sample    # just the sample app (port 5174)
npm run dev:mcp       # just the MCP bridge (no port — WS client)
npm run dev:shotter   # the screenshot helper (used by the extension)
```

### Plug in real MCP

```bash
FOLDO_MCP_DEV=1 npm run dev   # or in a separate shell: npm run dev:mcp
```

### Experimental plugins

```bash
VITE_FOLDO_EXPERIMENTAL_PLUGINS=1 npm --workspace @foldo/web run dev
```

The default canvas only ships `BUILTIN_PLUGINS`. The flag is read at
**build time** by Vite — for a deployed bundle you'd set it when
running `npm --workspace @foldo/web run build`.

---

## 11. Common pitfalls

- **`NODE_ENV` gating.** Several code paths key off
  `process.env.NODE_ENV === 'production'` or
  `import.meta.env.PROD`. If you're testing behaviour that's gated on
  prod, you have to actually run the prod build — `npm run dev`
  always feels like dev. The `apps/web/src/App.tsx` DevTools shim is
  the canonical example.
- **Optimistic updates can wedge.** If the REST mutation fails and you
  forgot the rollback, the BoardStore now lies. Every `api/*.ts`
  helper that patches optimistically must also patch back on error.
  If you're adding a new mutation, copy the pattern from
  `api/comments.ts` (small, clean) — not from one of the older
  hand-rolled ones.
- **WS reconnect = full rehydrate.** There's no delta-replay protocol
  yet. If the WS drops + reconnects, the client throws away the
  in-memory store and refetches `/api/boards/:id`. Don't write
  client-only state into BoardStore — it'll vanish on reconnect.
- **Plugin order matters.** Two plugins contributing to the same
  surface render in install order = the order they appear in
  `BUILTIN_PLUGINS`. Toolbar tools are rendered top-to-bottom in that
  order; left-panel tabs are tabbed in that order.
- **`window.__foldo*` is wired in `App.tsx` and only on the canvas
  route.** A plugin that calls one of these from `home/` or
  `settings/` will hit `undefined`. Plugins are canvas-only today.
- **The plugin registry installs once at boot.** `bootPlugins(...)` is
  called once at the top of `main.tsx`. Re-installing a plugin with the
  same manifest id (dev HMR) replaces it: the displaced instance's
  teardown runs and the replacement activates immediately. There is
  still no runtime `uninstall(...)` — removing a plugin entirely remains
  a v1 limitation.
- **`packages/protocol` is the source of truth for the wire format.**
  Don't define a new request/response shape in `apps/web/src/api/*`
  or `apps/server/src/routes/*` — define it in `packages/protocol`
  and import. Adding a field locally and remembering to mirror it on
  the other side never works.
- **Test ids matter.** Playwright tests in `e2e/*` reach into the DOM
  by `data-testid`. Renaming or removing one breaks an e2e test —
  search the e2e dir first.

---

## 12. When you finish a change

1. `npm run typecheck` — clean.
2. `npx vitest run` — clean.
3. `npm --workspace @foldo/web run build` — clean (catches Vite-only
   issues `tsc` misses).
4. `npx prettier --check` on what you touched (or just let CI catch it).
5. Open a PR; CI runs all seven gates.
6. Squash-merge on green. The branch name and PR title don't have a
   fixed convention; just make them descriptive.

If the e2e job fails on something unrelated to your change, check the
`dev-log` artifact first — sometimes the Postgres service is slow to
start. A rerun usually clears it.

---

## 13. Where else to read

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — deep wiki on
  components, ports, persistence, real-time.
- [docs/PROTOCOL.md](docs/PROTOCOL.md) — wire types for REST + WS.
- [docs/MCP.md](docs/MCP.md) — agent bridge spec.
- [docs/PROTOCOL-DESIGN-IDEAS.md](docs/PROTOCOL-DESIGN-IDEAS.md) —
  deferred protocol design ideas (branded IDs, Zod, migrations table).
- [docs/UX_TESTS.md](docs/UX_TESTS.md) — User Tests product design.
- [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) — Railway runbook + ops.
- [docs/RAILWAY_READINESS.md](docs/RAILWAY_READINESS.md) — prod audit.
- [docs/PERF-BUDGETS.md](docs/PERF-BUDGETS.md) — bundle-size + perf budgets.
- [docs/RUNBOOK-INCIDENT.md](docs/RUNBOOK-INCIDENT.md) — what to do
  when prod is on fire.
- [docs/ROADMAP-AAA.md](docs/ROADMAP-AAA.md) — the live roadmap +
  phase plan + audit findings.
- [docs/PRODUCTION-PLAN.md](docs/PRODUCTION-PLAN.md) — the cross-wave
  production-readiness plan that this hygiene wave is part of.

Welcome aboard.
