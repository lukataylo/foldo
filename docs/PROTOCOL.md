# Protocol

The wire formats Foldo speaks. All schemas live in [`packages/protocol/src/`](../packages/protocol/src) — this doc is the narrative.

## 1. REST API

Base URL: `http://localhost:4000/api`. Auth: `Authorization: Bearer <userId>` (demo) or session cookie.

### Auth & users

| Verb | Path | Body | Returns |
| --- | --- | --- | --- |
| GET | `/me` | — | `MeResponse` |
| GET | `/auth/users` | — | `{ users: User[] }` |

### Boards

| Verb | Path | Body | Returns |
| --- | --- | --- | --- |
| GET | `/boards` | — | `ListBoardsResponse` |
| GET | `/boards/:id` | — | `GetBoardResponse` (snapshot) |
| GET | `/boards/:id/branches` | — | `ListBranchesResponse` |
| GET | `/boards/:id/dispatches` | — | `ListDispatchesResponse` |

### Frames

| Verb | Path | Body | Returns |
| --- | --- | --- | --- |
| POST | `/frames` | `CreateFrameRequest` | `Frame` |
| PATCH | `/frames/:id` | `UpdateFrameRequest` | `Frame` |
| POST | `/frames/:id/move` | `MoveFrameRequest` | `Frame` |
| DELETE | `/frames/:id` | — | `SuccessResponse` |

### Comments

| Verb | Path | Body | Returns |
| --- | --- | --- | --- |
| POST | `/comments` | `CreateCommentRequest` | `Comment` |
| PATCH | `/comments/:id` | `UpdateCommentRequest` | `Comment` |
| POST | `/comments/:id/replies` | `ReplyToCommentRequest` | `CommentReply` |
| DELETE | `/comments/:id` | — | `SuccessResponse` |

### Dispatches

| Verb | Path | Body | Returns |
| --- | --- | --- | --- |
| POST | `/dispatches` | `CreateDispatchRequest` | `Dispatch` |
| GET | `/dispatches/:id` | — | `Dispatch` |
| GET | `/dispatches?boardId=` | — | `ListDispatchesResponse` |

### Sources

| Verb | Path | Query | Returns |
| --- | --- | --- | --- |
| GET | `/sources` | `repoSlug=&commitSha=&path=` | `SourceFile` |

### Captures (extension)

| Verb | Path | Body | Returns |
| --- | --- | --- | --- |
| POST | `/captures` | `CreateCaptureRequest` | `CreateCaptureResponse` |

### Webhooks

| Verb | Path | Body |
| --- | --- | --- |
| POST | `/webhooks/github` | `GithubPushPayload` |

Currently no signature verification — see [DEPLOYMENT.md](DEPLOYMENT.md) for the production checklist.

### Tests — creator side (authed, board-membership checked)

The User Tests surface. Domain types (`Test`, `TestTask`, `TestQuestion`, `TestSession`, `TestTaskResult`, `TestSessionSynthesis`, `TranscriptCue`, …) live in `domain.ts`; request/response shapes in `rest.ts`. See [ARCHITECTURE.md §12](ARCHITECTURE.md) and [UX_TESTS.md](UX_TESTS.md) for the design.

| Verb | Path | Body | Returns |
| --- | --- | --- | --- |
| POST | `/tests` | `CreateTestRequest` | `CreateTestResponse` (test + `shareUrl`) |
| GET | `/tests?boardId=` | — | `ListTestsResponse` (each item: test + `TestSessionCounts`) |
| GET | `/tests/:id` | — | `GetTestResponse` (test + `tasks[]` + `shareUrl`) |
| PATCH | `/tests/:id` | `UpdateTestRequest` | `{ test }` — `status` transitions `draft → live → closed` |
| DELETE | `/tests/:id` | — | `SuccessResponse` |
| POST | `/tests/:id/duplicate` | — | `DuplicateTestResponse` |
| PUT | `/tests/:id/tasks` | `ReplaceTestTasksRequest` | `{ tasks: TestTask[] }` |
| GET | `/tests/:id/sessions` | — | `ListTestSessionsResponse` |

On create / target-URL change the server runs `probeFrameable()` (inspects `X-Frame-Options` + CSP `frame-ancestors`) and caches the result on `tests.frameable` — that decides the delivery mode (`iframe` / `handoff` / `dom_snapshot`) testers resolve to.

### Tests — public tester side (no auth, token-scoped)

Mirrors the `board_shares` pattern. The test's base62 `shareToken` is the only credential for `GET /api/t/:token`; per-session writes are authorised by a **session-scoped token** returned from session start and sent in the `x-foldo-session-token` header (or in the body for `sendBeacon`). Guarded by an in-memory fixed-window rate limiter.

