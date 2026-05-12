// Smoke test for the @foldo/mcp server.
//
// Exercises the four tools directly (no MCP transport) and prints the
// results to stderr. Run with `npm run smoke --workspace apps/mcp`.

import { loadConfig } from '../src/config.ts';
import { runApplyEdit } from '../src/mcp/tools/applyEdit.ts';
import { runFreeze } from '../src/mcp/tools/freeze.ts';
import { runListBranches } from '../src/mcp/tools/listBranches.ts';
import { runReplay } from '../src/mcp/tools/replay.ts';

function log(label: string, value: unknown): void {
  process.stderr.write(
    `\n[smoke] ${label}\n${JSON.stringify(value, null, 2)}\n`,
  );
}

async function main(): Promise<void> {
  const config = loadConfig();

  const branches = await runListBranches({ config });
  log('list_branches', branches);

  const freeze = await runFreeze(
    {
      boardId: config.boardId,
      branchId: 'branch-cta',
      commitSha: 'b2c3d4e',
      route: '/',
      viewport: { width: 1280, height: 800 },
      stateLabel: 'after click [data-testid=cta-primary]',
    },
    { config, cloud: null },
  );
  log('freeze', freeze);

  const replay = await runReplay({
    commitSha: 'b2c3d4e',
    recipe: [{ action: 'goto', target: '/' }],
    url: 'http://localhost:5174',
  });
  log('replay', replay);

  const apply = await runApplyEdit(
    {
      boardId: config.boardId,
      branchId: 'branch-cta',
      baseCommitSha: 'b2c3d4e',
      target: { elementLabel: 'cta-primary' },
      intent: 'change trial duration to 14 days',
    },
    { config, cloud: null },
  );
  log('apply_edit', apply);
}

main().catch((err) => {
  process.stderr.write(`smoke failed: ${(err as Error).stack ?? err}\n`);
  process.exit(1);
});
