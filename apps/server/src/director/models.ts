// Director domain helpers — the TypeScript port of Foley's models.py.
//
// The wire types (Walkthrough, WalkthroughStep, Take, StepDiff, …) live in
// @foldo/protocol; this module adds the content-addressing helpers the
// pipeline is built on: step fingerprints and file hashes. If two steps have
// the same fingerprint, their captured clips and narration bytes are
// interchangeable — that's what lets a take reuse its parent's segments
// byte-for-byte.

import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import type {
  StepDiff,
  Walkthrough,
  WalkthroughAction,
  WalkthroughStep,
} from '@foldo/protocol';

/** Viewport every walkthrough is filmed at. Pinned — part of the fingerprint. */
export const CAPTURE_VIEWPORT = { width: 1280, height: 720 } as const;

export const MIN_STEP_DURATION_MS = 1_000;
export const MAX_STEP_DURATION_MS = 30_000;
export const DEFAULT_STEP_DURATION_MS = 6_000;

/**
 * Stable hash of everything that affects a step's rendered clip. Mirrors
 * Foley's `Step.fingerprint()`: JSON with sorted keys over the fields that
 * matter, sha256, first 16 hex chars.
 */
export function stepFingerprint(step: WalkthroughStep): string {
  const payload = {
    id: step.id,
    narration: step.narration,
    actions: step.actions.map(normalizeAction),
    duration_ms: step.durationMs,
    viewport: CAPTURE_VIEWPORT,
  };
  return createHash('sha256').update(stableJson(payload)).digest('hex').slice(0, 16);
}

function normalizeAction(a: WalkthroughAction): Record<string, unknown> {
  // Drop undefined fields so semantically-equal actions hash equal.
  return Object.fromEntries(Object.entries(a).filter(([, v]) => v !== undefined));
}

/** JSON.stringify with recursively sorted object keys (arrays keep order). */
export function stableJson(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value as Record<string, unknown>)
        .sort()
        .map((k) => [k, sortKeys((value as Record<string, unknown>)[k])]),
    );
  }
  return value;
}

export async function fileSha256(path: string): Promise<string> {
  const h = createHash('sha256');
  const stream = createReadStream(path);
  for await (const chunk of stream) h.update(chunk as Buffer);
  return h.digest('hex');
}

export function bytesSha256(bytes: Buffer | Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

/**
 * Validate a step the way Foley's Pydantic model did. Throws with a
 * user-facing message on the first violation.
 */
export function validateStep(step: WalkthroughStep): void {
  if (!/^[a-z0-9_]{1,64}$/.test(step.id)) {
    throw new Error(`step id "${step.id}" must be snake_case [a-z0-9_], max 64 chars`);
  }
  if (!step.title.trim()) throw new Error(`step ${step.id}: title is required`);
  if (!step.narration.trim()) throw new Error(`step ${step.id}: narration is required`);
  if (!step.actions.length) throw new Error(`step ${step.id}: at least one action`);
  if (
    step.durationMs < MIN_STEP_DURATION_MS ||
    step.durationMs > MAX_STEP_DURATION_MS
  ) {
    throw new Error(
      `step ${step.id}: durationMs must be ${MIN_STEP_DURATION_MS}..${MAX_STEP_DURATION_MS}`,
    );
  }
  for (const action of step.actions) validateAction(step.id, action);
}

function validateAction(stepId: string, action: WalkthroughAction): void {
  const fail = (msg: string) => {
    throw new Error(`step ${stepId}: ${msg}`);
  };
  switch (action.kind) {
    case 'goto':
      if (!action.url) fail('goto requires url');
      break;
    case 'click':
    case 'hover':
      if (!action.text) fail(`${action.kind} requires text`);
      break;
    case 'fill':
      if (!action.label || action.value === undefined) fail('fill requires label and value');
      break;
    case 'press':
      if (!action.key) fail('press requires key');
      break;
    case 'scroll':
      if (typeof action.y !== 'number') fail('scroll requires y');
      break;
    case 'wait':
      if (typeof action.ms !== 'number' || action.ms < 0) fail('wait requires ms >= 0');
      break;
    default: {
      const _exhaustive: never = action;
      fail(`unknown action ${JSON.stringify(_exhaustive)}`);
    }
  }
}

export function validateWalkthroughSteps(steps: WalkthroughStep[]): void {
  const ids = new Set<string>();
  for (const s of steps) {
    validateStep(s);
    if (ids.has(s.id)) throw new Error(`duplicate step id: ${s.id}`);
    ids.add(s.id);
  }
}

/**
 * Apply a verdict's step diffs to a walkthrough's step list, returning the
 * next take's effective steps: changed steps swapped for their proposals,
 * added steps appended, removed steps dropped.
 */
export function applyStepDiffs(
  walkthrough: Walkthrough,
  diffs: VerdictStepDiff[],
): WalkthroughStep[] {
  const byId = new Map(diffs.map((d) => [d.stepId, d]));
  const next: WalkthroughStep[] = [];
  for (const step of walkthrough.steps) {
    const d = byId.get(step.id);
    if (!d || d.status === 'unchanged') {
      next.push(step);
    } else if (d.status === 'changed' && d.proposedStep) {
      next.push({ ...d.proposedStep, id: step.id });
    } else if (d.status !== 'removed') {
      next.push(step);
    }
  }
  for (const d of diffs) {
    if (d.status === 'added' && d.proposedStep) next.push(d.proposedStep);
  }
  return next;
}

/** StepDiff plus the proposed replacement step (internal to the pipeline —
 * the wire StepDiff only carries id/status/reason). */
export interface VerdictStepDiff extends StepDiff {
  proposedStep?: WalkthroughStep;
}

export interface AgentVerdict {
  summary: string;
  stepDiffs: VerdictStepDiff[];
  /** 'llm' when a model produced it, 'heuristic' for the no-key fallback */
  decidedBy: 'llm' | 'heuristic';
}
