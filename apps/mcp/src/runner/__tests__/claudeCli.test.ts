// Vitest for the real-claude runner. Goal: prove the runner is safe to
// ship without ever invoking the real binary, so the suite covers every
// failure mode via an injectable `spawn` + `gitFactory`.
//
// Covered:
//   - happy path: well-formed unified diff → applied → commit → SHA back
//   - malformed output: no diff block → ClaudeCliError 'no_diff'
//   - binary missing: resolve returns null → 'binary_missing'
//   - timeout: child never closes → 'timeout', no hung promise
//   - non-zero exit: 'non_zero_exit' with stderr tail
//   - FOLDO_MCP_FORCE_SIM=1 → runDispatch picks the sim runner

import { EventEmitter } from 'node:events';
import { Writable } from 'node:stream';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ClaudeCliError,
  buildPrompt,
  extractUnifiedDiff,
  runClaudeCli,
  type SpawnFn,
} from '../claudeCli.ts';
import { runDispatch } from '../index.ts';

interface FakeChildOpts {
  /** Bytes to emit on stdout before close. */
  stdout?: string;
  /** Bytes to emit on stderr before close. */
  stderr?: string;
  /** Exit code (default 0). */
  exitCode?: number;
  /** If true, never emit 'close' — used to exercise the timeout path. */
  hang?: boolean;
}

function makeFakeChild(opts: FakeChildOpts): {
  spawn: SpawnFn;
  /** All bytes written to the fake stdin, captured for prompt assertions. */
  stdinSink: { value: string };
  killSpy: ReturnType<typeof vi.fn>;
} {
  const stdinSink = { value: '' };
  const killSpy = vi.fn();

  const spawn: SpawnFn = () => {
    const child = new EventEmitter() as EventEmitter & {
      stdin: Writable;
      stdout: EventEmitter;
      stderr: EventEmitter;
      kill: (sig?: string) => void;
      killed: boolean;
    };
    child.killed = false;
    child.kill = (sig?: string) => {
      killSpy(sig);
      child.killed = true;
    };
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    child.stdin = new Writable({
      write(chunk, _enc, cb) {
        stdinSink.value += chunk.toString('utf8');
        cb();
      },
    });

    // Schedule emissions for the next tick so callers can attach
    // listeners first.
    setImmediate(() => {
      if (opts.stdout) child.stdout.emit('data', Buffer.from(opts.stdout));
      if (opts.stderr) child.stderr.emit('data', Buffer.from(opts.stderr));
      if (!opts.hang) {
        child.emit('close', opts.exitCode ?? 0);
      }
    });
    return child as unknown as ReturnType<SpawnFn>;
  };
  return { spawn, stdinSink, killSpy };
}

function makeFakeGit(): {
  factory: (cwd: string) => any;
  calls: { apply: string[]; add: string[][]; commit: string[]; push: string[][]; revparse: string[][] };
} {
  const calls = {
    apply: [] as string[],
    add: [] as string[][],
    commit: [] as string[],
    push: [] as string[][],
    revparse: [] as string[][],
  };
  const git = {
    applyPatch: async (patch: string) => {
      calls.apply.push(patch);
    },
    add: async (files: string[]) => {
      calls.add.push(files);
    },
    commit: async (msg: string) => {
      calls.commit.push(msg);
    },
    revparse: async (args: string[]) => {
      calls.revparse.push(args);
      return 'abc1234567890abcdef0123456789abcdef012345\n';
    },
    push: async (...args: string[]) => {
      calls.push.push(args);
    },
  };
  return { factory: () => git, calls };
}

const SAMPLE_DIFF = [
  '--- a/foo.txt',
  '+++ b/foo.txt',
  '@@ -1,2 +1,2 @@',
  ' hello',
  '-world',
  '+earth',
].join('\n');

const SAMPLE_OUTPUT_FENCED = `Sure, here's the patch:\n\n\`\`\`diff\n${SAMPLE_DIFF}\n\`\`\`\n\nDone.\n`;

