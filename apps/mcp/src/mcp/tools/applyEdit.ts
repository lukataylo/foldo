// Tool: foldo_apply_edit_prompt, the headline tool. Given an intent and a
// target, generate a follow-up frame on the canvas representing the edit's
// result. Routes through the runner orchestrator: real `claude` CLI when
// available (or always, unless `FOLDO_MCP_FORCE_SIM=1`), heuristic sim
// runner otherwise. Either way produces the same `ApplyEditResult` shape
// + a synthetic `resultFrame` for the cloud to pin on the canvas.

import { z } from 'zod';
import { nanoid } from 'nanoid';
import type {
  ApplyEditArgs,
  ApplyEditResult,
  Dispatch,
  Frame,
  AppFrameContent,
  VariantOverrides,
} from '@foldo/protocol';
import type { FoldoMcpConfig } from '../../config.ts';
import type { CloudClient } from '../../cloud/wsClient.ts';
import {
  dispatchToBaseFrame,
  buildIframeUrl,
  inferEdit,
} from '../../runner/editSim.ts';
import { runDispatch } from '../../runner/index.ts';
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

/**
 * Build a result frame from a real-runner output. The sim path already
 * produces a richer frame (via simulateEdit) but the real-runner path has
 * to fabricate one from the dispatch metadata + the new SHA.
 */
function buildResultFrameFromReal(
  baseFrame: Frame,
  args: ApplyEditArgs,
  newSha: string,
  shortSha: string,
  commitMessage: string,
  dispatchId: string | undefined,
  sampleAppUrl: string,
): Frame {
  const now = new Date().toISOString();
  const app =
    baseFrame.content.kind === 'app' ? (baseFrame.content as AppFrameContent) : null;
  const nextContent: AppFrameContent = app
    ? {
        ...app,
        iframeUrl: buildIframeUrl(sampleAppUrl, app, shortSha, app.overrides ?? {}),
      }
    : {
        kind: 'app',
        variant: 'baseline',
        route: '/',
        viewport: { width: baseFrame.size.width, height: baseFrame.size.height },
        iframeUrl: buildIframeUrl(
          sampleAppUrl,
          {
            kind: 'app',
            variant: 'baseline',
            route: '/',
            viewport: {
              width: baseFrame.size.width,
              height: baseFrame.size.height,
            },
          },
          shortSha,
          {},
        ),
      };
  return {
    id: `frame-${nanoid(8)}`,
    boardId: args.boardId,
    kind: 'app',
    branchId: args.branchId,
    commitSha: newSha,
    commitMessage,
    age: 'just now',
    position: {
      x: baseFrame.position.x + baseFrame.size.width + 100,
      y: baseFrame.position.y,
    },
    size: { ...baseFrame.size },
    content: nextContent,
    parentFrameId: baseFrame.id,
    generatedByDispatchId: dispatchId,
    createdAt: now,
    updatedAt: now,
  };
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

  emit('dispatching to runner…');

  const result = await runDispatch(
    {
      dispatchId: opts?.dispatch?.id ?? `local-${nanoid(8)}`,
      branchId: args.branchId,
      baseCommitSha: args.baseCommitSha,
      target: args.target,
      intent: args.intent,
      sampleAppUrl: deps.config.sampleAppUrl,
      baseFrame,
      dispatchToBase: opts?.dispatch,
      emitProgress: emit,
    },
  );

  // When the sim ran, reuse its rich frame; when the real CLI ran,
  // fabricate one with the same shape so the cloud is none the wiser.
  let resultFrame: Frame;
  let overrides: VariantOverrides = {};
  if (result.sim) {
    resultFrame = result.sim.newFrame;
    overrides = result.sim.overrides;
  } else {
    resultFrame = buildResultFrameFromReal(
      baseFrame,
      args,
      result.newCommitSha,
      result.shortSha,
      result.commitMessage,
      opts?.dispatch?.id,
      deps.config.sampleAppUrl,
    );
    // Heuristic override inference is still useful even on the real path,
    // for the sample-app preview iframe overlay; treat it as a hint only.
    overrides = inferEdit(baseFrame, args.target, args.intent).overrides;
  }

  // Sim path still needs the fake push hook (no real git), real path
  // already pushed inside the runner.
  if (!result.realClaude) {
    await fakeCommitAndPush(result.shortSha, result.commitMessage);
    emit('pushed (simulated)');
  }

  return {
    ok: true,
    newCommitSha: result.newCommitSha,
    overrides,
    commitMessage: result.commitMessage,
    diffSummary: result.realClaude ? '' : '+12 -3',
    resultFrame,
  };
}
