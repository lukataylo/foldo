# Review findings — feat/plugin-arch

Adversarial bug review + live integration testing (E2E, Railway, MCP, xTrade capture)
on the `feat/plugin-arch` branch. Severities reflect production impact; several
"auth" items are intentional demo behaviour that only matter if this server faces
the public internet.

## Fixed in this branch

- **MCP `/ws/mcp` hello race (FIXED).** The handler attached its `message`
  listener only *after* `await resolveUserFromToken(...)`. The MCP client sends
  `mcp.hello` immediately on open, so on a localhost link the handshake frame
  arrived during the await window and was dropped — the socket stayed open but
  the MCP never registered (`mcpByBoard` empty), leaving the board permanently in
  "Simulator mode". Fix buffers messages synchronously from open and drains them
  once auth resolves. `apps/server/src/ws/mcp.ts`.

## Open — server (correctness / security)

- **Bearer fall-through = impersonation** (`apps/server/src/auth.ts:45`).
  `resolveUserFromToken` ends with `getUserById(token)`, so `Bearer <any user id>`
  authenticates as that user. **Intentional for the demo identity picker** (see
  the doc comment) and real signups use random session tokens — but a real risk
  if this server is ever exposed publicly. Gate behind an env flag for prod.
- **MCP WS has no board-membership check** (`apps/server/src/ws/mcp.ts`, hello
  handler). Unlike the browser WS (`ws/browser.ts:80` calls `isMember`), the MCP
  socket trusts the client-supplied `boardId` — cross-board frame injection /
  dispatch hijack in prod. Benign under demo `token == userId`.
- **Unauthenticated email enumeration** (`apps/server/src/routes/shares.ts`). The
  public `GET /api/share/:token` returns `listUsers()` including every user's
  `email`. Scope to the shared board's participants and strip `email`.

## Open — web (correctness)

- **ImageFrame doesn't resolve relative `/api/uploads` URLs**
  (`apps/web/src/components/ImageFrame.tsx:29` — `src = c.url ?? c.dataUrl`). A
  relative upload URL loads from the *web* origin, not the API origin, so uploaded
  images render blank. `main` already fixed this in the deep-review; this branch
  is missing it. (Worked around in the demo by storing absolute URLs.)
- **Layers "Move down" reorders the wrong way**
  (`apps/web/src/plugins/layers/index.tsx:56,101`). When frames share the default
  z, `swapZ(clicked, below)` bumps the clicked frame's z *up*, moving it toward the
  front instead of back. Only bites the all-default-z case (the initial board).
- **Lock/Hide optimistic rollback restores a stale frame**
  (`layers/index.tsx:36-49`). Rollback writes the render-time `frame` object back,
  clobbering a concurrent position/content update that landed during the PATCH.
  Re-read from `boardStore.getSnapshot()` at rollback time instead.

## Open — MCP runner

- **`git add -A` can sweep pre-existing WIP** (`apps/mcp/src/git/ops.ts`). The real
  edit path stages the whole working tree onto the `foldo/edit-*` branch and then
  checks out the prior branch, so unrelated uncommitted work disappears from where
  the user expects it — contradicts the module's "never lose work" claim. Bail
  out (or stash/restore) on a dirty tree and stage only what Claude touched.
- **Unattended edits from untrusted intent** (`apps/mcp/src/runner/claude.ts`).
  Dispatch `intent` (canvas-comment text) is fed to `claude -p` with
  `--permission-mode acceptEdits` + the `Write` tool, unconfined to the repo. Treat
  comment-derived intent as untrusted; drop unattended `acceptEdits` and confine
  `Write`.

## Branch / deployment notes

- **The screen lock/unlock featureset and the `locked` protocol field live only on
  `feat/plugin-arch`** — `main`/prod has no per-frame lock. Merge + deploy that
  branch before lock/unlock works on `foldo.dev`.
- Railway prod (`server`/`web`/`sample-app`) is healthy at `main@3bf06fe`
  (= origin/main HEAD); WSS handshake + CORS verified live.
- Full Playwright E2E suite: 18/18 passing locally.
