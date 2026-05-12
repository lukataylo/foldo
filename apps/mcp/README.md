# @foldo/mcp

In-directory MCP server that bridges Claude Code to the Foldo cloud canvas.

The server has two halves:

1. **stdio MCP server** — exposes four `foldo_*` tools to Claude Code over
   the standard MCP stdio transport.
2. **Cloud WebSocket bridge** — connects to the cloud at `ws://localhost:4000/ws/mcp`
   to receive `dispatch.execute` / `freeze.request` events and emit
   `dispatch.progress` / `dispatch.completed` / `freeze.captured`.

Both halves share the same tool logic, so a Claude Code tool call and a
cloud-initiated dispatch produce identical end states.

## Tools

| Name                          | Purpose                                                                 |
| ----------------------------- | ----------------------------------------------------------------------- |
| `foldo_freeze_current_state`  | Capture a frame from the running app for a given branch/commit/route.   |
| `foldo_replay_recipe`         | Replay a UI recipe (clicks, fills, navigation) and report success.      |
| `foldo_apply_edit_prompt`     | Apply an edit per intent + target, commit, and emit a follow-up frame.  |
| `foldo_list_branches`         | List branches known to the local repo + cloud.                          |

Tool input/output shapes come from `@foldo/protocol/mcp.ts`.

## Wiring Claude Code

Add to `~/.config/claude-code/settings.json` (or the equivalent for your
install):

```json
{
  "mcpServers": {
    "foldo": {
      "command": "node",
      "args": ["/abs/path/to/foldo/apps/mcp/bin/foldo-mcp.mjs"]
    }
  }
}
```

(The wrapper at `bin/foldo-mcp.mjs` runs the TS entry via `tsx` so no
compile step is required.)

## Running standalone

```bash
# both halves (default) — stdio + cloud bridge
npm run dev:mcp

# only the stdio server
node apps/mcp/bin/foldo-mcp.mjs --mode=stdio

# only the cloud bridge
node apps/mcp/bin/foldo-mcp.mjs --mode=bridge
```

When launched without a TTY (typical for Claude Code), the server defaults
to **stdio-only**. Set `FOLDO_CLOUD_BRIDGE=1` to also open the cloud WS in
that case.

## Environment variables

| Var                    | Default                | Purpose                                   |
| ---------------------- | ---------------------- | ----------------------------------------- |
| `FOLDO_CLOUD_URL`      | `http://localhost:4000`| Origin of the cloud server                |
| `FOLDO_CLOUD_WS_PATH`  | `/ws/mcp`              | MCP WebSocket path                        |
| `FOLDO_TOKEN`          | `demo-mcp`             | Token sent with the `mcp.hello` message   |
| `FOLDO_BOARD_ID`       | `board-acme-landing`   | Board the MCP is paired with              |
| `FOLDO_AGENT_NAME`     | `Claude Code`          | Display name reported to the cloud        |
| `FOLDO_SAMPLE_APP_URL` | `http://localhost:5174`| Sample app dev URL used in iframe URLs    |
| `FOLDO_CLOUD_BRIDGE`   | `0`                    | Force-enable bridge in stdio-only mode    |

## Smoke test

```bash
npm run smoke --workspace apps/mcp
```

Calls each of the four tools in-process and prints results to stderr.

## Notes / deviations

- The `bin` field points to a small `.mjs` wrapper that runs `src/index.ts`
  via `tsx`. The protocol package exports `.ts` source directly, which
  rules out a plain `tsc` emit; using `tsx` keeps the runtime simple.
- `build` runs `tsc -b` with `noEmit: true` (matches `apps/server`'s
  setup) — it's a typecheck, not a JS emit.
- Playwright capture is optional. If `playwright` isn't installed, the
  freeze tool still returns a synthetic frame with an `iframeUrl` the
  cloud canvas can render.
- `simple-git` is wired up behind a try-catch — listing branches still
  works in the absence of a real local repo by returning the seed set.
