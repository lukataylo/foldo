import { describe, expect, it } from 'vitest';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import type { Walkthrough, WalkthroughStep } from '@foldo/protocol';
import { stepFingerprint, validateWalkthroughSteps, applyStepDiffs } from '../models.ts';
import { stepsToVtt } from '../captions.ts';
import { heuristicVerdict } from '../verdict.ts';
import { assembleTake } from '../assemble.ts';
import { hasFfmpeg } from '../ffmpeg.ts';
import type { StepCaptureResult } from '../capture.ts';

const execFileAsync = promisify(execFile);

const step = (id: string, over: Partial<WalkthroughStep> = {}): WalkthroughStep => ({
  id,
  title: `Step ${id}`,
  narration: `This is ${id}.`,
  actions: [{ kind: 'goto', url: '/pricing' }],
  durationMs: 2000,
  ...over,
});

const walkthrough = (steps: WalkthroughStep[]): Walkthrough => ({
  id: 'w-test',
  boardId: 'b-test',
  title: 'Test walkthrough',
  targetUrl: 'http://localhost:5174',
  steps,
  createdAt: '2026-07-01T00:00:00Z',
  updatedAt: '2026-07-01T00:00:00Z',
});

describe('stepFingerprint', () => {
  it('is stable for identical steps and differs when narration changes', () => {
    const a = step('intro');
    const b = step('intro');
    expect(stepFingerprint(a)).toBe(stepFingerprint(b));
    expect(stepFingerprint(step('intro', { narration: 'Different.' }))).not.toBe(
      stepFingerprint(a),
    );
  });

  it('ignores undefined-vs-absent optional fields', () => {
    const a = step('intro', { actions: [{ kind: 'goto', url: '/x' }] });
    const b = step('intro', {
      actions: [{ kind: 'goto', url: '/x' } as WalkthroughStep['actions'][number]],
    });
    expect(stepFingerprint(a)).toBe(stepFingerprint(b));
  });
});

describe('validateWalkthroughSteps', () => {
  it('rejects duplicate ids and bad shapes', () => {
    expect(() => validateWalkthroughSteps([step('a'), step('a')])).toThrow(/duplicate/);
    expect(() =>
      validateWalkthroughSteps([step('bad', { actions: [{ kind: 'click', text: '' }] })]),
    ).toThrow(/click requires text/);
    expect(() => validateWalkthroughSteps([step('UPPER')])).toThrow(/snake_case/);
  });
});

describe('stepsToVtt', () => {
  it('lays cues end to end from declared durations', () => {
    const vtt = stepsToVtt([step('one'), step('two', { durationMs: 3000 })]);
    expect(vtt).toContain('WEBVTT');
    expect(vtt).toContain('00:00:00.000 --> 00:00:02.000');
    expect(vtt).toContain('00:00:02.000 --> 00:00:05.000');
    expect(vtt).toContain('This is two.');
  });
});

describe('heuristicVerdict', () => {
  it('marks steps changed when the diff mentions their anchors', () => {
    const wt = walkthrough([
      step('pricing', { actions: [{ kind: 'goto', url: '/pricing' }] }),
      step('cta', { actions: [{ kind: 'click', text: 'Start free trial' }] }),
      step('about', { actions: [{ kind: 'goto', url: '/about' }] }),
    ]);
    const verdict = heuristicVerdict(wt, {
      diff: `--- a/src/Landing.tsx\n+++ b/src/Landing.tsx\n-  <button>Start free trial</button>\n+  <button>Get started</button>\n`,
    });
    const byId = Object.fromEntries(verdict.stepDiffs.map((d) => [d.stepId, d.status]));
    expect(byId).toEqual({ pricing: 'unchanged', cta: 'changed', about: 'unchanged' });
    expect(verdict.decidedBy).toBe('heuristic');
  });

  it('re-films everything when there is no diff', () => {
    const wt = walkthrough([step('a'), step('b')]);
    const verdict = heuristicVerdict(wt, {});
    expect(verdict.stepDiffs.every((d) => d.status === 'changed')).toBe(true);
  });
});