| Verb | Path | Body | Returns |
| --- | --- | --- | --- |
| GET | `/t/:token` | — | `PublicTestResponse` — intro, tasks, allowed recording modes, resolved `deliveryMode`, questionnaire. `404` unless `live`; `410 TEST_CLOSED` if `responseLimit` reached |
| POST | `/t/:token/sessions` | `StartTestSessionRequest` | `StartTestSessionResponse` — `sessionId` + `sessionToken` + `testerLabel` |
| POST | `/t/:token/sessions/:id/recording` | raw binary (`application/octet-stream`); `?durationMs=` | `UploadRecordingResponse` — the finished `MediaRecorder` blob, stored via the `Storage` adapter under `recordings/{testId}/{sessionId}.webm` |
| POST | `/t/:token/sessions/:id/complete` | `CompleteTestSessionRequest` | `CompleteTestSessionResponse` — finalises the session, creates the `test_session` frame, enqueues transcription → synthesis |
| POST | `/t/:token/sessions/:id/abandon` | `AbandonTestSessionRequest` | `SuccessResponse` — tab-close recovery, usually via `navigator.sendBeacon`; always `200`s, mutates only on a valid token |

Recording **playback** is served by `GET /api/recordings/*` (public — the key is unguessable): object storage 302-redirects to a presigned URL (S3 handles ranges); local disk streams the bytes with `Range:` / `206 Partial Content` support so `<video>` can seek.

---

## 2. Frame kinds & content

A `Frame.content` is a discriminated union keyed by `kind` (`packages/protocol/src/domain.ts`): `app`, `markdown`, `sticky`, `arrow`, `image`, and the two User Tests kinds:

### `test_summary` — `TestSummaryFrameContent`

The hub frame for a test on the canvas; session frames cluster beneath it via `parentFrameId`. Created when the test goes `live`, refreshed in place as sessions complete.

```ts
{
  kind: 'test_summary';
  testId; testName; shareToken;
  status;                       // 'draft' | 'live' | 'closed'
  totalSessions; completedSessions;
  taskStats: TestTaskStat[];    // per-task completed / skipped / gaveUp + median time-on-task
}
```

### `test_session` — `TestSessionFrameContent`

One completed tester run, rendered as a frame.

```ts
{
  kind: 'test_session';
  testId; sessionId; testerLabel;
  recordingMode;                // 'screen_voice' | 'voice_only' | 'screen_only'
  recordingUrl?; recordingDurationMs?;
  taskResults: TestTaskResult[];      // per-task outcome ('completed' | 'skipped' | 'gave_up') + recordingOffsetMs
  responses?: TestResponseAnswer[];   // questionnaire answers
  transcript?: TranscriptCue[];       // [{ startMs, endMs, text }]
  transcriptStatus;                   // 'pending' | 'processing' | 'done' | 'failed' | 'skipped'
  synthesis?: TestSessionSynthesis;   // AI summary + issues[] (severity, taskId?, atMs?), generatedBy
  completedAt?;
}
```

`recordingOffsetMs` on each task result, and `atMs` on each synthesis issue, let the canvas deep-link the player to a moment. A synthesis issue's "Make this an edit" drops a comment that flows into the normal dispatch pipeline.

## 3. Browser WebSocket — `/ws`

Connect: `ws://localhost:4000/ws?boardId=&userId=&token=`. First message **must** be `{ type: 'hello' }`. Server replies with `welcome` and broadcasts `presence.join`.

### Client → server (`ClientMessage`)

```ts
| { type: 'hello'; boardId; userId; token }
| { type: 'cursor.move'; cursor: { x; y; frameId? } }
| { type: 'selection.update'; selection: { frameId; elementSelector? } | null }
| { type: 'viewport.update'; x; y; zoom }
| { type: 'follow.start'; targetUserId }
| { type: 'follow.stop' }
| { type: 'ping'; ts }
```

### Server → client (`ServerMessage`)

```ts
| { type: 'welcome'; boardId; youUserId; board; users }
| { type: 'presence.join'; user }
| { type: 'presence.leave'; userId }
| { type: 'presence.cursor'; userId; cursor }
| { type: 'presence.selection'; userId; selection }
| { type: 'presence.viewport'; userId; x; y; zoom }
| { type: 'frame.added'; frame }
| { type: 'frame.updated'; frame }
| { type: 'frame.moved'; frameId; x; y }
| { type: 'frame.deleted'; frameId }
| { type: 'comment.added'; comment }
| { type: 'comment.updated'; comment }
| { type: 'comment.reply.added'; commentId; reply }
| { type: 'comment.deleted'; commentId }
| { type: 'dispatch.created'; dispatch }
| { type: 'dispatch.status'; dispatchId; status; event? }
| { type: 'dispatch.done'; dispatch }
| { type: 'branch.added'; branch }
| { type: 'branch.updated'; branch }
| { type: 'mcp.online'; boardId; agentName }
| { type: 'mcp.offline'; boardId }
| { type: 'test.created'; test }
| { type: 'test.updated'; test }
| { type: 'test.deleted'; testId }
| { type: 'test.session.started'; testId; sessionId }
| { type: 'test.session.completed'; testId; session }
| { type: 'pong'; ts }
| { type: 'error'; code; message }
```

