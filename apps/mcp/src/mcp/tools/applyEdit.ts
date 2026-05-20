// Tool: foldo_apply_edit_prompt, the headline tool. Given an intent and a
// target, apply a real code edit by shelling out to the `claude` CLI inside
// the user's repo, commit it on a dedicated work branch, and emit a follow-up
// frame for the canvas.
//
// Real path (claude CLI present + cwd is a git repo):
//   1. run `claude -p` in the target repo to mutate code (runner/claude.ts);
//   2. commit the result on a `foldo/edit-*` work branch and read the real
//      SHA + diff summary (git/ops.ts realCommitAndPush);
//   3. return that real SHA / diff in the result.
//
// Fallback path (no CLI / not a repo / invocation failed):
//   fall back to the keyword-heuristic `simulateEdit` so the product still
//   produces a sensible frame, and mark the result clearly as simulated via
//   the progress log and a "(simulated)" diff summary.

import { z } from 'zod';
import type {
  ApplyEditArgs,
  ApplyEditResult,
  Dispatch,
  Frame,
} from '@foldo/protocol';
import type { FoldoMcpConfig } from '../../config.ts';
import type { CloudClient } from '../../cloud/wsClient.ts';
import {
  dispatchToBaseFrame,
  simulateEdit,
} from '../../runner/editSim.ts';
import { isGitRepo, realCommitAndPush } from '../../git/ops.ts';
import {
  detectClaude,
  runClaudeEdit,
  type ClaudeCapability,
} from '../../runner/claude.ts';

const recipeStepSchema = z.object({
  action: z.enum(['goto', 'click', 'fill', 'wait', 'hover', 'scroll']),
  target: z.string().optional(),
  value: z.string().optional(),
});

export const applyEditInputSchema = z.object({
  boardId: z.string(),
  branchId: z.string(),
  baseCommitSha: z.string(),
  target: z.object({
    elementLabel: z.string().optional(),
    elementSelector: z.string().optional(),
    elementFile: z.string().optional(),
    elementLine: z.number().optional(),
  }),
  intent: z.string(),
  recipe: z.array(recipeStepSchema).optional(),
});

export const applyEditJsonSchema = {
  type: 'object',
  required: ['boardId', 'branchId', 'baseCommitSha', 'target', 'intent'],
  properties: {
    boardId: { type: 'string' },
    branchId: { type: 'string' },
    baseCommitSha: { type: 'string' },
    target: {
      type: 'object',
      properties: {
        elementLabel: { type: 'string' },
        elementSelector: { type: 'string' },
        elementFile: { type: 'string' },
        elementLine: { type: 'number' },
      },
    },
    intent: { type: 'string' },
    recipe: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: ['goto', 'click', 'fill', 'wait', 'hover', 'scroll'],
          },
          target: { type: 'string' },
          value: { type: 'string' },
        },
      },
    },
  },
} as const;

export interface ApplyEditDeps {
  config: FoldoMcpConfig;
  cloud: CloudClient | null;
}

/** Synthesise a base frame from args alone (no real frame lookup in the prototype). */
function fakeBaseFromArgs(args: ApplyEditArgs): Frame {
  const now = new Date().toISOString();
  return {
    id: `frame-base-${args.baseCommitSha.slice(0, 7)}`,
    boardId: args.boardId,
    kind: 'app',
    branchId: args.branchId,
    commitSha: args.baseCommitSha,
    commitMessage: 'base',
    age: 'just now',
    position: { x: 0, y: 0 },
    size: { width: 1280, height: 800 },
    content: {
      kind: 'app',
      variant: args.branchId.includes('cta')
        ? 'cta-revamp'
        : args.branchId.includes('pro')
          ? 'pro-highlight'
          : 'baseline',
      route: '/',
      viewport: { width: 1280, height: 800 },
    },
    createdAt: now,
    updatedAt: now,
  };
}

export interface ApplyEditExtras {
  /** Resulting synthetic frame, used by the WS dispatch handler. */
  resultFrame: Frame;
  /** True when the edit went through the real claude + git path. */
  real: boolean;
}

const sleep = (ms: number): Promise<void> =>
  new Promise((r) => setTimeout(r, ms));

/**
 * Capability probe, memoised for the process lifetime. Detecting `claude`
 * once at startup keeps every dispatch fast and avoids hammering PATH.
 */
let claudeCapPromise: Promise<ClaudeCapability> | null = null;
function getClaudeCapability(): Promise<ClaudeCapability> {
  if (!claudeCapPromise) claudeCapPromise = detectClaude();
  return claudeCapPromise;
}

/** Exposed so the entry point can warm + log the probe at startup. */
export async function probeClaudeAtStartup(): Promise<ClaudeCapability> {
  return getClaudeCapability();
}

/** Build a short, ref-safe slug from the intent for the work-branch name. */
function slugFromIntent(intent: string): string {
  const first = intent.split('\n')[0]?.trim() ?? '';
  return first.slice(0, 32) || 'edit';
}

