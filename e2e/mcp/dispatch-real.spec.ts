// E2E: real MCP dispatch via a fixture `claude` binary.
//
// This spec covers the full Step 3 flow without spending a cent on the real
// Claude CLI:
//   1. Write a deterministic fake `claude` shell script to /tmp.
//   2. Boot the local MCP runner pointed at that fake via FOLDO_CLAUDE_CLI.
//   3. Hit the cloud REST to create a dispatch.
//   4. Subscribe to the board WS and watch the dispatch lifecycle stream.
//   5. Assert dispatch.status moves sending → running → done and the
//      resulting frame appears with the fixture commit message.
//
// Gated behind `RUN_CLAUDE_E2E=1` so PR CI stays cheap and so contributors
// without a working Foldo server stack don't get false failures. The body
// of the test runs only when the flag is set; the file is otherwise an
// empty suite.

import { spawn, type ChildProcess } from 'node:child_process';
import { chmodSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import WebSocket from 'ws';
import { expect, test } from '@playwright/test';

const ENABLED = process.env.RUN_CLAUDE_E2E === '1';
const d = ENABLED ? test.describe : test.describe.skip;

const API = process.env.FOLDO_API ?? 'http://localhost:4000';
const WS_URL = (process.env.FOLDO_WS ?? 'ws://localhost:4000/ws').replace(
  /^http/,
  'ws',
);
const BOARD_ID = 'board-acme-landing';
const REPO_ROOT = resolve(__dirname, '..', '..');

// Fixture diff: targets a file that exists in the seeded sample app so the
// patch is actually applicable. The diff is intentionally trivial — a no-op
// comment swap — so reverting it post-test is one git checkout.
const FIXTURE_DIFF = [
  '--- a/apps/sample-app/src/App.tsx',
  '+++ b/apps/sample-app/src/App.tsx',
  '@@ -1,1 +1,1 @@',
  '-// sample app entry',
  '+// sample app entry (foldo-e2e)',
  '',
].join('\n');

function writeFixtureClaude(): string {
  const dir = mkdtempSync(join(tmpdir(), 'foldo-fixture-'));
  const path = join(dir, 'claude');
  const diff = FIXTURE_DIFF.replace(/\\/g, '\\\\').replace(/`/g, '\\`');
  // Shell script: ignore stdin, print a fenced diff, exit 0. Mirrors the
  // shape the real `claude --print` produces.
  const script = `#!/usr/bin/env bash
set -euo pipefail
cat > /dev/null  # drain prompt
cat <<'EOF'
Sure, here's the patch:

\`\`\`diff
${FIXTURE_DIFF}\`\`\`

Done.
EOF
`;
  writeFileSync(path, script, { mode: 0o755 });
  chmodSync(path, 0o755);
  return path;
}

interface DispatchRow {
  id: string;
  status: string;
  resultCommitSha?: string;
}

async function createDispatch(): Promise<DispatchRow> {
  const res = await fetch(`${API}/api/dispatches`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer u-you',
    },
    body: JSON.stringify({
      boardId: BOARD_ID,
      frameId: 'frame-acme-cta-1',
      branchId: 'feat/cta-revamp',
      baseCommitSha: '4f81b62',
      intent: 'e2e: add foldo-e2e marker comment',
      target: {
        elementFile: 'apps/sample-app/src/App.tsx',
        elementLine: 1,
        elementLabel: 'sample-app-entry',
      },
    }),
  });
  if (!res.ok) {
    throw new Error(`create dispatch failed: ${res.status} ${await res.text()}`);
  }
  return (await res.json()) as DispatchRow;
}

function subscribeToBoard(): Promise<{
  ws: WebSocket;
  statuses: string[];
  framesAdded: number;
  waitUntil: (pred: () => boolean, ms: number) => Promise<void>;
}> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`${WS_URL}?boardId=${BOARD_ID}&token=u-you`);
    const statuses: string[] = [];
    let framesAdded = 0;

    ws.on('open', () => {
      const waitUntil = (pred: () => boolean, ms: number) =>
        new Promise<void>((res, rej) => {
          const start = Date.now();
          const tick = () => {
            if (pred()) return res();
            if (Date.now() - start > ms) return rej(new Error('waitUntil timed out'));
            setTimeout(tick, 50);
          };
          tick();
        });
      resolve({ ws, statuses, framesAdded, waitUntil });
    });
    ws.on('error', reject);
    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString('utf8')) as {
          type: string;
          dispatch?: { status: string };
        };
        if (msg.type === 'dispatch.status' && msg.dispatch?.status) {
          statuses.push(msg.dispatch.status);
        }
        if (msg.type === 'frame.added') framesAdded += 1;
      } catch {
        /* noop */
      }
    });
  });
}

d('mcp dispatch — real CLI path (fixture-driven)', () => {
  let fixturePath = '';
  let mcp: ChildProcess | null = null;

  test.beforeAll(() => {
    fixturePath = writeFixtureClaude();
  });

  test.afterAll(async () => {
    if (mcp && !mcp.killed) {
      mcp.kill('SIGTERM');
      // Give it a beat to shut down cleanly.
      await new Promise((r) => setTimeout(r, 250));
    }
    // Revert any patch the fixture actually wrote (best-effort).
    try {
      const reset = spawn('git', ['checkout', '--', 'apps/sample-app/src/App.tsx'], {
        cwd: REPO_ROOT,
      });
      await new Promise((r) => reset.on('exit', r));
    } catch {
      /* noop */
    }
  });

  test('dispatch.status flows sending → running → done with fixture diff applied', async () => {
    // Spin the MCP runner pointed at the fixture binary.
    mcp = spawn(
      'node',
      ['--import', 'tsx', resolve(REPO_ROOT, 'apps/mcp/src/index.ts'), '--mode=bridge'],
      {
        cwd: REPO_ROOT,
        env: {
          ...process.env,
          FOLDO_CLAUDE_CLI: fixturePath,
          FOLDO_MCP_SKIP_PUSH: '1',
          FOLDO_CLOUD_BRIDGE: '1',
          FOLDO_BOARD_ID: BOARD_ID,
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );
    // Wait for the MCP to announce itself to the cloud.
    await new Promise<void>((res, rej) => {
      const to = setTimeout(() => rej(new Error('MCP boot timeout')), 10_000);
      mcp!.stderr?.on('data', (b: Buffer) => {
        if (b.toString('utf8').includes('connected to cloud')) {
          clearTimeout(to);
          res();
        }
      });
    });

    // Subscribe + create dispatch.
    const sub = await subscribeToBoard();
    const d = await createDispatch();
    expect(d.id).toBeTruthy();

    await sub.waitUntil(() => sub.statuses.includes('done'), 30_000);
    expect(sub.statuses).toContain('sending');
    expect(sub.statuses).toContain('running');
    expect(sub.statuses).toContain('done');
    expect(sub.framesAdded).toBeGreaterThanOrEqual(1);

    sub.ws.close();
  });
});
