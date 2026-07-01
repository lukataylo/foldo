// Real Claude Code CLI runner.
//
// Replaces the heuristic `editSim.ts` flow for production use: shells out to
// the local `claude` binary, feeds it a structured prompt describing the
// dispatch (intent + target file/line + branch + base SHA + a context window
// of source around the target line), captures stdout, extracts the unified
// diff Claude Code emits, applies it via simple-git, commits with a
// deterministic message tagged `[foldo dispatch <id>]`, and pushes to the
// branch the dispatch targeted. Returns the new commit SHA so the existing
// dispatch lifecycle code can pin a result frame to the canvas.
//
// Designed to be testable: the `spawn` factory and `gitFactory` are
// injectable. Tests can substitute a fake spawn that emits a canned diff
// and a fake git that records the apply/commit/push calls — without ever
// touching the real `claude` binary or a real working tree.
//
// Failure modes:
//   - `claude` not on PATH (and not pointed at by FOLDO_CLAUDE_CLI) →
//     reject with a clear error. Caller surfaces `dispatch.failed`.
//   - Claude exits non-zero → reject with stderr tail.
//   - Stdout has no recognisable unified-diff block → reject with
//     "claude produced no diff" — callers surface as `dispatch.failed`.
//   - Diff fails to apply (conflict, missing file) → reject with the
//     simple-git error message.
//   - Timeout (default 5min, env `FOLDO_CLAUDE_TIMEOUT_MS`) → kill the
//     child, reject with "claude timed out after Xms". The promise
//     resolves cleanly — no hung process, no leaked listeners.

import { spawn as nodeSpawn } from 'node:child_process';
import type { ChildProcess, SpawnOptions } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve as resolvePath } from 'node:path';
import { simpleGit } from 'simple-git';
import type { SimpleGit } from 'simple-git';

import type { CommentTarget } from '@foldo/protocol';

export interface ClaudeCliRunInput {
  /** Working tree to apply edits in. Defaults to process.cwd(). */
  cwd?: string;
  /** Dispatch id, used in the commit message. */
  dispatchId: string;
  /** Branch the dispatch is targeting (commit will be on this branch). */
  branchId: string;
  /** Base commit SHA the dispatch was launched against. */
  baseCommitSha: string;
  /** Element / file target. */
  target: CommentTarget;
  /** Natural-language intent describing what the user wants. */
  intent: string;
  /** Optional progress callback for streaming logs to the cloud. */
  emitProgress?: (line: string) => void;
}

export interface ClaudeCliRunOutput {
  /** Full new commit SHA. */
  newCommitSha: string;
  /** Short SHA (7 chars) for display. */
  shortSha: string;
  /** Commit message used. */
  commitMessage: string;
  /** Raw unified diff that was applied. */
  diff: string;
}

/**
 * Minimal subset of `node:child_process.spawn` we depend on. Tests inject a
 * fake that returns an EventEmitter-shaped child without touching the OS.
 */
export type SpawnFn = (
  command: string,
  args: readonly string[],
  options: SpawnOptions,
) => ChildProcess;

export type GitFactory = (cwd: string) => SimpleGit;

export interface ClaudeCliDeps {
  spawn?: SpawnFn;
  gitFactory?: GitFactory;
  /** Override for `which claude` resolution; bypass with a direct path. */
  resolveClaudePath?: () => string | null;
}

const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;

function getTimeoutMs(): number {
  const v = process.env.FOLDO_CLAUDE_TIMEOUT_MS;
  if (!v) return DEFAULT_TIMEOUT_MS;
  const n = Number.parseInt(v, 10);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_TIMEOUT_MS;
  return n;
}

/**
 * Best-effort resolution of the `claude` binary path. Honors
 * `FOLDO_CLAUDE_CLI` first; otherwise probes PATH via `which`-equivalent.
 */
