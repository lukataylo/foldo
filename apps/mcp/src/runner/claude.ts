// Real Claude Code invocation. When a dispatch arrives we shell out to the
// `claude` CLI in non-interactive ("print") mode inside the target repo, ask
// it to apply the requested edit, and capture its output. This is the half of
// the pipeline that turns a canvas comment into an actual code mutation.
//
// Safety posture (this runs on a user's real machine):
//   - we use `execFile` with an argv array, never a string-concatenated
//     `exec`, so dispatch text can never break out into the shell;
//   - the child is time-boxed and killed (SIGKILL after a grace period) on
//     timeout so a hung `claude` can't wedge the MCP;
//   - capability detection (`claude --version`) is done once at startup so a
//     missing CLI degrades to the simulated path instead of throwing.

import { execFile } from 'node:child_process';
import type { CommentTarget } from '@foldo/protocol';

/** Hard ceiling on a single `claude` invocation. */
const CLAUDE_TIMEOUT_MS = 4 * 60_000;
/** Short detection call should be near-instant. */
const DETECT_TIMEOUT_MS = 10_000;
/** Cap captured output so a runaway child can't balloon memory. */
const MAX_BUFFER = 8 * 1024 * 1024;

export interface ClaudeCapability {
  /** Whether the `claude` CLI resolved on PATH. */
  available: boolean;
  /** Reported version string, when detected. */
  version?: string;
}

export interface RunClaudeEditInput {
  /** Absolute path to the git repo / working dir Claude should edit. */
  cwd: string;
  /** Natural-language intent from the dispatch. */
  intent: string;
  /** Element / file target carried by the dispatch. */
  target: CommentTarget;
  /** Optional progress sink (wired to dispatch.progress WS messages). */
  emitProgress?: (line: string) => void;
}

export interface RunClaudeEditResult {
  ok: boolean;
  /** Claude's textual summary of what it changed (best-effort). */
  summary: string;
  /** Captured stderr, useful for diagnostics on failure. */
  stderr: string;
  /** Set when the invocation failed (missing CLI, timeout, non-zero exit). */
  error?: string;
}

/**
 * Detect the `claude` CLI once. Never throws — a missing CLI is a normal,
 * expected state that flips the pipeline into simulated mode.
 */
export function detectClaude(): Promise<ClaudeCapability> {
  return new Promise((resolve) => {
    execFile(
      'claude',
      ['--version'],
      { timeout: DETECT_TIMEOUT_MS, windowsHide: true },
      (err, stdout) => {
        if (err) {
          resolve({ available: false });
          return;
        }
        const version = stdout.toString().trim().split('\n')[0]?.trim();
        resolve({ available: true, version: version || undefined });
      },
    );
  });
}

/** Build the human-readable instruction passed to `claude -p`. */
export function buildEditPrompt(intent: string, target: CommentTarget): string {
  const lines: string[] = [];
  lines.push(
    'You are applying a single, focused UI/code edit requested by a reviewer',
    'on the Foldo canvas. Make the smallest change that satisfies the intent.',
    '',
    `Intent: ${intent}`,
  );
  const ctx: string[] = [];
  if (target.elementLabel) ctx.push(`- Element: ${target.elementLabel}`);
  if (target.elementSelector)
    ctx.push(`- Selector: ${target.elementSelector}`);
  if (target.elementFile) {
    ctx.push(
      target.elementLine
        ? `- File: ${target.elementFile}:${target.elementLine}`
        : `- File: ${target.elementFile}`,
    );
  }
  if (ctx.length > 0) {
    lines.push('', 'Target context:', ...ctx);
  }
  lines.push(
    '',
    'Constraints:',
    '- Edit only what the intent requires; do not refactor unrelated code.',
    '- Do not run git commands, do not commit — Foldo handles version control.',
    '- When done, reply with one short sentence describing what you changed.',
  );
  return lines.join('\n');
}

/**
 * Run `claude -p` against the target repo to apply the requested edit.
 * The child is run with an argv array (no shell interpolation), time-boxed,
 * and killed on timeout. Never throws — failures are returned as `ok:false`.
 */
export function runClaudeEdit(
  input: RunClaudeEditInput,
): Promise<RunClaudeEditResult> {
  const { cwd, intent, target, emitProgress } = input;
  const prompt = buildEditPrompt(intent, target);
  const emit = emitProgress ?? (() => {});

  // Non-interactive invocation:
  //   -p / --print               headless, print result and exit
  //   --output-format json       structured single-result envelope
  //   --permission-mode acceptEdits  apply file edits without prompting
  //   --allowedTools <set>       restrict to read/edit tools — no Bash, so
  //                              Claude cannot run git or shell commands
  const args = [
    '-p',
    prompt,
    '--output-format',
    'json',
    '--permission-mode',
    'acceptEdits',
    '--allowedTools',
    'Read Edit Write Glob Grep',
  ];

  return new Promise<RunClaudeEditResult>((resolve) => {
    emit('invoking claude code…');
    let timedOut = false;

    const child = execFile(
      'claude',
      args,
      {
        cwd,
        timeout: CLAUDE_TIMEOUT_MS,
        killSignal: 'SIGKILL',
        maxBuffer: MAX_BUFFER,
        windowsHide: true,
        env: process.env,
      },
      (err, stdout, stderr) => {
        const out = (stdout ?? '').toString();
        const errOut = (stderr ?? '').toString();

        if (timedOut || (err && (err as { killed?: boolean }).killed)) {
          resolve({
            ok: false,
            summary: '',
            stderr: errOut,
            error: `claude timed out after ${CLAUDE_TIMEOUT_MS}ms`,
          });
          return;
        }
        if (err) {
          resolve({
            ok: false,
            summary: '',
            stderr: errOut,
            error: `claude exited with error: ${err.message}`,
          });
          return;
        }

        const summary = parseClaudeOutput(out);
        resolve({ ok: true, summary, stderr: errOut });
      },
    );

    // execFile's own `timeout` already kills the child; this flag lets the
    // callback distinguish a timeout kill from a normal non-zero exit.
    child.on('exit', (_code, signal) => {
      if (signal === 'SIGKILL' || signal === 'SIGTERM') timedOut = true;
    });
  });
}

/**
 * Pull a human summary out of `claude --output-format json`. The CLI emits a
 * JSON envelope with a `result` string; if parsing fails we fall back to the
 * trimmed raw output so we still surface *something* useful.
 */
function parseClaudeOutput(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return 'claude completed with no output';
  try {
    const parsed = JSON.parse(trimmed) as {
      result?: unknown;
      error?: unknown;
    };
    if (typeof parsed.result === 'string' && parsed.result.trim()) {
      return parsed.result.trim();
    }
    if (typeof parsed.error === 'string' && parsed.error.trim()) {
      return parsed.error.trim();
    }
  } catch {
    /* not JSON — fall through to raw */
  }
  // Keep the summary compact for the commit message / progress log.
  return trimmed.length > 240 ? `${trimmed.slice(0, 240)}…` : trimmed;
}
