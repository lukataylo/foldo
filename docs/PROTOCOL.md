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

---

## 2. Browser WebSocket — `/ws`

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
| { type: 'pong'; ts }
| { type: 'error'; code; message }
```

### Throttling

- Cursor moves: server rate-limits to ~30 Hz per sender before re-broadcast.
- Browser client throttles outbound cursor moves with `requestAnimationFrame`.
- Viewport updates debounced ~120 ms.
- Heartbeat: 15 s ping interval, 8 s pong timeout, 2 missed → terminate + reconnect.

---

## 3. MCP WebSocket — `/ws/mcp`

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

## 4. MCP tools (stdio)

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

## 5. postMessage bridge (canvas ↔ iframe)

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