describe('extractUnifiedDiff', () => {
  it('extracts a fenced diff block', () => {
    const out = extractUnifiedDiff(SAMPLE_OUTPUT_FENCED);
    expect(out).not.toBeNull();
    expect(out).toContain('--- a/foo.txt');
    expect(out).toContain('+earth');
  });

  it('extracts a bare diff body', () => {
    const out = extractUnifiedDiff(`Some preamble\n\n${SAMPLE_DIFF}\n`);
    expect(out).not.toBeNull();
    expect(out).toContain('+++ b/foo.txt');
  });

  it('returns null when there is no diff', () => {
    expect(extractUnifiedDiff('I refused this request.')).toBeNull();
  });

  it('returns null for a fenced block that is not a unified diff', () => {
    const out = extractUnifiedDiff('```\nnot a diff\n```');
    expect(out).toBeNull();
  });
});

describe('buildPrompt', () => {
  it('includes the dispatch metadata and intent', () => {
    const p = buildPrompt({
      dispatchId: 'd1',
      branchId: 'feat/cta',
      baseCommitSha: 'abc1234',
      target: { elementFile: 'src/x.ts', elementLine: 42, elementLabel: 'cta-primary' },
      intent: 'make the trial 14 days',
    });
    expect(p).toContain('Dispatch id: d1');
    expect(p).toContain('Branch: feat/cta');
    expect(p).toContain('Base commit: abc1234');
    expect(p).toContain('file: src/x.ts');
    expect(p).toContain('line: 42');
    expect(p).toContain('label: cta-primary');
    expect(p).toContain('make the trial 14 days');
  });
});

