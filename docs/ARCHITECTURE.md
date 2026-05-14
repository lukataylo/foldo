# Architecture

This document walks the Foldo codebase as it exists today: components, data flow, ports, persistence, real-time, and where each subsystem ends.

> See also: [PROTOCOL.md](PROTOCOL.md) for wire-level types, [MCP.md](MCP.md) for the agent bridge, [DEPLOYMENT.md](DEPLOYMENT.md) for production hardening.

## 1. Three-component shape

Foldo is **one cloud, many clients**. The cloud is the source of truth for boards, frames, comments, dispatches, and presence. Two kinds of long-lived clients connect to it:

- **Browser canvases** (`apps/web`) — what users see and interact with. Each open tab is one connection.
- **In-directory MCP servers** (`apps/mcp`) — what Claude Code runs locally. Holds filesystem + git access, executes edits, captures frames.

Plus a **Chrome extension** (`apps/extension`) that does one-shot captures via REST (no long connection).

Plus the **sample app** (`apps/sample-app`) — a separately-served Vite app that the canvas iframes to represent "the user's actual running app." In a real deployment this is replaced by the user's real dev preview URL.

Plus, for **User Tests** (§12), a fourth kind of client: a **public tester page** (`apps/web` route `/t/:token`, no auth) that real end users open to record screen+voice sessions against a task list. It talks to the cloud over a small public REST surface; results land back on the board as frames. See [UX_TESTS.md](UX_TESTS.md) for the full design rationale.

```
                                  +-------------------+
                                  |  Cloud (server)   |
                                  |  - REST  :4000    |
                                  |  - WS /ws         |
                                  |  - WS /ws/mcp     |
                                  |  - SQLite         |
                                  +---------+---------+
                                            |
        +-----------------+-------------+---+---+--------------+--------------+
        |                 |             |       |              |              |
        v                 v             v       v              v              v
+----------------+ +----------------+ +------+ +------+ +-------------+ +------------+
|   Browser A    | |   Browser B    | | MCP  | | MCP  | | Chrome ext  | | GitHub App |
| (apps/web)     | | (apps/web)     | | A    | | B    | | (extension) | | (webhooks) |
+----------------+ +----------------+ +------+ +------+ +-------------+ +------------+
        |                 |             | stdio |              POST /api/captures
        | iframe          | iframe      v       v              POST /api/webhooks/github
        v                 v          Claude Claude
+----------------+ +----------------+ Code   Code
|  Sample app    | |  Sample app    |
| (apps/sample)  | | (apps/sample)  |
+----------------+ +----------------+
```

## 2. Ports

| Port | Service | Role |
| --- | --- | --- |
| `4000` | `apps/server` | REST + two WS endpoints |
| `5173` | `apps/web` | Vite dev server for the canvas (also serves the `/t/:token` tester page) |
| `5174` | `apps/sample-app` | Vite dev server for the iframed app |

The MCP server doesn't bind a port — it speaks JSON-RPC over stdio (to Claude Code) and connects out to the cloud's `/ws/mcp` as a WebSocket client.

## 3. Boot sequence (web canvas)

1. `apps/web/src/App.tsx` reads or seeds a demo `userId` from `localStorage` (defaults to `u-you`).
2. `GET /api/boards` — find an active board (or use the one in the URL).
3. `GET /api/boards/:id` — hydrate the local store with `board`, `branches`, `frames`, `comments`, `users`, `mcpConnected`.
4. Open a single WebSocket to `/ws?boardId=&userId=&token=` and send `{ type: 'hello' }`. Server replies with `welcome` + initial presence.
5. For each `frame.added` / `frame.updated` / `frame.moved` / `frame.deleted` / `comment.*` / `dispatch.*` / `presence.*` over WS, the reducer (`apps/web/src/state/reducers.ts`) applies a small patch to the Map-based store.
6. Only frames near the current viewport mount their iframes (`inViewportSet` in `App.tsx`); off-screen frames render skeleton placeholders.

## 4. Boot sequence (cloud)

1. `apps/server/src/index.ts` initialises Fastify.
2. `src/db.ts` opens `data/foldo.db` (better-sqlite3, WAL mode) and runs `CREATE TABLE IF NOT EXISTS` for the core eight tables plus the four User Tests tables (§12).
3. `src/seed.ts` is idempotent — if `board-acme-landing` already exists, it bails. Otherwise inserts 5 users, 3 branches, 3 commits, 7 frames, 4 comments, 3 source files.
4. Routes registered under `/api/*`.
5. WebSocket plugin attached; `/ws` (browser) and `/ws/mcp` (agent) handlers wired.
6. CORS configured for `localhost:5173`, `localhost:5174`, and any `chrome-extension://` origin.

