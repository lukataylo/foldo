// Local git operations.
//
// Two layers live here:
//   - seed branches the cloud already knows (`listSeedBranches`), used as a
//     fallback when we're not running inside a real repo;
//   - real git, driven through `execFile('git', [...])` with argv arrays so
//     nothing interpolated (branch names, commit messages) can break out
//     into a shell.
//
// Safety posture (this runs against a user's real repo):
//   - we never force-push and never `reset --hard` / `clean`;
//   - all work happens on a dedicated `foldo/edit-*` branch created off the
//     dispatch's base; the user's original branch is checked out again
//     afterwards in a `finally`;
//   - push is opt-in only (FOLDO_MCP_PUSH=1); the default is commit-locally.

import { execFile } from 'node:child_process';
import type { Branch, BoardId } from '@foldo/protocol';

const SEED_USER = 'user-luka';
const GIT_TIMEOUT_MS = 30_000;
const PUSH_TIMEOUT_MS = 60_000;

function isoDays(daysAgo: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - daysAgo);
  return d.toISOString();
}

/** Seed branches that match what the cloud server seeds, same IDs, names,
 *  colors, and head SHAs so list_branches answers consistently. */
export function listSeedBranches(boardId: BoardId): Branch[] {
  return [
    {
      id: 'main',
      boardId,
      name: 'main',
      authoredBy: 'human',
      authorUserId: SEED_USER,
      color: '#9a9a9a',
      headSha: 'a7c1d29',
      createdAt: isoDays(14),
      updatedAt: isoDays(1),
    },
    {
      id: 'feat/cta-revamp',
      boardId,
      name: 'feat/cta-revamp',
      authoredBy: 'agent',
      authorUserId: SEED_USER,
      agentName: 'Claude Code',
      color: '#b08cff',
      headSha: '4f81b62',
      createdAt: isoDays(3),
      updatedAt: isoDays(0),
    },
    {
      id: 'feat/pro-tier-highlight',
      boardId,
      name: 'feat/pro-tier-highlight',
      authoredBy: 'agent',
      authorUserId: SEED_USER,
      agentName: 'Claude Code',
      color: '#5db0ff',
      headSha: '9e0a17d',
      createdAt: isoDays(2),
      updatedAt: isoDays(0),
    },
  ];
}

/** Result of one `git` invocation. Never throws — failures are returned. */
interface GitRun {
  ok: boolean;
  stdout: string;
  stderr: string;
  code: number | null;
}

/** Run `git` with an argv array (no shell). Time-boxed; never throws. */
function git(args: string[], cwd: string, timeoutMs = GIT_TIMEOUT_MS): Promise<GitRun> {
  return new Promise<GitRun>((resolve) => {
    execFile(
      'git',
      args,
      {
        cwd,
        timeout: timeoutMs,
        windowsHide: true,
        maxBuffer: 4 * 1024 * 1024,
      },
      (err, stdout, stderr) => {
        const out = (stdout ?? '').toString();
        const errOut = (stderr ?? '').toString();
        if (err) {
          const code = (err as { code?: number }).code ?? null;
          resolve({ ok: false, stdout: out, stderr: errOut, code });
          return;
        }
        resolve({ ok: true, stdout: out, stderr: errOut, code: 0 });
      },
    );
  });
}

/** True when `cwd` sits inside a git work tree. Never throws. */
export async function isGitRepo(cwd: string): Promise<boolean> {
  const r = await git(['rev-parse', '--is-inside-work-tree'], cwd);
  return r.ok && r.stdout.trim() === 'true';
}

/** Current branch name, or null if detached / not a repo. */
export async function currentBranch(cwd: string): Promise<string | null> {
  const r = await git(['rev-parse', '--abbrev-ref', 'HEAD'], cwd);
  if (!r.ok) return null;
  const name = r.stdout.trim();
  return name && name !== 'HEAD' ? name : null;
}