export function resolveClaudeBinary(): string | null {
  const override = process.env.FOLDO_CLAUDE_CLI;
  if (override && override.length > 0) {
    if (existsSync(override)) return override;
    // Treat as bare name and let spawn search PATH.
    return override;
  }
  // Scan $PATH for a `claude` entry. We do this manually rather than
  // shelling out to `which` to keep this synchronous and testable.
  const pathEnv = process.env.PATH ?? '';
  const sep = process.platform === 'win32' ? ';' : ':';
  const exts = process.platform === 'win32' ? ['.exe', '.cmd', '.bat', ''] : [''];
  for (const dir of pathEnv.split(sep)) {
    if (!dir) continue;
    for (const ext of exts) {
      const candidate = resolvePath(dir, `claude${ext}`);
      try {
        if (existsSync(candidate)) return candidate;
      } catch {
        /* noop */
      }
    }
  }
  return null;
}

/**
 * Reads a window of lines around `elementLine` (1-indexed) from
 * `elementFile`, to give Claude code context without sending the whole file.
 * Returns null if the file can't be read or the target isn't set.
 */
function readContextWindow(
  cwd: string,
  target: CommentTarget,
  windowLines = 80,
): string | null {
  if (!target.elementFile) return null;
  const path = resolvePath(cwd, target.elementFile);
  let raw: string;
  try {
    raw = readFileSync(path, 'utf8');
  } catch {
    return null;
  }
  const lines = raw.split(/\r?\n/);
  const line = Math.max(1, target.elementLine ?? 1);
  const start = Math.max(0, line - 1 - Math.floor(windowLines / 2));
  const end = Math.min(lines.length, start + windowLines);
  const numbered = lines
    .slice(start, end)
    .map((l, i) => `${String(start + i + 1).padStart(5, ' ')}  ${l}`)
    .join('\n');
  return numbered;
}

/** Build the prompt we pipe to `claude` over stdin. */
export function buildPrompt(input: ClaudeCliRunInput): string {
  const cwd = input.cwd ?? process.cwd();
  const ctx = readContextWindow(cwd, input.target);
  const targetLines = [
    input.target.elementFile ? `file: ${input.target.elementFile}` : null,
    input.target.elementLine ? `line: ${input.target.elementLine}` : null,
    input.target.elementLabel ? `label: ${input.target.elementLabel}` : null,
    input.target.elementSelector ? `selector: ${input.target.elementSelector}` : null,
  ]
    .filter(Boolean)
    .join('\n');

  return [
    `You are running inside the Foldo MCP dispatch pipeline.`,
    `Branch: ${input.branchId}`,
    `Base commit: ${input.baseCommitSha}`,
    `Dispatch id: ${input.dispatchId}`,
    ``,
    `Target:`,
    targetLines || '(no target metadata)',
    ``,
    ctx ? `Source context (window around target line):\n${ctx}\n` : '',
    `Intent:`,
    input.intent.trim(),
    ``,
    `Apply the smallest edit that satisfies the intent.`,
    `Emit your final patch as a single fenced unified diff block:`,
    '```diff',
    '--- a/path/to/file',
    '+++ b/path/to/file',
    '@@ ... @@',
    '...',
    '```',
    `Do not include any other code blocks. Keep prose terse.`,
  ].join('\n');
}

/**
 * Extract the first unified diff from Claude's stdout. Accepts both fenced
 * (```diff ... ```) and bare (--- a/... +++ b/... @@) forms. Returns null
 * if nothing diff-shaped is present.
 */
