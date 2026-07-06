// Diff-reasoning: which walkthrough steps did this PR touch?
//
// Port of Foley's agent.py. Two paths:
//   - LLM (ANTHROPIC_API_KEY set): Claude reads the walkthrough spec + the
//     PR diff and returns one StepDiff per step via a forced-ish tool call,
//     including proposed replacement steps for anything that changed.
//   - Heuristic (no key, or the LLM call fails): a step is marked changed
//     when the diff text mentions any of its grounded selectors (clicked /
//     filled labels, goto paths). Cruder — it can't propose new narrations —
//     but deterministic, free, and correct enough to keep the incremental
//     render property demonstrable without a model in the loop.

import type { Walkthrough, WalkthroughStep } from '@foldo/protocol';
import type { AgentVerdict, VerdictStepDiff } from './models.ts';
import { validateWalkthroughSteps } from './models.ts';

const DEFAULT_MODEL = 'claude-sonnet-5';

const SYSTEM_PROMPT = `You are Foldo's director — the agent that decides which steps of a product walkthrough need to be re-filmed after a pull request merges.

A walkthrough is a sequence of Steps. Each Step has:
- A stable \`id\` you must preserve.
- A \`narration\` (text spoken over the captured clip).
- An \`actions\` list (Playwright instructions grounded in visible text: goto, click, fill, hover, press, scroll, wait).
- A \`durationMs\`.

A merged PR changed some files in the product's repository. For every existing step, decide whether the PR affects what would be captured or said. Output one step diff per existing step, plus optionally one or two diffs with status "added" if the PR introduces a new screen or flow worth documenting.

Status meanings:
- "unchanged": the PR does not affect what this step shows or says. The cached segment is reused byte-for-byte. This is the default — most steps in most PRs are unchanged.
- "changed": the PR changes what the step shows (new copy, new layout, different label on a clicked element). Provide proposedStep with updated narration and actions; preserve the id and roughly the durationMs.
- "added": the PR introduces a new screen or flow the walkthrough doesn't cover. Provide proposedStep with a fresh snake_case id, narration, actions, durationMs. Be conservative.
- "removed": the PR removes a screen or flow this step relied on. No proposedStep.

Rules:
- A step is CHANGED only if the captured video or the narration would be misleading after the PR. Refactors with no visible effect → UNCHANGED.
- If a button label changes and a step clicks that button by its visible text, that step is CHANGED — update both the click text and the narration.
- Action shapes: goto{url}, click{text}, hover{text}, fill{label,value}, press{key}, scroll{y}, wait{ms}. click/hover/fill use VISIBLE text only, never CSS selectors.
- \`reason\` is one short plain-language sentence a product manager can read.
- \`summary\` is 1-2 sentences describing what this PR visibly changed, written for a stakeholder.
- Classify EVERY existing step. Call the submit_verdict tool exactly once; no prose.`;

const ACTION_SCHEMA = {
  type: 'object',
  properties: {
    kind: { type: 'string', enum: ['goto', 'click', 'fill', 'hover', 'press', 'scroll', 'wait'] },
    url: { type: 'string' },
    text: { type: 'string' },
    label: { type: 'string' },
    value: { type: 'string' },
    key: { type: 'string' },
    y: { type: 'number' },
    ms: { type: 'number' },
  },
  required: ['kind'],
  additionalProperties: false,
};

const VERDICT_SCHEMA = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    stepDiffs: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          stepId: { type: 'string' },
          status: { type: 'string', enum: ['unchanged', 'changed', 'added', 'removed'] },
          reason: { type: 'string' },
          proposedStep: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              title: { type: 'string' },
              narration: { type: 'string' },
              actions: { type: 'array', items: ACTION_SCHEMA },
              durationMs: { type: 'number' },
            },
            required: ['id', 'title', 'narration', 'actions', 'durationMs'],
            additionalProperties: false,
          },
        },
        required: ['stepId', 'status', 'reason'],
        additionalProperties: false,
      },
    },
  },
  required: ['summary', 'stepDiffs'],
  additionalProperties: false,
};

export interface ReviewInput {
  diff?: string;
  prTitle?: string;
  prBody?: string;
  onWarning?: (message: string) => void;
}

export async function reviewPr(
  walkthrough: Walkthrough,
  input: ReviewInput,
): Promise<AgentVerdict> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const simMode = process.env.FOLDO_DIRECTOR_SIM === '1';
  if (apiKey && !simMode) {
    try {
      return await reviewWithLlm(walkthrough, input, apiKey);
    } catch (err) {
      input.onWarning?.(
        `LLM verdict failed (${String(err).slice(0, 200)}) — using heuristic verdict`,
      );
    }
  }
  return heuristicVerdict(walkthrough, input);
}

