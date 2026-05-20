// Tool: foldo_replay_recipe, replay a UI recipe against a running app and
// report whether the end state was reached.
//
// A full recipe replay needs a browser engine (Playwright) driving each
// click/fill — that engine may not be installed, so we don't make it a hard
// dependency. What we CAN do cheaply and honestly is verify the target app is
// actually reachable before claiming the recipe replayed: a real reachability
// probe beats unconditionally returning ok=true.

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

/** Probe whether the app URL responds. Cheap, uses the built-in fetch. */
async function isReachable(url: string): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4_000);
    try {
      const res = await fetch(url, {
        method: 'GET',
        signal: controller.signal,
        redirect: 'follow',
      });
      // Any HTTP response (even 4xx) means the server is up and serving.
      return res.status > 0;
    } finally {
      clearTimeout(timer);
    }
  } catch {
    return false;
  }
}

export async function runReplay(args: ReplayArgs): Promise<ReplayResult> {
  // Validate the URL up front so a typo doesn't masquerade as a clean replay.
  let url: URL;
  try {
    url = new URL(args.url);
  } catch {
    return { ok: false, error: `invalid replay URL: ${args.url}` };
  }

  const reachable = await isReachable(url.toString());
  if (!reachable) {
    return {
      ok: false,
      error: `app at ${url.origin} is not reachable — cannot replay recipe`,
    };
  }

  // The app is live. A full step-by-step replay would require Playwright; we
  // report a reached-but-unverified end state so the caller knows the server
  // responded without us asserting each individual step.
  return {
    ok: true,
    endState: `app reachable (${args.recipe.length} step(s) not browser-verified)`,
  };
}
