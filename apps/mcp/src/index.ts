#!/usr/bin/env node
// Entry point for @foldo/mcp.
//
// Two run modes:
//   - stdio: only the MCP server (used when Claude Code spawns the binary)
//   - bridge: only the cloud WS client (used in tests/dev when we want to
//     run the cloud half headlessly)
//   - both: stdio + cloud bridge (default for `npm run dev`)
//
// CLI:
//   --mode=stdio|bridge|both
//
// Heuristics:
//   - if neither --mode nor FOLDO_CLOUD_BRIDGE is set and stdin is not a
//     TTY, we assume Claude Code launched us → stdio only
//   - if FOLDO_CLOUD_BRIDGE=1, we add the bridge
//   - if launched via `tsx watch` (TTY present), default to "both"

import { loadConfig } from './config.ts';
import { startMcpStdioServer } from './mcp/server.ts';
import { createCloudClient } from './cloud/wsClient.ts';
import { runApplyEdit } from './mcp/tools/applyEdit.ts';
import { runFreeze } from './mcp/tools/freeze.ts';
import { runClaudeDoctor } from './runner/claudeDoctor.ts';
import type { Dispatch, RecipeStep } from '@foldo/protocol';

type Mode = 'stdio' | 'bridge' | 'both';

function parseMode(argv: string[]): Mode | null {
  for (const arg of argv) {
    if (arg.startsWith('--mode=')) {
      const v = arg.slice('--mode='.length);
      if (v === 'stdio' || v === 'bridge' || v === 'both') return v;
    }
  }
  return null;
}

function pickMode(argv: string[]): Mode {
  const explicit = parseMode(argv);
  if (explicit) return explicit;
  const bridgeEnv = process.env.FOLDO_CLOUD_BRIDGE === '1';
  const isTty = process.stdin.isTTY === true;
  if (!isTty) return bridgeEnv ? 'both' : 'stdio';
  // TTY (dev shell, `tsx watch`) → run everything.
  return 'both';
}

/** Log helper that NEVER writes to stdout, stdout is reserved for the MCP
 *  JSON-RPC transport. Everything else goes to stderr. */
function makeLogger(prefix: string): (line: string) => void {
  return (line: string) => {
    try {
      process.stderr.write(`[${prefix}] ${line}\n`);
    } catch {
      /* noop */
    }
  };
}

async function main(): Promise<void> {
  const mode = pickMode(process.argv.slice(2));
  const config = loadConfig();
  const log = makeLogger('foldo-mcp');

  log(
    `starting mode=${mode} cloudUrl=${config.cloudUrl} boardId=${config.boardId}`,
  );

  // Preflight: check claude CLI availability and version. Logs but never
  // throws — a missing binary is fine if the user has FOLDO_MCP_FORCE_SIM=1.
  const forceSim = process.env.FOLDO_MCP_FORCE_SIM === '1';
  await runClaudeDoctor(log, { forceSim });

  let cloud: ReturnType<typeof createCloudClient> | null = null;

  if (mode === 'bridge' || mode === 'both') {
    cloud = createCloudClient(
      config,
      {
        async onDispatchExecute(d: Dispatch): Promise<void> {
          if (!cloud) return;
          cloud.send({ type: 'dispatch.ack', dispatchId: d.id });
          const emitProgress = (line: string): void => {
            cloud?.send({
              type: 'dispatch.progress',
              dispatchId: d.id,
              event: {
                ts: new Date().toISOString(),
                level: 'info',
                message: line,
              },
            });
          };
          // Surface the canvas-side worktree selection (if any) into the
          // dispatch log so a user inspecting a run can see where it ran.
          // The runApplyEdit pipeline doesn't yet honour the hint as cwd —
          // that's a follow-up; logging it is the first step.
          if (d.worktreeHint && d.worktreeHint.trim()) {
            emitProgress(`worktree hint: ${d.worktreeHint.trim()}`);
          }
          try {
            const result = await runApplyEdit(
              {
                boardId: d.boardId,
                branchId: d.branchId,
                baseCommitSha: d.baseCommitSha,
                target: d.target,
                intent: d.intent,
              },
              { config, cloud },
              { dispatch: d, emitProgress },
            );
            cloud.send({
              type: 'dispatch.completed',
              dispatchId: d.id,
              resultFrame: result.resultFrame,
              newCommitSha: result.newCommitSha ?? result.resultFrame.commitSha,
            });
          } catch (err) {
            cloud.send({
              type: 'dispatch.failed',
              dispatchId: d.id,
              message: err instanceof Error ? err.message : String(err),
            });
          }
        },
        async onFreezeRequest(req: {
          boardId: string;
          branchId: string;
          commitSha: string;
          recipe?: RecipeStep[];
          stateLabel?: string;
        }): Promise<void> {
          await runFreeze(
            {
              boardId: req.boardId,
              branchId: req.branchId,
              commitSha: req.commitSha,
              route: '/',
              viewport: { width: 1280, height: 800 },
              recipe: req.recipe,
              stateLabel: req.stateLabel,
            },
            { config, cloud },
          );
        },
      },
      log,
    );
    cloud.start();
  }

  if (mode === 'stdio' || mode === 'both') {
    await startMcpStdioServer({ config, cloud, log });
  }

  const shutdown = async (signal: string): Promise<void> => {
    log(`received ${signal}, shutting down`);
    cloud?.stop();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((err) => {
  process.stderr.write(`[foldo-mcp] fatal: ${(err as Error).stack ?? err}\n`);
  process.exit(1);
});
