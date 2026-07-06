// The director service — Foldo's core engine after the living-docs pivot.
//
// One entry point: `enqueueTake(walkthroughId, trigger)`. Called by the
// GitHub webhook when a PR merges, and by the manual render endpoint. It
// inserts a queued take, drops a `walkthrough` frame on the board beside its
// predecessor (stakeholders watch it go queued → capturing → rendering →
// ready live), and runs the pipeline in the background:
//
//   verdict   which steps did the diff touch? (LLM, or heuristic fallback)
//   capture   grounded Playwright filming of changed/added steps only
//   narrate   ElevenLabs per-step, hash-cached (silent + captions without a key)
//   assemble  segments muxed with pinned encode params; unchanged steps are
//             copied byte-for-byte from the parent take; concat -c copy
//   publish   master.mp4 / poster.png / captions.vtt into Storage, frame
//             content updated, walkthrough spec advanced to the new steps
//
// Reliability beats features: every stage degrades rather than dies — the
// worst outcome is a 'degraded' take of stills + captions, and a genuine
// failure lands as an 'error' frame with the message on it, retryable from
// the board.

import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type {
  Board,
  Frame,
  StepDiff,
  TakeStatus,
  Walkthrough,
  WalkthroughFrameContent,
  WalkthroughStep,
} from '@foldo/protocol';
import { getBoardById } from '../repo/boards.ts';
import { getBranchById, upsertBranch } from '../repo/branches.ts';
import { getFrameById, insertFrame, listFramesForBoard, updateFrame } from '../repo/frames.ts';
import {
  getLatestFinishedTake,
  getTakeById,
  getWalkthroughById,
  insertTake,
  updateTake,
  updateWalkthrough,
  type TakeRecord,
} from '../repo/walkthroughs.ts';
import { getStorage } from '../storage/index.ts';
import { hub } from '../ws/hub.ts';
import { jobLogger } from '../log.ts';
import { newId, nowIso } from '../util.ts';
import { trackFunnelEvent } from '../repo/analytics.ts';
import { captureSteps, type StepCaptureResult } from './capture.ts';
import { assembleTake, type ParentSegment } from './assemble.ts';
import { stepsToVtt } from './captions.ts';
import { reviewPr } from './verdict.ts';
import { applyStepDiffs, type AgentVerdict, type VerdictStepDiff } from './models.ts';

const log = jobLogger('director');

const FRAME_WIDTH = 720;
const FRAME_HEIGHT = 560;
const FRAME_GAP = 80;

export interface TakeTrigger {
  prNumber?: number;
  prTitle?: string;
  prBody?: string;
  diff?: string;
  /** Overrides the director's summary (manual renders) */
  summary?: string;
  mergeCommitSha?: string;
}

// One render at a time per walkthrough; extra triggers queue behind it. A
// second merged PR while the first is filming is common on active repos.
const chains = new Map<string, Promise<void>>();

/**
 * Create the take + its board frame synchronously (so the caller can return
 * them), then run the pipeline in the background. Never rejects.
 */
export async function enqueueTake(
  walkthroughId: string,
  trigger: TakeTrigger,
): Promise<TakeRecord | null> {
  const walkthrough = await getWalkthroughById(walkthroughId);
  if (!walkthrough) return null;
  const board = await getBoardById(walkthrough.boardId);
  if (!board) return null;

  const parent = await getLatestFinishedTake(walkthroughId);
  const take = await insertTake({
    id: newId('take'),
    walkthroughId,
    parentTakeId: parent?.id,
    prNumber: trigger.prNumber,
    prTitle: trigger.prTitle,
    steps: walkthrough.steps,
  });

  const frame = await createTakeFrame(board, walkthrough, take, parent);
  await updateTake(take.id, { frameId: frame.id });
  hub.broadcast(board.id, { type: 'frame.added', frame });

  const prev = chains.get(walkthroughId) ?? Promise.resolve();
  const next = prev
    .then(() => runTake(walkthrough.id, take.id, trigger))
    .catch((err) => {
      log.error({ err, takeId: take.id }, 'director take crashed');
    });
  chains.set(walkthroughId, next);
  void next.finally(() => {
    if (chains.get(walkthroughId) === next) chains.delete(walkthroughId);
  });

  return (await getTakeById(take.id))!;
}

/** Position the new frame immediately right of its predecessor take's frame,
 * falling back to the right edge of the board. */