/** HEAD commit SHA, or null. */
export async function headSha(cwd: string): Promise<string | null> {
  const r = await git(['rev-parse', 'HEAD'], cwd);
  return r.ok ? r.stdout.trim() || null : null;
}

/** Attempt to discover real local branch names from a repo. Returns null on failure. */
export async function tryLocalBranches(cwd: string): Promise<string[] | null> {
  const r = await git(['branch', '--format=%(refname:short)'], cwd);
  if (!r.ok) return null;
  const names = r.stdout
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  return names.length > 0 ? names : null;
}

export interface RealCommitInput {
  /** Absolute path to the repo. */
  cwd: string;
  /** Base ref the work branch should be created from (commit SHA or branch). */
  base: string;
  /** Commit message (passed via argv — safe from shell interpolation). */
  message: string;
  /** Short identifier mixed into the work-branch name. */
  slug: string;
  /** Opt-in push (FOLDO_MCP_PUSH=1). Defaults to false. */
  push: boolean;
  /** Optional progress sink. */
  emitProgress?: (line: string) => void;
}

export interface RealCommitResult {
  ok: boolean;
  /** Real 40-char commit SHA from `git rev-parse HEAD`. */
  sha?: string;
  /** Name of the work branch the commit landed on. */
  workBranch?: string;
  /** `git diff --shortstat` style summary, e.g. "+12 -3". */
  diffSummary?: string;
  /** Whether the commit was pushed to a remote. */
  pushed: boolean;
  error?: string;
}

/**
 * True if `ref` is safe to pass to git as a positional ref argument.
 *
 * The dispatch `baseCommitSha` is reviewer-influenced. We pass it to
 * `git checkout` with `execFile` (no shell), so there's no shell-injection
 * risk — but a value like `--orphan` or `-f` would still be parsed by git as
 * an OPTION rather than a ref. This restricts it to a commit SHA or a plain
 * branch/ref name: no leading `-`, no whitespace, no git-refspec metacharacters.
 */
function isSafeGitRef(ref: string): boolean {
  if (!ref || ref.length > 200) return false;
  if (ref.startsWith('-')) return false;
  // Allowed: letters, digits, and  / . _ -  (covers SHAs and ref names).
  return /^[A-Za-z0-9][A-Za-z0-9/._-]*$/.test(ref);
}

/** Sanitise a slug into a git-ref-safe fragment. */
function safeSlug(slug: string): string {
  const cleaned = slug
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 24);
  return cleaned || 'edit';
}

/** Parse `git diff --shortstat` output into a compact "+N -M" summary. */
function parseShortstat(raw: string): string {
  const ins = /(\d+) insertion/.exec(raw);
  const del = /(\d+) deletion/.exec(raw);
  const added = ins ? Number(ins[1]) : 0;
  const removed = del ? Number(del[1]) : 0;
  if (added === 0 && removed === 0) return 'no textual changes';
  return `+${added} -${removed}`;
}

/**
 * Commit whatever Claude changed onto a dedicated `foldo/edit-*` work branch,
 * read the REAL resulting SHA, compute a REAL diff summary, and optionally
 * push. The caller's original branch is always restored before returning.
 *
 * Never throws — every failure path returns `{ ok: false, error }` so the
 * caller can fall back to the simulated pipeline.
 */
