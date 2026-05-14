// Tool: foldo_freeze_current_state, capture a frame from a running app and
// emit a `freeze.captured` event to the cloud over WS.

import { nanoid } from 'nanoid';
import { z } from 'zod';
import type {
  AppFrameContent,
  Frame,
  FreezeArgs,
  FreezeResult,
  RecipeStep,
} from '@foldo/protocol';
import type { FoldoMcpConfig } from '../../config.ts';
import type { CloudClient } from '../../cloud/wsClient.ts';
import { tryHeadlessCapture } from '../../runner/playwright.ts';

const recipeStepSchema = z.object({
  action: z.enum(['goto', 'click', 'fill', 'wait', 'hover', 'scroll']),
  target: z.string().optional(),
  value: z.string().optional(),
});

export const freezeInputSchema = z.object({
  boardId: z.string(),
  branchId: z.string(),
  commitSha: z.string(),
  route: z.string(),
  viewport: z.object({ width: z.number(), height: z.number() }),
  recipe: z.array(recipeStepSchema).optional(),
  stateLabel: z.string().optional(),
});

export const freezeJsonSchema = {
  type: 'object',
  required: ['boardId', 'branchId', 'commitSha', 'route', 'viewport'],
  properties: {
    boardId: { type: 'string' },
    branchId: { type: 'string' },
    commitSha: { type: 'string' },
    route: { type: 'string' },
    viewport: {
      type: 'object',
      required: ['width', 'height'],
      properties: {
        width: { type: 'number' },
        height: { type: 'number' },
      },
    },
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
    stateLabel: { type: 'string' },
  },
} as const;

export interface FreezeDeps {
  config: FoldoMcpConfig;
  cloud: CloudClient | null;
}

function buildFreezeFrame(
  args: FreezeArgs,
  sampleAppUrl: string,
  recipe?: RecipeStep[],
): Frame {
  const now = new Date().toISOString();
  const variant: AppFrameContent['variant'] =
    args.branchId.includes('cta')
      ? 'cta-revamp'
      : args.branchId.includes('pro')
        ? 'pro-highlight'
        : 'baseline';

  const url = new URL(sampleAppUrl);
  url.searchParams.set('variant', variant);
  url.searchParams.set('commit', args.commitSha);
  if (args.stateLabel) url.searchParams.set('state', args.stateLabel);
  if (args.route && args.route !== '/') url.searchParams.set('route', args.route);

  const content: AppFrameContent = {
    kind: 'app',
    variant,
    route: args.route,
    viewport: args.viewport,
    recipe,
    stateLabel: args.stateLabel,
    iframeUrl: url.toString(),
  };

  return {
    id: `frame-${nanoid(8)}`,
    boardId: args.boardId,
    kind: 'app',
    branchId: args.branchId,
    commitSha: args.commitSha,
    commitMessage: args.stateLabel ?? `freeze @ ${args.commitSha.slice(0, 7)}`,
    age: 'just now',
    position: { x: 0, y: 0 },
    size: { width: args.viewport.width, height: args.viewport.height },
    content,
    createdAt: now,
    updatedAt: now,
  };
}

export async function runFreeze(
  args: FreezeArgs,
  deps: FreezeDeps,
): Promise<FreezeResult> {
  const frame = buildFreezeFrame(args, deps.config.sampleAppUrl, args.recipe);

  // Best-effort: try a real headless capture; if it fails (no playwright
  // installed, dev server down) we still return the synthetic frame.
  if (frame.content.kind === 'app' && frame.content.iframeUrl) {
    await tryHeadlessCapture({
      url: frame.content.iframeUrl,
      viewport: args.viewport,
    });
    // We discard the screenshot in the prototype, the cloud renders an
    // iframe, but a real impl would upload it and attach a thumbnail URL.
  }

  if (deps.cloud) {
    deps.cloud.send({ type: 'freeze.captured', frame });
  }

  return { frame };
}