## 5. Boot sequence (MCP)

1. `apps/mcp/src/index.ts` picks a mode: `stdio` (Claude Code spawned us), `bridge` (cloud-only headless), or `both` (dev shell).
2. **stdio mode**: register the four tool handlers with `@modelcontextprotocol/sdk` and connect to Claude Code over the standard MCP transport.
3. **bridge mode**: open a WS to `ws://localhost:4000/ws/mcp?token=&boardId=`; send `mcp.hello`; listen for `dispatch.execute` / `freeze.request`.
4. On `dispatch.execute`: run `runApplyEdit` (which calls `simulateEdit` in the prototype; real impl shells out to `claude`), stream `dispatch.progress` events back, finish with `dispatch.completed`. The cloud re-positions the result frame next to the parent before broadcasting `frame.added`.

## 6. Data model

All types are declared in [`packages/protocol/src/domain.ts`](../packages/protocol/src/domain.ts):

- **Board** — one connected GitHub repo
- **Branch** — `id`, `boardId`, `name`, `authoredBy` (`human` / `agent`), `color`, `headSha`
- **Commit** — `sha`, `branchId`, `message`, `parentSha`
- **Frame** — `id`, `kind` (`app` / `markdown` / `sticky` / `arrow` / `image` / `test_summary` / `test_session`), `branchId`, `commitSha`, `position`, `size`, `content`, `parentFrameId?`, `generatedByDispatchId?`, `capturedFromUrl?`
- **Comment** — `pin` (fractional coords) or `anchor` (markdown section/line), `target` (file/line/element), `replies[]`
- **Dispatch** — `frameId`, `branchId`, `target`, `intent`, `status`, `events[]`, `resultFrameId?`, `resultCommitSha?`
- **PresenceUser** — `online`, `cursor`, `selection`, `viewport`, `followingUserId`
- **Test** / **TestTask** / **TestSession** / **TestQuestion** / **TestTaskResult** / **TestSessionSynthesis** — the User Tests model (§12). A `Test` owns an ordered `TestTask[]` and an optional `TestQuestion[]` questionnaire; each tester run is a `TestSession` carrying `TestTaskResult[]`, a `TranscriptCue[]` transcript, questionnaire answers, and (once the AI pass runs) a `TestSessionSynthesis`.

## 7. Persistence