async function reviewWithLlm(
  walkthrough: Walkthrough,
  input: ReviewInput,
  apiKey: string,
): Promise<AgentVerdict> {
  const parts: string[] = [];
  if (input.prTitle) parts.push(`PR title: ${input.prTitle}`);
  if (input.prBody) parts.push(`PR description:\n${input.prBody}`);
  parts.push('Current walkthrough (JSON):');
  parts.push(
    '```json\n' +
      JSON.stringify(
        {
          id: walkthrough.id,
          title: walkthrough.title,
          targetUrl: walkthrough.targetUrl,
          steps: walkthrough.steps,
        },
        null,
        2,
      ) +
      '\n```',
  );
  if (input.diff) {
    // Cap the diff so one giant lockfile change can't blow the context.
    const diff = input.diff.length > 180_000 ? input.diff.slice(0, 180_000) + '\n…(truncated)' : input.diff;
    parts.push('Unified PR diff:\n```diff\n' + diff + '\n```');
  } else {
    parts.push(
      'No diff is available for this PR — judge from the title/description only, and prefer "changed" when unsure.',
    );
  }
  parts.push('Classify every existing step and submit via the submit_verdict tool.');

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: process.env.FOLDO_DIRECTOR_MODEL || DEFAULT_MODEL,
      max_tokens: 16_000,
      system: SYSTEM_PROMPT,
      tools: [
        {
          name: 'submit_verdict',
          description: 'Submit your decisions about which walkthrough steps the PR affects.',
          input_schema: VERDICT_SCHEMA,
        },
      ],
      tool_choice: { type: 'tool', name: 'submit_verdict' },
      messages: [{ role: 'user', content: parts.join('\n\n') }],
    }),
  });
  if (!res.ok) {
    throw new Error(`anthropic api ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }
  const body = (await res.json()) as {
    content: Array<{ type: string; input?: unknown }>;
    stop_reason?: string;
  };
  const toolBlock = body.content.find((b) => b.type === 'tool_use');
  if (!toolBlock) {
    throw new Error(`model did not call submit_verdict (stop_reason=${body.stop_reason})`);
  }
  const verdict = toolBlock.input as { summary: string; stepDiffs: VerdictStepDiff[] };

  // Sanity guards ported from Foley: every existing step classified exactly
  // once; changed/added carry a valid proposed step.
  const expected = new Set(walkthrough.steps.map((s) => s.id));
  const seen = new Set<string>();
  for (const d of verdict.stepDiffs) {
    if (d.status === 'added') continue;
    if (!expected.has(d.stepId)) throw new Error(`verdict references unknown step ${d.stepId}`);
    if (seen.has(d.stepId)) throw new Error(`verdict classifies ${d.stepId} twice`);
    seen.add(d.stepId);
    if (d.status === 'changed' && !d.proposedStep) {
      throw new Error(`changed step ${d.stepId} lacks proposedStep`);
    }
  }
  const missing = [...expected].filter((id) => !seen.has(id));
  if (missing.length) throw new Error(`verdict omitted steps: ${missing.join(', ')}`);
  const proposed = verdict.stepDiffs
    .filter((d) => d.proposedStep)
    .map((d) => d.proposedStep as WalkthroughStep);
  validateWalkthroughSteps(dedupeById(proposed));

  return { summary: verdict.summary, stepDiffs: verdict.stepDiffs, decidedBy: 'llm' };
}

function dedupeById(steps: WalkthroughStep[]): WalkthroughStep[] {
  const seen = new Set<string>();
  return steps.filter((s) => (seen.has(s.id) ? false : (seen.add(s.id), true)));
}

/**
 * The no-model fallback. A step is "changed" when the diff's touched text
 * mentions one of the step's grounded anchors: a clicked/hovered label, a
 * filled field label, or a goto path segment. Without any diff at all, every
 * step is re-filmed — a full render is slower but never wrong.
 */
export function heuristicVerdict(
  walkthrough: Walkthrough,
  input: ReviewInput,
): AgentVerdict {
  if (!input.diff) {
    return {
      summary: input.prTitle
        ? `Full re-render for "${input.prTitle}" (no diff available).`
        : 'Full re-render (no diff available).',
      stepDiffs: walkthrough.steps.map((s) => ({
        stepId: s.id,
        status: 'changed',
        reason: 'No diff available — re-filming to be safe.',
        proposedStep: s,
      })),
      decidedBy: 'heuristic',
    };
  }

  const diffLower = input.diff.toLowerCase();
  const stepDiffs: VerdictStepDiff[] = walkthrough.steps.map((step) => {
    const anchors = stepAnchors(step);
    const hit = anchors.find((a) => diffLower.includes(a.toLowerCase()));
    if (hit) {
      return {
        stepId: step.id,
        status: 'changed' as const,
        reason: `The diff touches "${hit}", which this step depends on.`,
        proposedStep: step,
      };
    }
    return {
      stepId: step.id,
      status: 'unchanged' as const,
      reason: 'Nothing this step shows or clicks appears in the diff.',
    };
  });

  const changed = stepDiffs.filter((d) => d.status === 'changed').length;
  return {
    summary:
      changed === 0
        ? 'No walkthrough step is visibly affected by this PR.'
        : `${changed} of ${walkthrough.steps.length} steps touch things this PR changed and will be re-filmed.`,
    stepDiffs,
    decidedBy: 'heuristic',
  };
}

/** The visible-text anchors a step depends on, for diff matching. */
function stepAnchors(step: WalkthroughStep): string[] {
  const anchors: string[] = [];
  for (const a of step.actions) {
    switch (a.kind) {
      case 'click':
      case 'hover':
        if (a.text.length >= 3) anchors.push(a.text);
        break;
      case 'fill':
        if (a.label.length >= 3) anchors.push(a.label);
        break;
      case 'goto': {
        const path = a.url.replace(/^https?:\/\/[^/]+/, '');
        // Ignore bare "/" — it matches every diff.
        if (path.length >= 2) anchors.push(path);
        break;
      }
      default:
        break;
    }
  }
  return anchors;
}
