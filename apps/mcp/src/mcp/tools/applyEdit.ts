// Tool: foldo_apply_edit_prompt, the headline tool. Given an intent and a
// target, generate a follow-up frame on the canvas representing the edit's
// result. Real impl would shell out to the `claude` CLI; the prototype uses
// the shared editSim logic so the cloud sees a sensible new frame.

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
import { fakeCommitAndPush } from '../../git/ops.ts';

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
}

const sleep = (ms: number): Promise<void> =>
  new Promise((r) => setTimeout(r, ms));

export async function runApplyEdit(
  args: ApplyEditArgs,
  deps: ApplyEditDeps,
  opts?: { dispatch?: Dispatch; emitProgress?: (line: string) => void },
): Promise<ApplyEditResult & ApplyEditExtras> {
  const emit = opts?.emitProgress ?? (() => {});
  const streaming = !!opts?.emitProgress;

  emit('reading target…');
  if (streaming) await sleep(250);

  const baseFrame = opts?.dispatch
    ? dispatchToBaseFrame(opts.dispatch)
    : fakeBaseFromArgs(args);

  emit('inferring overrides from intent…');
  if (streaming) await sleep(400);

  const sim = simulateEdit({
    baseFrame,
    target: args.target,
    intent: args.intent,
    dispatchId: opts?.dispatch?.id,
    sampleAppUrl: deps.config.sampleAppUrl,
  });

  emit(sim.note);
  if (streaming) await sleep(450);
  emit(`committing as ${sim.sha}…`);
  if (streaming) await sleep(350);
  await fakeCommitAndPush(sim.sha, sim.commitMessage);
  emit('pushed (simulated)');
  if (streaming) await sleep(150);

  return {
    ok: true,
    newCommitSha: sim.sha,
    overrides: sim.overrides,
    commitMessage: sim.commitMessage,
    diffSummary: '+12 -3',
    resultFrame: sim.newFrame,
  };
}