/** Derive a concise commit message from the intent. */
function commitMessageFromIntent(intent: string): string {
  const first = intent.split('\n')[0]?.trim() ?? '';
  const short = first.slice(0, 72);
  return short ? `foldo: ${short}` : 'foldo: apply edit from canvas comment';
}

export async function runApplyEdit(
  args: ApplyEditArgs,
  deps: ApplyEditDeps,
  opts?: { dispatch?: Dispatch; emitProgress?: (line: string) => void },
): Promise<ApplyEditResult & ApplyEditExtras> {
  const emit = opts?.emitProgress ?? (() => {});
  const streaming = !!opts?.emitProgress;

  emit('reading target…');
  if (streaming) await sleep(150);

  const baseFrame = opts?.dispatch
    ? dispatchToBaseFrame(opts.dispatch)
    : fakeBaseFromArgs(args);

  // Decide real vs simulated. The real path needs BOTH the `claude` CLI on
  // PATH AND the target dir to be a git repo; any miss → graceful fallback.
  const repo = deps.config.targetRepo;
  const [cap, repoOk] = await Promise.all([
    getClaudeCapability(),
    isGitRepo(repo),
  ]);

  if (cap.available && repoOk) {
    const real = await tryRealEdit(args, deps, baseFrame, emit, opts?.dispatch);
    if (real) return real;
    // tryRealEdit returns null when the invocation failed mid-flight; we
    // fall through to the simulated path below so the product still works.
    emit('real edit path failed — falling back to simulation');
  } else if (!cap.available) {
    emit('claude CLI not found — simulating edit (no real commit)');
  } else {
    emit(`${repo} is not a git repo — simulating edit (no real commit)`);
  }

  return runSimulatedEdit(args, deps, baseFrame, emit, streaming, opts?.dispatch);
}

/**
 * Real edit: invoke `claude` to mutate code, then commit on a work branch.
 * Returns the full result on success; returns null when the invocation or
 * commit failed so the caller can fall back to simulation.
 */
async function tryRealEdit(
  args: ApplyEditArgs,
  deps: ApplyEditDeps,
  baseFrame: Frame,
  emit: (line: string) => void,
  dispatch: Dispatch | undefined,
): Promise<(ApplyEditResult & ApplyEditExtras) | null> {
  const repo = deps.config.targetRepo;

  const claudeResult = await runClaudeEdit({
    cwd: repo,
    intent: args.intent,
    target: args.target,
    emitProgress: emit,
  });

  if (!claudeResult.ok) {
    emit(claudeResult.error ?? 'claude invocation failed');
    return null;
  }
  emit(`claude: ${claudeResult.summary}`);

  const commit = await realCommitAndPush({
    cwd: repo,
    base: args.baseCommitSha,
    message: commitMessageFromIntent(args.intent),
    slug: slugFromIntent(args.intent),
    push: deps.config.push,
    emitProgress: emit,
  });

  if (!commit.ok || !commit.sha) {
    emit(commit.error ?? 'git commit failed');
    return null;
  }

  emit(
    commit.pushed
      ? `pushed ${commit.workBranch} (${commit.sha.slice(0, 7)})`
      : `committed ${commit.sha.slice(0, 7)} on ${commit.workBranch} (push disabled)`,
  );

  // Reuse the sim's frame layout/iframe-URL logic, but stamp the REAL SHA and
  // commit message onto the resulting frame so the canvas reflects reality.
  const sim = simulateEdit({
    baseFrame,
    target: args.target,
    intent: args.intent,
    dispatchId: dispatch?.id,
    sampleAppUrl: deps.config.sampleAppUrl,
  });
  const commitMessage = commitMessageFromIntent(args.intent);
  const resultFrame: Frame = {
    ...sim.newFrame,
    commitSha: commit.sha,
    commitMessage,
  };

  return {
    ok: true,
    newCommitSha: commit.sha,
    overrides: sim.overrides,
    commitMessage,
    diffSummary: commit.diffSummary ?? 'unknown',
    resultFrame,
    real: true,
  };
}

/** Simulated edit: keyword heuristics, no code mutation. Clearly flagged. */
async function runSimulatedEdit(
  args: ApplyEditArgs,
  deps: ApplyEditDeps,
  baseFrame: Frame,
  emit: (line: string) => void,
  streaming: boolean,
  dispatch: Dispatch | undefined,
): Promise<ApplyEditResult & ApplyEditExtras> {
  emit('inferring overrides from intent…');
  if (streaming) await sleep(300);

  const sim = simulateEdit({
    baseFrame,
    target: args.target,
    intent: args.intent,
    dispatchId: dispatch?.id,
    sampleAppUrl: deps.config.sampleAppUrl,
  });

  emit(sim.note);
  if (streaming) await sleep(300);
  emit(`committing as ${sim.sha} (simulated)…`);
  if (streaming) await sleep(200);
  emit('pushed (simulated — no real commit)');

  return {
    ok: true,
    newCommitSha: sim.sha,
    overrides: sim.overrides,
    commitMessage: sim.commitMessage,
    // Marked so the cloud / canvas can show this was not a real diff.
    diffSummary: '+12 -3 (simulated)',
    resultFrame: sim.newFrame,
    real: false,
  };
}
