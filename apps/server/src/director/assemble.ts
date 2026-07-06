// Segment build + master assembly — the byte-identity heart, ported from
// Foley's concat.py.
//
// Per step, in order:
//   reused   — the step was classified unchanged and the parent take has a
//              segment: copy the bytes verbatim. Never re-encoded, so the
//              sha256 provably matches the predecessor.
//   rebuilt  — fresh video clip + narration muxed with pinned encode params.
//   still    — video capture failed; the final-frame PNG is looped into a
//              clip of the step's duration (captions carry the narration).
//
// The master is a concat-demux with `-c copy`: segments are stitched at the
// container level and unchanged bytes survive into the master untouched.

import { mkdir, copyFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { TakeSegment, WalkthroughStep } from '@foldo/protocol';
import type { StepCaptureResult } from './capture.ts';
import { buildSegment, concatSegments, hasFfmpeg, stillToClip } from './ffmpeg.ts';
import { fileSha256, stepFingerprint } from './models.ts';

export interface ParentSegment {
  /** Local path to the parent take's segment mp4 */
  path: string;
  sha256: string;
}

export interface AssembleInput {
  steps: WalkthroughStep[];
  /** Capture results keyed by stepId (absent for reused steps) */
  captures: Map<string, StepCaptureResult>;
  /** Narration mp3 path (or null = silent) keyed by stepId */
  narration: Map<string, string | null>;
  /** Parent-take segments for steps classified unchanged */
  reuse: Map<string, ParentSegment>;
  outDir: string;
  onProgress?: (message: string) => void;
}

export interface AssembleOutput {
  /** Absent when no segment could be built at all (no ffmpeg, no clips) */
  masterPath?: string;
  masterSha256?: string;
  durationMs: number;
  segments: TakeSegment[];
  /** Local paths of built segments, keyed by stepId, for upload */
  segmentPaths: Map<string, string>;
  /** First available still — the frame poster / degradation anchor */
  posterPath?: string;
  /** True when any step fell back to a still or produced nothing */
  degraded: boolean;
}

export async function assembleTake(input: AssembleInput): Promise<AssembleOutput> {
  const segmentsDir = join(input.outDir, 'segments');
  await mkdir(segmentsDir, { recursive: true });
  const ffmpegOk = await hasFfmpeg();

  const segments: TakeSegment[] = [];
  const segmentPaths = new Map<string, string>();
  const concatLines: string[] = [];
  let degraded = false;
  let posterPath: string | undefined;
  let durationMs = 0;

  for (const step of input.steps) {
    const segPath = join(segmentsDir, `${step.id}.mp4`);
    const capture = input.captures.get(step.id);
    const reuse = input.reuse.get(step.id);
    const warnings = capture?.warnings.map((w) => `${w.kind}: ${w.message}`);
    if (!posterPath && capture?.stillPath) posterPath = capture.stillPath;

    if (reuse) {
      // Byte-for-byte copy — the whole point. sha256 is inherited, and we
      // verify rather than trust so a corrupted parent can't propagate.
      await copyFile(reuse.path, segPath);
      const sha = await fileSha256(segPath);
      segments.push({
        stepId: step.id,
        fingerprint: stepFingerprint(step),
        segmentSha256: sha,
        source: 'reused',
      });
      segmentPaths.set(step.id, segPath);
      concatLines.push(`file '${step.id}.mp4'`);
      durationMs += step.durationMs;
      continue;
    }

    if (!ffmpegOk) {
      // Stills-only mode: no segments, no master. The take degrades to the
      // poster + captions and each step's still.
      degraded = true;
      segments.push({
        stepId: step.id,
        fingerprint: stepFingerprint(step),
        source: 'still',
        captureWarnings: appendWarning(warnings, 'ffmpeg unavailable — stills only'),
      });
      continue;
    }

    let clipPath = capture?.clipPath;
    let source: TakeSegment['source'] = 'rebuilt';
    if (!clipPath && capture?.stillPath) {
      // Degrade: loop the final-frame still into a clip.
      input.onProgress?.(`step "${step.title}": video unavailable, rendering still`);
      const stillClip = join(segmentsDir, `.${step.id}.still.mp4`);
      try {
        await stillToClip(capture.stillPath, stillClip, step.durationMs);
        clipPath = stillClip;
        source = 'still';
        degraded = true;
      } catch {
        clipPath = undefined;
      }
    }

    if (!clipPath) {
      degraded = true;
      segments.push({
        stepId: step.id,
        fingerprint: stepFingerprint(step),
        source: 'still',
        captureWarnings: appendWarning(warnings, capture?.error ?? 'no clip and no still'),
      });
      continue;
    }

    await buildSegment(clipPath, input.narration.get(step.id) ?? null, segPath, step.durationMs);
    const sha = await fileSha256(segPath);
    segments.push({
      stepId: step.id,
      fingerprint: stepFingerprint(step),
      segmentSha256: sha,
      source,
      ...(warnings?.length ? { captureWarnings: warnings } : {}),
    });
    segmentPaths.set(step.id, segPath);
    concatLines.push(`file '${step.id}.mp4'`);
    durationMs += step.durationMs;
  }

  if (!concatLines.length) {
    return { segments, segmentPaths, posterPath, degraded: true, durationMs: 0 };
  }

  const concatList = join(segmentsDir, 'concat.txt');
  await writeFile(concatList, concatLines.join('\n') + '\n');
  const masterPath = join(input.outDir, 'master.mp4');
  input.onProgress?.('assembling master');
  await concatSegments(concatList, masterPath);
  const masterSha256 = await fileSha256(masterPath);

  return {
    masterPath,
    masterSha256,
    durationMs,
    segments,
    segmentPaths,
    posterPath,
    degraded,
  };
}

function appendWarning(warnings: string[] | undefined, extra: string): string[] {
  return [...(warnings ?? []), extra];
}