async function createTakeFrame(
  board: Board,
  walkthrough: Walkthrough,
  take: TakeRecord,
  parent: TakeRecord | null,
): Promise<Frame> {
  const now = nowIso();

  // Walkthrough frames live on a dedicated agent-authored branch so the
  // board groups them visually, like dispatch results group under theirs.
  const branchId = `${board.id}:walkthroughs`;
  if (!(await getBranchById(branchId))) {
    await upsertBranch({
      id: branchId,
      boardId: board.id,
      name: 'walkthroughs',
      authoredBy: 'agent',
      authorUserId: 'u-director',
      agentName: 'Foldo Director',
      color: '#e8a13c',
      headSha: take.id,
      createdAt: now,
      updatedAt: now,
    });
  }

  let position = { x: 120, y: 120 };
  const parentFrame = parent?.frameId ? await getFrameById(parent.frameId) : null;
  if (parentFrame) {
    position = {
      x: parentFrame.position.x + parentFrame.size.width + FRAME_GAP,
      y: parentFrame.position.y,
    };
  } else {
    const frames = await listFramesForBoard(board.id);
    if (frames.length) {
      const rightmost = frames.reduce((a, b) =>
        a.position.x + a.size.width > b.position.x + b.size.width ? a : b,
      );
      position = {
        x: rightmost.position.x + rightmost.size.width + FRAME_GAP,
        y: rightmost.position.y,
      };
    }
  }

  const content: WalkthroughFrameContent = {
    kind: 'walkthrough',
    walkthroughId: walkthrough.id,
    takeId: take.id,
    title: walkthrough.title,
    status: 'queued',
    prNumber: take.prNumber,
    prTitle: take.prTitle,
  };

  const frame: Frame = {
    id: newId('frame'),
    boardId: board.id,
    kind: 'walkthrough',
    branchId,
    commitSha: take.id,
    commitMessage: take.prTitle
      ? `PR #${take.prNumber}: ${take.prTitle}`
      : `Walkthrough take`,
    age: 'now',
    position,
    size: { width: FRAME_WIDTH, height: FRAME_HEIGHT },
    content,
    parentFrameId: parentFrame?.id,
    createdAt: now,
    updatedAt: now,
  };
  return insertFrame(frame);
}

async function setTakeStage(
  boardId: string,
  takeId: string,
  status: TakeStatus,
  contentPatch: Partial<WalkthroughFrameContent> = {},
): Promise<void> {
  const take = await updateTake(takeId, { status });
  if (!take?.frameId) return;
  const frame = await getFrameById(take.frameId);
  if (!frame || frame.content.kind !== 'walkthrough') return;
  const updated = await updateFrame(frame.id, {
    content: { ...frame.content, status, ...contentPatch },
  });
  if (updated) hub.broadcast(boardId, { type: 'frame.updated', frame: updated });
}