export function extractUnifiedDiff(stdout: string): string | null {
  // 1. Fenced diff block.
  const fence = stdout.match(/```(?:diff|patch)?\s*\n([\s\S]*?)\n```/);
  if (fence && fence[1]) {
    const inner = fence[1].trim();
    if (looksLikeUnifiedDiff(inner)) return inner + '\n';
  }
  // 2. Bare diff, scan for the first `--- a/` and slurp through to either
  // EOF or the next blank-line+non-diff transition.
  const idx = stdout.search(/^--- a\//m);
  if (idx >= 0) {
    const tail = stdout.slice(idx);
    if (looksLikeUnifiedDiff(tail)) return tail.trimEnd() + '\n';
  }
  return null;
}

function looksLikeUnifiedDiff(s: string): boolean {
  return /^--- a\/.+\n\+\+\+ b\/.+\n@@/m.test(s);
}

export class ClaudeCliError extends Error {
  constructor(
    message: string,
    public readonly code:
      | 'binary_missing'
      | 'spawn_failed'
      | 'non_zero_exit'
      | 'timeout'
      | 'no_diff'
      | 'apply_failed'
      | 'commit_failed'
      | 'push_failed',
    public readonly stderr?: string,
  ) {
    super(message);
    this.name = 'ClaudeCliError';
  }
}

/**
 * Spawn `claude`, feed it the prompt over stdin, collect stdout+stderr,
 * honour the timeout. Returns the captured stdout on success, throws a
 * `ClaudeCliError` on any failure mode.
 */
async function runClaude(
  binary: string,
  prompt: string,
  timeoutMs: number,
  spawn: SpawnFn,
  emitProgress: (line: string) => void,
): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    let child: ChildProcess;
    try {
      child = spawn(binary, ['--print'], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: process.env,
      });
    } catch (err) {
      reject(
        new ClaudeCliError(
          `failed to spawn claude: ${(err as Error).message}`,
          'spawn_failed',
        ),
      );
      return;
    }

    let stdoutBuf = '';
    let stderrBuf = '';
    let timedOut = false;
    let settled = false;

    const timer = setTimeout(() => {
      timedOut = true;
      try {
        child.kill('SIGTERM');
      } catch {
        /* noop */
      }
      // Force-kill after a short grace period.
      const killTimer = setTimeout(() => {
        try {
          if (!child.killed) child.kill('SIGKILL');
        } catch {
          /* noop */
        }
      }, 1500);
      if (typeof (killTimer as { unref?: () => void }).unref === 'function') {
        (killTimer as { unref: () => void }).unref();
      }
      // Settle the promise immediately on timeout — we don't wait for the
      // child's 'close' event because (a) the process may be wedged and
      // (b) tests inject fakes that don't emulate kill semantics.
      settle(() =>
        reject(
          new ClaudeCliError(
            `claude timed out after ${timeoutMs}ms`,
            'timeout',
            stderrBuf,
          ),
        ),
      );
    }, timeoutMs);

    function settle(fn: () => void): void {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn();
    }

    child.stdout?.on('data', (chunk: Buffer) => {
      stdoutBuf += chunk.toString('utf8');
    });
    child.stderr?.on('data', (chunk: Buffer) => {
      const s = chunk.toString('utf8');
      stderrBuf += s;
      // Forward terse progress lines from claude to the cloud log.
      for (const line of s.split('\n')) {
        const trimmed = line.trim();
        if (trimmed) emitProgress(`[claude] ${trimmed}`);
      }
    });

    child.on('error', (err) => {
      settle(() =>
        reject(
          new ClaudeCliError(
            `claude spawn error: ${err.message}`,
            'spawn_failed',
            stderrBuf,
          ),
        ),
      );
    });

    child.on('close', (code) => {
      if (timedOut) return; // timeout path already settled.
      settle(() => {
        if (code !== 0) {
          reject(
            new ClaudeCliError(
              `claude exited with code ${code}: ${stderrBuf.slice(-400)}`,
              'non_zero_exit',
              stderrBuf,
            ),
          );
          return;
        }
        resolve(stdoutBuf);
      });
    });

    try {
      child.stdin?.write(prompt);
      child.stdin?.end();
    } catch (err) {
      settle(() =>
        reject(
          new ClaudeCliError(
            `failed to write prompt to claude stdin: ${(err as Error).message}`,
            'spawn_failed',
            stderrBuf,
          ),
        ),
      );
    }
  });
}

/**
 * Main entry point. Resolves the binary, spawns claude, applies the diff,
 * commits, pushes. All side effects are reachable via injected deps so the
 * vitest suite can exercise the full happy / sad paths without I/O.
 */