SQLite via [better-sqlite3](https://github.com/WiseLibs/better-sqlite3) — synchronous, fast, zero external service.

The core eight tables plus the four User Tests tables (`tests`, `test_tasks`, `test_sessions`, `test_task_results` — see §12) are mapped through small repo files in `apps/server/src/repo/*.ts`. Composite content (e.g. `Frame.content`, `Comment.target`, `Dispatch.events`, `TestSession.transcript`) is stored as JSON in a `content_json` / `target_json` / `events_json` / `transcript_json` column.

Recording **bytes** are *not* in SQLite — they live behind the `Storage` adapter (§12), referenced by an unguessable per-session key.

To move to Postgres for multi-instance: swap the driver in `apps/server/src/db.ts`. The repo layer is otherwise driver-agnostic.

## 8. Real-time

A single in-memory `Hub` (`apps/server/src/ws/hub.ts`) keeps a `Map<boardId, Set<conn>>`:

```ts
hub.subscribe(conn)
hub.unsubscribe(conn)
hub.broadcast(boardId, message, exceptUserId?)
hub.connectionsOnBoard(boardId)
hub.findConn(boardId, userId)
```

Every server-side state mutation (REST routes, GitHub webhook, MCP `dispatch.completed`) calls `hub.broadcast()` so all connected browsers see the change instantly.

To scale beyond one Node instance: re-implement `Hub` over Redis pub/sub. The interface stays the same.

## 9. Iframe protocol

App frames render `<iframe src="http://localhost:5174/?variant=…&commit=…&foldo.embedded=1&…">`. The sample app and the canvas exchange messages via `window.postMessage`:

- `foldo.sample.ready` — first paint
- `foldo.sample.element.click` — review-mode click on an instrumented element
- `foldo.sample.element.hover` / `…hover.clear`
- `foldo.sample.recipe.completed` / `…recipe.failed`
- `foldo.sample.setReviewMode` (canvas → iframe)
- `foldo.sample.setOverrides` (canvas → iframe)
- `foldo.sample.replayRecipe` (canvas → iframe)

The full types are mirrored in both `apps/web/src/iframe/messages.ts` and `apps/sample-app/src/bridge/messages.ts`.

## 10. URL routing

A tiny `apps/web/src/routing/Router.tsx` uses only the History API:

- `/`
- `/board/:boardId`
- `/board/:boardId/frame/:frameId`
- `/board/:boardId/frame/:frameId/comment/:commentId`

Every focus, comment open, and dispatch result updates the URL so canvas state is shareable.

## 11. Auth

Demo bearer tokens:

- The token *is* the user id (`u-anna`, `u-mateo`, `u-priya`, `u-you`).
- `demo-user` → `u-you`, `demo-mcp` → `u-claude`.
- `apps/server/src/auth.ts:resolveUserFromToken` is the single chokepoint.

For real auth: replace `resolveUserFromToken` with a session-or-OAuth lookup; the contract `(req) → User | null` stays the same.

## 12. User Tests

**Unmoderated UX testing.** A creator publishes a short `foldo.dev/t/:token` link; real users record screen+voice sessions against a task list; the results — recording, per-task outcomes, questionnaire answers, transcript, AI synthesis — land back on the board as frames. This closes the loop the canvas was always missing: build → **real users try it** → evidence → fix, with the evidence wired straight into the existing dispatch pipeline (§12.4).

[UX_TESTS.md](UX_TESTS.md) is the authoritative design doc — phasing, the three delivery modes, risk register, the full rationale. This section is the as-built map.

### 12.1 End-to-end flow

```
creator (canvas)            cloud (server)                tester (/t/:token)
-----------------           --------------                ------------------
TestsPanel builds a test  → POST /api/tests ──┐
  + tasks + questionnaire    probe.ts decides  │
                             iframe/handoff/   │
                             dom_snapshot      │
status → live ────────────→ ensureSummaryFrame ┘ test_summary frame on board
publish foldo.dev/t/:token
                                               GET /api/t/:token  ← TestRunner loads
                                               POST .../sessions  ← consent, start
                                               POST .../recording ← MediaRecorder blob
                            saveRecording →    POST .../complete
                            createSessionFrame ← test_session frame on board
                            enqueueTranscription
                              → transcription/ → ai/synthesis.ts
                              → updateSessionFrame (frame.updated, in place)
creator: "Make this an edit" on a synthesis issue → existing dispatch loop
```

Sessions **stream in live** — `test.session.started` / `test.session.completed` WS messages (§8 / [PROTOCOL.md](PROTOCOL.md)) let the board fill with evidence in real time, with no new browser-side plumbing beyond the reducer cases.

### 12.2 Server pieces (`apps/server/src/`)

| Module | Role |
| --- | --- |
| `routes/tests.ts` | Creator CRUD — `POST/GET/PATCH/DELETE /api/tests`, `PUT /api/tests/:id/tasks`, `…/duplicate`, `…/sessions`. Board-membership checked, mirrors `routes/boards.ts`. Also hosts the **public** `GET /api/t/:token` (test definition for a tester; `404` unless `live`, `410` if `responseLimit` reached). |
| `routes/testSessions.ts` | The **public, no-auth tester endpoints** under `/api/t/:token` — start session, upload recording, complete, abandon. Writes are authorised by a session-scoped token (`x-foldo-session-token` header), never the user bearer. |
| `routes/recordings.ts` | Serves stored recordings back for playback. Object storage → 302-redirect to a presigned URL (S3 does ranges natively); local disk → streams the bytes itself with `Range:` / `206 Partial Content` support so `<video>` can seek. |
| `repo/tests.ts`, `repo/testSessions.ts` | SQLite mapping for the four test tables; aggregate helpers (`sessionCountsForTest`, `taskStatsForTest`, `sweepAbandonedSessions`). |
| `storage/` | The `Storage` adapter — `put` / `get` / `exists` / `pathFor` / `signedUrl?`. **Local-disk default** (`.foldo-storage/`, zero config); `S3Storage` (`storage/s3.ts`) is a drop-in for any S3-compatible bucket (AWS S3 / Cloudflare R2 / Backblaze), selected automatically when `FOLDO_S3_BUCKET` is set. Recordings are keyed `recordings/{testId}/{sessionId}.webm`. |
| `transcription/` | Pluggable transcription. **Stub default** — emits one clearly-labelled placeholder cue, status `skipped`, never fabricates speech. Real providers (Deepgram / Whisper / AssemblyAI) drop in behind `FOLDO_TRANSCRIPTION_PROVIDER`. The job marks the session `processing`, writes cues, refreshes the frame, then chains into synthesis. |
| `ai/synthesis.ts` | AI session synthesis — a summary plus discrete issues with severity. With `ANTHROPIC_API_KEY` set, one Claude Messages API call over the transcript + task outcomes + answers; without it, a deterministic stub derived from task outcomes (`generatedBy: 'stub'`). |
| `sessionFrames.ts` | Builds and maintains the canvas frames: one `test_summary` hub frame per test, one `test_session` frame per completed session parented to it and laid out in a grid. The async transcription / synthesis jobs call `updateSessionFrame` to refresh content in place. All mutations broadcast over the existing board WS path. Test frames live on a lightweight per-board `tests-{boardId}` branch. |
| `gc.ts` | `startSessionGc()` — a 10-min interval that marks any session stuck in `started`/`recording` for >30 min as `abandoned` (the safety net behind the `sendBeacon` abandon endpoint). |
| `rateLimit.ts` | Tiny in-memory fixed-window limiter guarding the public tester endpoints (loopback exempt). Graduate to Redis alongside the pub/sub work. |
| `probe.ts` | `probeFrameable(url)` — server-side `GET` inspecting `X-Frame-Options` and CSP `frame-ancestors` to decide the delivery mode (`iframe` when framing is allowed, `handoff` when it isn't, `dom_snapshot` for local-only targets). Run at test-creation time, cached on `tests.frameable`. |

### 12.3 Web pieces (`apps/web/src/`)

| Module | Role |
| --- | --- |
| `components/TestsPanel.tsx` | The creator surface on the board — a builder (target URL, tasks, questionnaire, recording modes, response limit) and a results view (session list, per-task stats). |
| `test/TestRunner.tsx` | The public `/t/:token` page. A phase machine: intro → pick recording mode + consent → grant mic/screen permission → task-by-task with the target on screen → questionnaire → upload + thank-you. |
| `test/recorder.ts` | Thin wrapper over `getUserMedia` / `getDisplayMedia` + `MediaRecorder` — codec/track-lifecycle handling, elapsed-time, stop-and-flush. |
| `test/Waveform.tsx` | Live mic waveform shown to the tester while recording. |
| `test/WaveformPlayer.tsx` | Playback component used inside the `test_session` frame — `<video>`/`<audio>` plus a scrubbable waveform; transcript lines and task chips seek it. |
| `components/TestSummaryFrame.tsx` | Canvas component for the `test_summary` frame kind — aggregate stats, the share link, status. |
| `components/TestSessionFrame.tsx` | Canvas component for the `test_session` frame kind — the recording, per-task outcome chips, questionnaire answers, transcript, AI synthesis. Each synthesis issue exposes **"Make this an edit"** (§12.4). |

### 12.4 Tying into the dispatch loop

A `test_session` frame's AI synthesis lists discrete issues. **"Make this an edit"** on an issue drops a comment on that frame (`From testing — <issue text>`), wired through `App.tsx` so it shares the existing online/offline comment-create path. From there it's the **unchanged** comment → `CreateDispatchRequest` → MCP `dispatch.execute` → Claude Code → result frame pipeline (§5 boot sequence, [MCP.md](MCP.md), [PROTOCOL.md](PROTOCOL.md)). Raw user feedback becomes a shipped commit without leaving the canvas — the part that makes this *Foldo* rather than a standalone usability tool.

## 13. Where the prototype ends

These are explicit stubs ready to be replaced:

| Layer | Stub | Replace with |
| --- | --- | --- |
| Edit execution | `apps/mcp/src/runner/editSim.ts` (heuristic) | shell-out to `claude` CLI |
| Frame capture | `apps/mcp/src/runner/playwright.ts` (dynamic-import, no-op if absent) | real Playwright worker pool |
| Persistence | `apps/server/src/db.ts` (SQLite) | Postgres |
| Pub/sub | `apps/server/src/ws/hub.ts` (in-memory) | Redis pub/sub |
| Auth | `apps/server/src/auth.ts` (bearer = user id) | OAuth (GitHub) or your IdP |
| GitHub | `apps/server/src/routes/webhooks.ts` (no sig verification) | GitHub App + HMAC verification |
| Sample app | `apps/sample-app` (hardcoded pricing variants) | the user's real dev preview at any URL |
| Recording storage | `apps/server/src/storage/` (local disk default) | any S3-compatible bucket via `FOLDO_S3_*` |
| Transcription | `apps/server/src/transcription/` (labelled stub cue) | Deepgram / Whisper / AssemblyAI via `FOLDO_TRANSCRIPTION_PROVIDER` |
| Session synthesis | `apps/server/src/ai/synthesis.ts` (deterministic stub) | Claude Messages API via `ANTHROPIC_API_KEY` |
| Tester rate limiting | `apps/server/src/rateLimit.ts` (in-memory fixed window) | Redis-backed limiter |