The `test.*` messages are how the User Tests surface stays live: `test.created` / `updated` / `deleted` keep the creator's `TestsPanel` in sync, `test.session.started` is the "someone is testing now" indicator, and `test.session.completed` lands the new session. The actual `test_summary` / `test_session` **frames** still arrive over the ordinary `frame.added` / `frame.updated` path — async transcription and synthesis jobs refresh the session frame in place as they finish.

### Throttling

- Cursor moves: server rate-limits to ~30 Hz per sender before re-broadcast.
- Browser client throttles outbound cursor moves with `requestAnimationFrame`.
- Viewport updates debounced ~120 ms.
- Heartbeat: 15 s ping interval, 8 s pong timeout, 2 missed → terminate + reconnect.

---

## 4. MCP WebSocket — `/ws/mcp`

Connect: `ws://localhost:4000/ws/mcp?token=&boardId=&agentName=`. First message **must** be `mcp.hello`.

### MCP → cloud (`McpClientMessage`)

```ts
| { type: 'mcp.hello'; token; boardId; agentName; version; tools }
| { type: 'dispatch.ack'; dispatchId }
| { type: 'dispatch.progress'; dispatchId; event }
| { type: 'dispatch.completed'; dispatchId; resultFrame; newCommitSha }
| { type: 'dispatch.failed'; dispatchId; message }
| { type: 'freeze.captured'; frame }
| { type: 'branches.snapshot'; branches }
| { type: 'pong'; ts }
```

### Cloud → MCP (`McpServerMessage`)

```ts
| { type: 'mcp.welcome'; boardId; tokenAccepted }
| { type: 'dispatch.execute'; dispatch }
| { type: 'freeze.request'; boardId; branchId; commitSha; recipe?; stateLabel? }
| { type: 'ping'; ts }
```

The cloud:
- Promotes `dispatch.status` to `sending` on `ack`, `running` on first `progress`, `done` on `completed`.
- Re-positions the `resultFrame` next to the dispatch's parent before persisting (the MCP doesn't know canvas coordinates).
- Broadcasts `mcp.online` / `mcp.offline` on connect / disconnect so the canvas can show whether dispatches go through a real agent or the in-process simulator.

---

## 5. MCP tools (stdio)

Tool names (from `packages/protocol/src/mcp.ts`):

```ts
MCP_TOOLS = {
  FREEZE:       'foldo_freeze_current_state',
  REPLAY:       'foldo_replay_recipe',
  APPLY_EDIT:   'foldo_apply_edit_prompt',
  LIST_BRANCHES:'foldo_list_branches',
}
```

| Tool | Args | Returns |
| --- | --- | --- |
| `foldo_freeze_current_state` | `FreezeArgs` | `FreezeResult` (a `Frame`) |
| `foldo_replay_recipe` | `ReplayArgs` | `ReplayResult` |
| `foldo_apply_edit_prompt` | `ApplyEditArgs` | `ApplyEditResult` |
| `foldo_list_branches` | `{}` | `ListBranchesResult` |

Full Zod schemas in `apps/mcp/src/mcp/tools/*.ts`.

---

## 6. postMessage bridge (canvas ↔ iframe)

Defined in both [`apps/sample-app/src/bridge/messages.ts`](../apps/sample-app/src/bridge/messages.ts) and mirrored in [`apps/web/src/iframe/messages.ts`](../apps/web/src/iframe/messages.ts).

### Sample app → canvas

```ts
| { type: 'foldo.sample.ready'; commit; variant }
| { type: 'foldo.sample.element.click'; element; rect }
| { type: 'foldo.sample.element.hover'; element; rect }
| { type: 'foldo.sample.element.hover.clear' }
| { type: 'foldo.sample.recipe.completed' }
| { type: 'foldo.sample.recipe.failed'; message }
| { type: 'foldo.sample.scroll'; x; y }
```

### Canvas → sample app

```ts
| { type: 'foldo.sample.setReviewMode'; enabled }
| { type: 'foldo.sample.replayRecipe'; steps }
| { type: 'foldo.sample.setOverrides'; overrides }
```

The origin check on the iframe side is `http://localhost:5173`; override `PARENT_ORIGIN` for production.