describe('applyStepDiffs', () => {
  it('swaps changed steps, appends added, drops removed', () => {
    const wt = walkthrough([step('a'), step('b'), step('c')]);
    const next = applyStepDiffs(wt, [
      { stepId: 'a', status: 'unchanged', reason: '' },
      {
        stepId: 'b',
        status: 'changed',
        reason: '',
        proposedStep: step('b', { narration: 'New words.' }),
      },
      { stepId: 'c', status: 'removed', reason: '' },
      { stepId: 'd', status: 'added', reason: '', proposedStep: step('d') },
    ]);
    expect(next.map((s) => s.id)).toEqual(['a', 'b', 'd']);
    expect(next[1]?.narration).toBe('New words.');
  });
});

describe('assembleTake byte-identity (needs ffmpeg)', () => {
  it('reused segments are byte-identical to the parent take', async () => {
    if (!(await hasFfmpeg())) return; // environment without ffmpeg: covered in CI

    const steps = [step('one'), step('two')];
    const scratch = await mkdtemp(join(tmpdir(), 'foldo-director-'));

    // Synthesize two tiny "captured clips" with the same pinned params the
    // real capture path uses (color source stands in for a screen recording).
    const captures = new Map<string, StepCaptureResult>();
    for (const [i, s] of steps.entries()) {
      const clip = join(scratch, `${s.id}.clip.mp4`);
      await execFileAsync('ffmpeg', [
        '-y',
        '-f', 'lavfi',
        '-i', `color=c=${i === 0 ? 'red' : 'blue'}:s=320x240:d=2:r=30`,
        '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-pix_fmt', 'yuv420p',
        clip,
      ]);
      captures.set(s.id, {
        stepId: s.id,
        fingerprint: stepFingerprint(s),
        clipPath: clip,
        warnings: [],
        elapsedMs: 0,
      });
    }

    // Take 1: everything rebuilt.
    const take1 = await assembleTake({
      steps,
      captures,
      narration: new Map(),
      reuse: new Map(),
      outDir: join(scratch, 'take1'),
    });
    expect(take1.masterPath).toBeTruthy();
    expect(take1.segments.map((s) => s.source)).toEqual(['rebuilt', 'rebuilt']);

    // Take 2: step one reused from take 1, step two rebuilt.
    const take2 = await assembleTake({
      steps,
      captures,
      narration: new Map(),
      reuse: new Map([
        [
          'one',
          {
            path: take1.segmentPaths.get('one')!,
            sha256: take1.segments[0]!.segmentSha256!,
          },
        ],
      ]),
      outDir: join(scratch, 'take2'),
    });

    expect(take2.segments[0]!.source).toBe('reused');
    expect(take2.segments[0]!.segmentSha256).toBe(take1.segments[0]!.segmentSha256);
    const bytes1 = await readFile(take1.segmentPaths.get('one')!);
    const bytes2 = await readFile(take2.segmentPaths.get('one')!);
    expect(bytes2.equals(bytes1)).toBe(true);
    expect(take2.masterSha256).toBeTruthy();
  }, 120_000);

  it('degrades to a still-backed segment when a step has no clip', async () => {
    if (!(await hasFfmpeg())) return;
    const scratch = await mkdtemp(join(tmpdir(), 'foldo-director-still-'));
    const s = step('only');
    // A 1x1-ish PNG still (render via ffmpeg to keep the test dependency-free).
    const still = join(scratch, 'only.png');
    await execFileAsync('ffmpeg', [
      '-y', '-f', 'lavfi', '-i', 'color=c=green:s=320x240:d=1', '-frames:v', '1', still,
    ]);
    const out = await assembleTake({
      steps: [s],
      captures: new Map([
        [
          'only',
          {
            stepId: 'only',
            fingerprint: stepFingerprint(s),
            stillPath: still,
            warnings: [{ index: 0, kind: 'click', message: 'timeout' }],
            error: 'video capture failed',
            elapsedMs: 10,
          },
        ],
      ]),
      narration: new Map(),
      reuse: new Map(),
      outDir: join(scratch, 'take'),
    });
    expect(out.degraded).toBe(true);
    expect(out.segments[0]!.source).toBe('still');
    expect(out.masterPath).toBeTruthy(); // still-backed master still assembles
    expect(out.posterPath).toBe(still);
  }, 60_000);
});
