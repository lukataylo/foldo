// Tool: foldo_replay_recipe, replay a UI recipe against a running app and
// report whether the end state was reached. For the prototype we always
// return ok=true; a real impl would drive Playwright through the steps.

import { z } from 'zod';
import type { ReplayArgs, ReplayResult } from '@foldo/protocol';

const recipeStepSchema = z.object({
  action: z.enum(['goto', 'click', 'fill', 'wait', 'hover', 'scroll']),
  target: z.string().optional(),
  value: z.string().optional(),
});

export const replayInputSchema = z.object({
  commitSha: z.string(),
  recipe: z.array(recipeStepSchema),
  url: z.string(),
});

export const replayJsonSchema = {
  type: 'object',
  required: ['commitSha', 'recipe', 'url'],
  properties: {
    commitSha: { type: 'string' },
    url: { type: 'string' },
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

export async function runReplay(_args: ReplayArgs): Promise<ReplayResult> {
  // Prototype: assume the recipe replayed cleanly.
  return { ok: true, endState: 'replayed' };
}