export async function runClaudeCli(
  input: ClaudeCliRunInput,
  deps: ClaudeCliDeps = {},
): Promise<ClaudeCliRunOutput> {
  const emit = input.emitProgress ?? (() => {});
  const spawn = deps.spawn ?? (nodeSpawn as SpawnFn);
  const gitFactory =
    deps.gitFactory ?? ((cwd: string) => simpleGit({ baseDir: cwd }));
  const resolveBinary = deps.resolveClaudePath ?? resolveClaudeBinary;
  const cwd = input.cwd ?? process.cwd();

  const binary = resolveBinary();
  if (!binary) {
    throw new ClaudeCliError(
      'claude CLI not found on PATH (set FOLDO_CLAUDE_CLI to override)',
      'binary_missing',
    );
  }

  emit(`invoking claude at ${binary}`);
  const prompt = buildPrompt(input);
  const stdout = await runClaude(
    binary,
    prompt,
    getTimeoutMs(),
    spawn,
    emit,
  );

  const diff = extractUnifiedDiff(stdout);
  if (!diff) {
    throw new ClaudeCliError(
      'claude produced no recognisable unified diff in its output',
      'no_diff',
    );
  }
  emit(`parsed unified diff (${diff.split('\n').length} lines)`);

  const git = gitFactory(cwd);

  // Make sure the working tree is on the branch the dispatch targets.
  // Previously the diff was applied and committed to whatever happened to
  // be checked out (often main) while the push named the dispatch branch —
  // the result frame's commitSha then pointed at a commit that isn't on
  // the dispatch's branch at all.
  const gitBranch = gitBranchNameFor(input.branchId);
  try {
    const current = (await git.revparse(['--abbrev-ref', 'HEAD'])).trim();
    if (current !== gitBranch) {
      emit(`checking out ${gitBranch} (working tree was on ${current})`);
      try {
        await git.checkout(gitBranch);
      } catch {
        // Branch doesn't exist locally yet — create it from HEAD. NOT from
        // input.baseCommitSha: Foldo commit shas are synthetic (nanoid) for
        // seeded/simulated/captured frames, so `checkout -b <branch> <sha>`
        // would fail on "unknown revision" and hard-fail the dispatch.
        await git.checkout(['-b', gitBranch]);
      }
    }
  } catch (err) {
    throw new ClaudeCliError(
      `failed to check out target branch ${gitBranch}: ${(err as Error).message}`,
      'apply_failed',
    );
  }

  try {
    await git.applyPatch(diff, ['--whitespace=nowarn']);
  } catch (err) {
    throw new ClaudeCliError(
      `git apply failed: ${(err as Error).message}`,
      'apply_failed',
    );
  }
  emit('applied diff to working tree');

  const commitMessage = buildCommitMessage(input);
  try {
    await git.add(['-A']);
    await git.commit(commitMessage);
  } catch (err) {
    throw new ClaudeCliError(
      `git commit failed: ${(err as Error).message}`,
      'commit_failed',
    );
  }

  // Read back the new HEAD SHA. simple-git's revparse is the simplest way.
  let fullSha: string;
  try {
    fullSha = (await git.revparse(['HEAD'])).trim();
  } catch (err) {
    throw new ClaudeCliError(
      `failed to read new HEAD sha: ${(err as Error).message}`,
      'commit_failed',
    );
  }
  const shortSha = fullSha.slice(0, 7);
  emit(`committed ${shortSha}`);

  // Push if we have a remote configured for this branch. In tests there's
  // no remote, so we tolerate the push failing.
  if (process.env.FOLDO_MCP_SKIP_PUSH !== '1') {
    try {
      // Push the derived git branch name — a raw board-scoped Foldo id
      // (`boardId:name`) is parsed by git as a SRC:DST refspec.
      await git.push('origin', gitBranch);
      emit(`pushed to origin/${gitBranch}`);
    } catch (err) {
      // Push failures are non-fatal — the commit exists locally. Surface
      // a warning to the log but don't fail the dispatch.
      emit(`push warning: ${(err as Error).message}`);
    }
  }

  return {
    newCommitSha: fullSha,
    shortSha,
    commitMessage,
    diff,
  };
}

/**
 * Foldo board-scoped branch ids are `${boardId}:${name}`; the git branch is
 * the name part. Legacy/seeded branches use the bare name as their id.
 */
export function gitBranchNameFor(branchId: string): string {
  const i = branchId.indexOf(':');
  return i >= 0 ? branchId.slice(i + 1) : branchId;
}

export function buildCommitMessage(input: ClaudeCliRunInput): string {
  const intentSummary = input.intent.split('\n')[0]?.trim().slice(0, 60) ?? '';
  const subject = intentSummary || 'apply edit per foldo dispatch';
  return `${subject}\n\n[foldo dispatch ${input.dispatchId}]`;
}