async function runTake(
  walkthroughId: string,
  takeId: string,
  trigger: TakeTrigger,
): Promise<void> {
  const walkthrough = await getWalkthroughById(walkthroughId);
  const take = await getTakeById(takeId);
  if (!walkthrough || !take) return;
  const boardId = walkthrough.boardId;
  const warnings: string[] = [];
  const warn = (m: string) => {
    warnings.push(m);
    log.warn({ takeId, walkthroughId }, m);
  };

  const scratch = await mkdtemp(join(tmpdir(), `foldo-take-${takeId}-`));
  try {
    // ── verdict ────────────────────────────────────────────────────────────
    const parent = take.parentTakeId ? await getTakeById(take.parentTakeId) : null;
    let verdict: AgentVerdict;
    if (!parent) {
      verdict = {
        summary: trigger.summary ?? 'Initial walkthrough of the product.',
        decidedBy: 'heuristic',
        stepDiffs: walkthrough.steps.map((s) => ({
          stepId: s.id,
          status: 'changed' as const,
          reason: 'First take — filming every step.',
          proposedStep: s,
        })),
      };
    } else {
      verdict = await reviewPr(walkthrough, {
        diff: trigger.diff,
        prTitle: trigger.prTitle,
        prBody: trigger.prBody,
        onWarning: warn,
      });
      if (trigger.summary) verdict.summary = trigger.summary;
    }

    const effectiveSteps = applyStepDiffs(walkthrough, verdict.stepDiffs);
    if (!effectiveSteps.length) throw new Error('verdict removed every step');
    const wireDiffs: StepDiff[] = verdict.stepDiffs.map(({ stepId, status, reason }) => ({
      stepId,
      status,
      reason,
    }));
    await updateTake(takeId, {
      stepDiffs: wireDiffs,
      steps: effectiveSteps,
      summary: verdict.summary,
    });
    await setTakeStage(boardId, takeId, 'capturing', {
      summary: verdict.summary,
      stepDiffs: wireDiffs,
    });

    // ── plan reuse vs re-film ──────────────────────────────────────────────
    const reusableIds = new Set(
      verdict.stepDiffs.filter((d) => d.status === 'unchanged').map((d) => d.stepId),
    );
    const reuse = new Map<string, ParentSegment>();
    if (parent) {
      for (const seg of parent.segments) {
        if (!reusableIds.has(seg.stepId) || !seg.segmentSha256) continue;
        const stored = await getStorage().get(
          `walkthroughs/${parent.id}/segments/${seg.stepId}.mp4`,
        );
        if (!stored) continue;
        const local = join(scratch, `parent-${seg.stepId}.mp4`);
        await writeFile(local, stored.body);
        reuse.set(seg.stepId, { path: local, sha256: seg.segmentSha256 });
      }
    }
    const toFilm = effectiveSteps.filter((s) => !reuse.has(s.id));

    // ── capture ────────────────────────────────────────────────────────────
    const captureResults = await captureSteps(walkthrough, toFilm, {
      workDir: join(scratch, 'capture'),
      authActions: walkthrough.authActions,
      onProgress: (m) => log.info({ takeId }, m),
    });
    const captures = new Map<string, StepCaptureResult>(
      captureResults.map((r) => [r.stepId, r]),
    );

    // ── narrate ────────────────────────────────────────────────────────────
    const { synthNarration } = await import('./narrator.ts');
    const narration = new Map<string, string | null>();
    const narrationCache = join(
      process.env.FOLDO_DIRECTOR_CACHE_DIR ?? join(tmpdir(), 'foldo-narration-cache'),
      walkthroughId,
    );
    for (const step of toFilm) {
      narration.set(
        step.id,
        await synthNarration(step.narration, { cacheDir: narrationCache, onWarning: warn }),
      );
    }

    // ── assemble ───────────────────────────────────────────────────────────
    await setTakeStage(boardId, takeId, 'rendering');
    const assembled = await assembleTake({
      steps: effectiveSteps,
      captures,
      narration,
      reuse,
      outDir: join(scratch, 'out'),
      onProgress: (m) => log.info({ takeId }, m),
    });

    // ── publish ────────────────────────────────────────────────────────────
    const storage = getStorage();
    let videoKey: string | undefined;
    let posterKey: string | undefined;
    if (assembled.masterPath) {
      videoKey = `walkthroughs/${takeId}/master.mp4`;
      await storage.put(videoKey, await readFile(assembled.masterPath), 'video/mp4');
    }
    if (assembled.posterPath) {
      posterKey = `walkthroughs/${takeId}/poster.png`;
      await storage.put(posterKey, await readFile(assembled.posterPath), 'image/png');
    }
    const captionsKey = `walkthroughs/${takeId}/captions.vtt`;
    await storage.put(captionsKey, Buffer.from(stepsToVtt(effectiveSteps)), 'text/vtt');
    for (const [stepId, segPath] of assembled.segmentPaths) {
      await storage.put(
        `walkthroughs/${takeId}/segments/${stepId}.mp4`,
        await readFile(segPath),
        'video/mp4',
      );
    }

    const degradedStepIds = assembled.segments
      .filter((s) => s.source === 'still')
      .map((s) => s.stepId);
    const status: TakeStatus = assembled.masterPath
      ? assembled.degraded
        ? 'degraded'
        : 'ready'
      : 'degraded';

    await updateTake(takeId, {
      segments: assembled.segments,
      masterSha256: assembled.masterSha256,
      videoKey,
      posterKey,
      captionsKey,
      durationMs: assembled.durationMs,
      finishedAt: nowIso(),
      ...(warnings.length ? { errorMessage: warnings.join('; ').slice(0, 900) } : {}),
    });
    // The walkthrough spec advances to what was actually filmed, so the next
    // PR diffs against reality.
    await updateWalkthrough(walkthroughId, { steps: effectiveSteps });

    await setTakeStage(boardId, takeId, status, {
      videoUrl: videoKey ? `/api/walkthroughs/files/${videoKey}` : undefined,
      posterUrl: posterKey ? `/api/walkthroughs/files/${posterKey}` : undefined,
      captionsUrl: `/api/walkthroughs/files/${captionsKey}`,
      durationMs: assembled.durationMs,
      degradedStepIds: degradedStepIds.length ? degradedStepIds : undefined,
    });

    const board = await getBoardById(boardId);
    if (board) {
      // Funnel: the board owner's first finished walkthrough.
      await trackFunnelEvent('first_walkthrough', {
        boardId,
        metadata: { takeId, status },
      }).catch(() => {});
    }
    log.info(
      { takeId, status, reused: reuse.size, filmed: toFilm.length },
      'director take finished',
    );
  } catch (err) {
    const message = String(err instanceof Error ? err.message : err).slice(0, 500);
    log.error({ takeId, err }, 'director take failed');
    await updateTake(takeId, { errorMessage: message, finishedAt: nowIso() }).catch(
      () => {},
    );
    await setTakeStage(boardId, takeId, 'error', {}).catch(() => {});
  } finally {
    await rm(scratch, { recursive: true, force: true }).catch(() => {});
  }
}

/** Kick a take for every walkthrough on the board mapped to this repo —
 * called by the GitHub webhook on merged PRs. */
export async function onPrMerged(
  board: Board,
  walkthroughs: Walkthrough[],
  trigger: TakeTrigger,
): Promise<TakeRecord[]> {
  const takes: TakeRecord[] = [];
  for (const w of walkthroughs) {
    const t = await enqueueTake(w.id, trigger);
    if (t) takes.push(t);
  }
  return takes;
}

/** Test seam: wait for the walkthrough's render chain to drain. */
export async function waitForDirectorIdle(walkthroughId: string): Promise<void> {
  await chains.get(walkthroughId);
}

export type { VerdictStepDiff, WalkthroughStep };