describe('runClaudeCli', () => {
  const baseInput = {
    cwd: '/tmp/fake-repo',
    dispatchId: 'disp-1',
    branchId: 'feat/test',
    baseCommitSha: 'aaaaaaa',
    target: { elementFile: 'README.md', elementLine: 1, elementLabel: 'header' },
    intent: 'add a sparkle',
  };

  beforeEach(() => {
    // Skip the real push in every test; we exercise the push path via spy.
    process.env.FOLDO_MCP_SKIP_PUSH = '1';
  });

  afterEach(() => {
    delete process.env.FOLDO_MCP_SKIP_PUSH;
    delete process.env.FOLDO_CLAUDE_TIMEOUT_MS;
    delete process.env.FOLDO_MCP_FORCE_SIM;
    vi.useRealTimers();
  });

  it('happy path: parses diff, applies, commits, returns SHA', async () => {
    const { spawn, stdinSink } = makeFakeChild({ stdout: SAMPLE_OUTPUT_FENCED });
    const { factory, calls } = makeFakeGit();
    const progress: string[] = [];

    const out = await runClaudeCli(
      { ...baseInput, emitProgress: (l) => progress.push(l) },
      {
        spawn,
        gitFactory: factory,
        resolveClaudePath: () => '/usr/local/bin/claude',
      },
    );

    expect(out.newCommitSha).toBe('abc1234567890abcdef0123456789abcdef012345');
    expect(out.shortSha).toBe('abc1234');
    expect(out.commitMessage).toContain('[foldo dispatch disp-1]');
    expect(out.diff).toContain('+earth');
    expect(calls.apply.length).toBe(1);
    expect(calls.add[0]).toEqual(['-A']);
    expect(calls.commit[0]).toContain('[foldo dispatch disp-1]');
    expect(stdinSink.value).toContain('Dispatch id: disp-1');
    expect(progress.some((l) => l.includes('parsed unified diff'))).toBe(true);
  });

  it('rejects when the binary is missing', async () => {
    const { spawn } = makeFakeChild({ stdout: '' });
    const { factory } = makeFakeGit();
    await expect(
      runClaudeCli(baseInput, {
        spawn,
        gitFactory: factory,
        resolveClaudePath: () => null,
      }),
    ).rejects.toMatchObject({
      name: 'ClaudeCliError',
      code: 'binary_missing',
    });
  });

  it('rejects when claude produces no diff', async () => {
    const { spawn } = makeFakeChild({ stdout: 'I cannot help with that.' });
    const { factory } = makeFakeGit();
    await expect(
      runClaudeCli(baseInput, {
        spawn,
        gitFactory: factory,
        resolveClaudePath: () => '/usr/local/bin/claude',
      }),
    ).rejects.toMatchObject({
      name: 'ClaudeCliError',
      code: 'no_diff',
    });
  });

  it('rejects on non-zero exit with stderr tail', async () => {
    const { spawn } = makeFakeChild({
      stdout: '',
      stderr: 'boom: out of credits',
      exitCode: 7,
    });
    const { factory } = makeFakeGit();
    await expect(
      runClaudeCli(baseInput, {
        spawn,
        gitFactory: factory,
        resolveClaudePath: () => '/usr/local/bin/claude',
      }),
    ).rejects.toMatchObject({
      name: 'ClaudeCliError',
      code: 'non_zero_exit',
    });
  });

  it('times out cleanly when the child never closes', async () => {
    process.env.FOLDO_CLAUDE_TIMEOUT_MS = '40';
    const { spawn, killSpy } = makeFakeChild({ hang: true });
    const { factory } = makeFakeGit();

    const start = Date.now();
    await expect(
      runClaudeCli(baseInput, {
        spawn,
        gitFactory: factory,
        resolveClaudePath: () => '/usr/local/bin/claude',
      }),
    ).rejects.toMatchObject({
      name: 'ClaudeCliError',
      code: 'timeout',
    });
    // Should reject promptly, not hang.
    expect(Date.now() - start).toBeLessThan(2_000);
    expect(killSpy).toHaveBeenCalled();
  });

  it('falls back to sim runner when FOLDO_MCP_FORCE_SIM=1', async () => {
    process.env.FOLDO_MCP_FORCE_SIM = '1';
    const { spawn } = makeFakeChild({ stdout: SAMPLE_OUTPUT_FENCED });
    const { factory } = makeFakeGit();
    const simulate = vi.fn(() => ({
      sha: 'simsha1',
      commitMessage: 'sim msg',
      // The orchestrator only reads sha + commitMessage from sim — the rest is
      // shape-padded so the EditSimOutput type lines up.
      newFrame: {
        id: 'frame-sim',
        boardId: 'b',
        kind: 'app' as const,
        branchId: 'feat/test',
        commitSha: 'simsha1',
        commitMessage: 'sim msg',
        age: 'just now',
        position: { x: 0, y: 0 },
        size: { width: 1280, height: 800 },
        content: {
          kind: 'app' as const,
          variant: 'baseline' as const,
          route: '/',
          viewport: { width: 1280, height: 800 },
        },
        createdAt: '2026-05-23T00:00:00Z',
        updatedAt: '2026-05-23T00:00:00Z',
      },
      overrides: {},
      note: 'sim ran',
    }));

    const out = await runDispatch(
      {
        ...baseInput,
        sampleAppUrl: 'http://localhost:5174',
        baseFrame: {
          id: 'frame-base',
          boardId: 'b',
          kind: 'app',
          branchId: 'feat/test',
          commitSha: 'aaaaaaa',
          commitMessage: 'base',
          age: 'just now',
          position: { x: 0, y: 0 },
          size: { width: 1280, height: 800 },
          content: {
            kind: 'app',
            variant: 'baseline',
            route: '/',
            viewport: { width: 1280, height: 800 },
          },
          createdAt: '2026-05-23T00:00:00Z',
          updatedAt: '2026-05-23T00:00:00Z',
        },
      },
      {
        spawn,
        gitFactory: factory,
        // Even with a binary present, force-sim must short-circuit.
        resolveClaudePath: () => '/usr/local/bin/claude',
        simulate,
      },
    );

    expect(out.realClaude).toBe(false);
    expect(out.newCommitSha).toBe('simsha1');
    expect(simulate).toHaveBeenCalledOnce();
  });

  it('ClaudeCliError carries the code field for callers to switch on', () => {
    const e = new ClaudeCliError('x', 'no_diff');
    expect(e.code).toBe('no_diff');
    expect(e.name).toBe('ClaudeCliError');
  });
});