export async function realCommitAndPush(
  input: RealCommitInput,
): Promise<RealCommitResult> {
  const { cwd, base, message, slug, push } = input;
  const emit = input.emitProgress ?? (() => {});

  // Remember where the user was so we can put them back no matter what.
  const priorBranch = await currentBranch(cwd);

  // Unique, ref-safe work branch off the dispatch base.
  const stamp = Date.now().toString(36).slice(-6);
  const workBranch = `foldo/edit-${safeSlug(slug)}-${stamp}`;

  try {
    // Stage everything Claude touched first, so the work-branch checkout
    // carries the changes across with it.
    const add = await git(['add', '-A'], cwd);
    if (!add.ok) {
      return {
        ok: false,
        pushed: false,
        error: `git add failed: ${add.stderr.trim() || add.code}`,
      };
    }

    // `checkout -b <work> <base>` creates the branch off the dispatch base
    // while keeping the staged working-tree changes. Non-destructive: it
    // never discards work and never touches the prior branch's history.
    //
    // `base` only goes through if it looks like a real ref/SHA — otherwise a
    // crafted value (`--orphan`, `-f`, …) could be parsed by git as an option.
    // An unsafe or absent base falls back to branching off current HEAD.
    emit(`creating work branch ${workBranch}…`);
    // `isSafeGitRef` guarantees `base` has no leading `-`, so it can't be
    // mis-parsed as a `git checkout` option when passed as the start-point.
    const baseIsSafe = isSafeGitRef(base);
    const checkout = baseIsSafe
      ? await git(['checkout', '-b', workBranch, base], cwd)
      : { ok: false, stderr: 'unsafe or missing base ref', code: 1 };
    if (!checkout.ok) {
      // Base ref invalid / missing locally — retry off current HEAD so the
      // edit is still captured rather than lost.
      const fallback = await git(['checkout', '-b', workBranch], cwd);
      if (!fallback.ok) {
        return {
          ok: false,
          pushed: false,
          error: `git checkout -b failed: ${checkout.stderr.trim() || checkout.code}`,
        };
      }
    }

    // Anything could already be staged; re-add to be safe after the switch.
    await git(['add', '-A'], cwd);

    // Diff summary BEFORE committing, while the changes are still staged.
    const shortstat = await git(['diff', '--cached', '--shortstat'], cwd);
    const diffSummary = shortstat.ok
      ? parseShortstat(shortstat.stdout)
      : 'unknown';

    emit('committing edit…');
    // `-m` via argv — message text cannot escape into the shell.
    const commit = await git(['commit', '-m', message], cwd);
    if (!commit.ok) {
      // Most common cause: nothing to commit (Claude made no changes).
      const nothing = /nothing to commit/i.test(
        `${commit.stdout}\n${commit.stderr}`,
      );
      return {
        ok: false,
        pushed: false,
        workBranch,
        diffSummary,
        error: nothing
          ? 'claude produced no file changes to commit'
          : `git commit failed: ${commit.stderr.trim() || commit.code}`,
      };
    }

    const sha = await headSha(cwd);
    if (!sha) {
      return {
        ok: false,
        pushed: false,
        workBranch,
        error: 'could not read commit SHA after commit',
      };
    }

    let pushed = false;
    if (push) {
      emit(`pushing ${workBranch}…`);
      // Plain (non-force) push of the work branch only. `-u` sets upstream;
      // we never pass --force / +refspec, so a remote can only fast-forward.
      const pushRes = await git(
        ['push', '-u', 'origin', workBranch],
        cwd,
        PUSH_TIMEOUT_MS,
      );
      if (pushRes.ok) {
        pushed = true;
      } else {
        // A failed push is non-fatal: the commit still exists locally.
        emit(
          `push failed (commit kept locally): ${pushRes.stderr.trim() || pushRes.code}`,
        );
      }
    }

    return { ok: true, sha, workBranch, diffSummary, pushed };
  } catch (err) {
    return {
      ok: false,
      pushed: false,
      error: err instanceof Error ? err.message : String(err),
    };
  } finally {
    // Always restore the user's original branch — the work branch keeps the
    // commit, but we never leave them parked somewhere unexpected.
    if (priorBranch) {
      await git(['checkout', priorBranch], cwd);
    }
  }
}

/** Simulated "commit + push", returns the fake SHA we already minted.
 *  Retained for the fallback path when there's no real repo / no CLI. */
export async function fakeCommitAndPush(sha: string, message: string): Promise<{
  sha: string;
  message: string;
}> {
  return { sha, message };
}
