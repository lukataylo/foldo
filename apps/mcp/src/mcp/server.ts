// MCP server wiring. Exposes the four foldo_* tools over stdio. The handlers
// dispatch to the same logic that the cloud-bridge calls into, so a tool
// invocation from Claude Code and a dispatch from the cloud produce the
// same end state.

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { MCP_TOOLS } from '@foldo/protocol';
import type { FoldoMcpConfig } from '../config.ts';
import type { CloudClient } from '../cloud/wsClient.ts';
import {
  applyEditInputSchema,
  applyEditJsonSchema,
  runApplyEdit,
} from './tools/applyEdit.ts';
import {
  freezeInputSchema,
  freezeJsonSchema,
  runFreeze,
} from './tools/freeze.ts';
import {
  listBranchesInputSchema,
  listBranchesJsonSchema,
  runListBranches,
} from './tools/listBranches.ts';
import {
  replayInputSchema,
  replayJsonSchema,
  runReplay,
} from './tools/replay.ts';

export interface McpServerDeps {
  config: FoldoMcpConfig;
  cloud: CloudClient | null;
  log: (line: string) => void;
}

export async function startMcpStdioServer(deps: McpServerDeps): Promise<{
  stop: () => Promise<void>;
}> {
  const { config, cloud, log } = deps;
  const server = new Server(
    { name: 'foldo-mcp', version: config.version },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: MCP_TOOLS.FREEZE,
        description:
          'Capture a frame from the running app at the given branch/commit/route and post it to the Foldo canvas.',
        inputSchema: freezeJsonSchema,
      },
      {
        name: MCP_TOOLS.REPLAY,
        description:
          'Replay a UI recipe (clicks, fills, navigation) against a running app URL and report whether the end state was reached.',
        inputSchema: replayJsonSchema,
      },
      {
        name: MCP_TOOLS.APPLY_EDIT,
        description:
          'Apply a code edit described by an intent against a target element, commit the result, and emit a follow-up frame.',
        inputSchema: applyEditJsonSchema,
      },
      {
        name: MCP_TOOLS.LIST_BRANCHES,
        description: 'List branches known to the local repo + cloud.',
        inputSchema: listBranchesJsonSchema,
      },
    ],
  }));

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const name = req.params.name;
    const args = (req.params.arguments ?? {}) as Record<string, unknown>;

    try {
      switch (name) {
        case MCP_TOOLS.FREEZE: {
          const parsed = freezeInputSchema.parse(args);
          const result = await runFreeze(parsed, { config, cloud });
          return toolJsonResult(result);
        }
        case MCP_TOOLS.REPLAY: {
          const parsed = replayInputSchema.parse(args);
          const result = await runReplay(parsed);
          return toolJsonResult(result);
        }
        case MCP_TOOLS.APPLY_EDIT: {
          const parsed = applyEditInputSchema.parse(args);
          const result = await runApplyEdit(parsed, { config, cloud }, {
            emitProgress: (line) => log(`[apply_edit] ${line}`),
          });
          // The tool's contract is "…and emit a follow-up frame": post the
          // result frame to the canvas when the cloud bridge is up. Without
          // this, stdio-initiated edits committed + pushed but never showed
          // anything on the board. (cloud.send queues while disconnected.)
          if (cloud) {
            cloud.send({ type: 'freeze.captured', frame: result.resultFrame });
          }
          // Strip the internal `resultFrame` before returning to the caller —
          // the public ApplyEditResult shape doesn't include it.
          const { resultFrame: _resultFrame, ...publicResult } = result;
          return toolJsonResult(publicResult);
        }
        case MCP_TOOLS.LIST_BRANCHES: {
          listBranchesInputSchema.parse(args);
          const result = await runListBranches({ config });
          return toolJsonResult(result);
        }
        default:
          return toolErrorResult(`unknown tool: ${String(name)}`);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log(`tool ${name} failed: ${message}`);
      return toolErrorResult(message);
    }
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
  log('MCP stdio ready');

  return {
    async stop(): Promise<void> {
      try {
        await server.close();
      } catch {
        /* noop */
      }
    },
  };
}

function toolJsonResult(value: unknown): {
  content: Array<{ type: 'text'; text: string }>;
} {
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(value, null, 2),
      },
    ],
  };
}

function toolErrorResult(message: string): {
  content: Array<{ type: 'text'; text: string }>;
  isError: true;
} {
  return {
    content: [{ type: 'text', text: `error: ${message}` }],
    isError: true,
  };
}
