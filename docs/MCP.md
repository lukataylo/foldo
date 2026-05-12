# MCP server

`apps/mcp` is the **in-directory agent bridge**. It does two jobs:

1. Exposes Foldo as a set of tools to **Claude Code over stdio**, so the agent can freeze state, replay recipes, and apply edit prompts as first-class tool calls.
2. Connects out to the **Foldo cloud over WebSocket** (`/ws/mcp`), so dispatches initiated from the canvas can flow through real, local code execution instead of in-process simulation.

## Modes

| Mode | When | What runs |
| --- | --- | --- |
| `stdio` | Claude Code spawns the binary | MCP stdio server only |
| `bridge` | Headless cloud-side runtime | WS client only |
| `both` | `npm run dev:mcp` in a TTY | Both at once |

Auto-detected on launch:
- If neither `--mode=` nor `FOLDO_CLOUD_BRIDGE=1` is set, and `stdin` is **not a TTY** → `stdio`.
- If a TTY (dev shell) → `both`.
- Force with `--mode=stdio|bridge|both` or `FOLDO_CLOUD_BRIDGE=1`.

## Quick start

```bash
# Bridge to a running cloud + register stdio tools
npm run dev:mcp
```

Output:

```
[foldo-mcp] starting mode=both cloudUrl=http://localhost:4000 boardId=board-acme-landing
[foldo-mcp] connecting to ws://localhost:4000/ws/mcp?token=demo-mcp&boardId=…
[foldo-mcp] MCP stdio ready
[foldo-mcp] connected to cloud
[foldo-mcp] cloud welcomed mcp (board=board-acme-landing, accepted=true)
```

Smoke test the four tools in-process:

```bash
npm run smoke --workspace apps/mcp
```

## Wiring into Claude Code

Add to your Claude Code `settings.json`:

```json
{
  "mcpServers": {
    "foldo": {
      "command": "node",
      "args": ["/absolute/path/to/foldo/apps/mcp/bin/foldo-mcp.mjs"],
      "env": {
        "FOLDO_CLOUD_URL": "http://localhost:4000",
        "FOLDO_BOARD_ID": "board-acme-landing",
        "FOLDO_TOKEN": "demo-mcp"
      }
    }
  }
}
```

When Claude Code launches the binary, it'll be in stdio-only mode by default. Set `FOLDO_CLOUD_BRIDGE=1` if you also want it to attach to the cloud and accept dispatch routing.

## Tools

### `foldo_freeze_current_state`

```ts
{
  boardId: string;
  branchId: string;
  commitSha: string;
  route: string;
  viewport: { width: number; height: number };
  recipe?: RecipeStep[];
  stateLabel?: string;
} → { frame: Frame }
```

Spawn a frame from a (real or sampled) running app, recipe-replay if needed, capture the result, post to cloud.

### `foldo_replay_recipe`

```ts
{ commitSha: string; recipe: RecipeStep[]; url: string }
  → { ok: boolean; endState?: string; error?: string }
```

Verify a state-reaching recipe still works at the given commit. Real impl: Playwright. Prototype: returns `{ ok: true }`.

### `foldo_apply_edit_prompt`

```ts
{
  boardId; branchId; baseCommitSha;
  target: { elementLabel?; elementSelector?; elementFile?; elementLine? };
  intent: string;
  recipe?: RecipeStep[];
}
  → { ok; newCommitSha?; overrides?; commitMessage?; diffSummary?; error? }
```

The headline tool. Real impl shells out to `claude` CLI with a constructed prompt; verifies the recipe still passes; commits and pushes. Prototype uses `simulateEdit` with the same heuristic-driven logic as the in-process cloud simulator.

### `foldo_list_branches`

Returns the three seeded branches matching the cloud (`main`, `feat/cta-revamp`, `feat/pro-tier-highlight`). Real impl: `git branch -a` reconciled with cloud state.

## Environment variables

| Var | Default | Description |
| --- | --- | --- |
| `FOLDO_CLOUD_URL` | `http://localhost:4000` | Cloud server origin |
| `FOLDO_CLOUD_WS_PATH` | `/ws/mcp` | Override if you're proxying |
| `FOLDO_TOKEN` | `demo-mcp` | Bearer token for cloud auth |
| `FOLDO_BOARD_ID` | `board-acme-landing` | Which board this MCP serves |
| `FOLDO_AGENT_NAME` | `Claude Code` | Shown in `mcp.online` broadcasts |
| `FOLDO_SAMPLE_APP_URL` | `http://localhost:5174` | Used when building iframe URLs |
| `FOLDO_CLOUD_BRIDGE` | unset | `1` to enable the WS bridge in non-TTY mode |

## Dispatch lifecycle (real MCP attached)

```
Browser:    POST /api/dispatches { intent }
Cloud:      DB insert; broadcast dispatch.created
Cloud:      WS → MCP: dispatch.execute { dispatch }
MCP:        send dispatch.ack
Cloud:      broadcast dispatch.status (status: sending)
MCP:        send dispatch.progress { 'reading target…' }
Cloud:      broadcast dispatch.status (status: running, event)
… repeat for each progress event …
MCP:        send dispatch.completed { resultFrame, newCommitSha }
Cloud:      reposition result frame next to parent
Cloud:      DB insert frame; broadcast frame.added
Cloud:      broadcast dispatch.status (status: done) + dispatch.done
```

If MCP isn't attached, the cloud's `simulateDispatch` runs the same lifecycle in-process so the canvas behavior is identical.

## What's mocked vs. real

The whole `apps/mcp/src/runner/` directory is the swap-in seam. `editSim.ts` produces a synthetic frame and override (based on intent + target heuristics). To replace with real Claude Code:

1. Add a `runClaudeCli(prompt: string): Promise<EditOutput>` to `src/runner/claudeCli.ts`.
2. Build the prompt in `applyEdit.ts` from the `ApplyEditArgs`.
3. Replace the call to `simulateEdit` with `runClaudeCli`.
4. After it returns, run the recipe via Playwright (`runner/playwright.ts`) to verify state.
5. Commit + push via `simple-git` (already a dep).
6. Capture a fresh frame and return it.
