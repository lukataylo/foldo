import type {
  StepDiff,
  Take,
  TakeSegment,
  TakeStatus,
  Walkthrough,
  WalkthroughAction,
  WalkthroughStep,
} from '@foldo/protocol';
import { query, queryOne, exec } from '../db.ts';
import { nowIso } from '../util.ts';

// ---------- walkthroughs ----------

interface WalkthroughRow {
  id: string;
  board_id: string;
  title: string;
  target_url: string;
  steps_json: WalkthroughStep[] | null;
  auth_actions_json: WalkthroughAction[] | null;
  created_at: string;
  updated_at: string;
}

function rowToWalkthrough(r: WalkthroughRow): Walkthrough {
  return {
    id: r.id,
    boardId: r.board_id,
    title: r.title,
    targetUrl: r.target_url,
    steps: r.steps_json ?? [],
    authActions: r.auth_actions_json ?? undefined,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export async function listWalkthroughsForBoard(boardId: string): Promise<Walkthrough[]> {
  const rows = await query<WalkthroughRow>(
    `SELECT * FROM walkthroughs WHERE board_id = $1 ORDER BY created_at ASC`,
    [boardId],
  );
  return rows.map(rowToWalkthrough);
}

export async function getWalkthroughById(id: string): Promise<Walkthrough | null> {
  const r = await queryOne<WalkthroughRow>(`SELECT * FROM walkthroughs WHERE id = $1`, [id]);
  return r ? rowToWalkthrough(r) : null;
}

export interface WalkthroughInsert {
  id: string;
  boardId: string;
  title: string;
  targetUrl: string;
  steps: WalkthroughStep[];
  authActions?: WalkthroughAction[];
}

export async function insertWalkthrough(w: WalkthroughInsert): Promise<Walkthrough> {
  const now = nowIso();
  await exec(
    `INSERT INTO walkthroughs (id, board_id, title, target_url, steps_json, auth_actions_json, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $7)`,
    [
      w.id,
      w.boardId,
      w.title,
      w.targetUrl,
      JSON.stringify(w.steps),
      w.authActions ? JSON.stringify(w.authActions) : null,
      now,
    ],
  );
  return (await getWalkthroughById(w.id))!;
}

export async function updateWalkthrough(
  id: string,
  patch: {
    title?: string;
    targetUrl?: string;
    steps?: WalkthroughStep[];
    authActions?: WalkthroughAction[];
  },
): Promise<Walkthrough | null> {
  const existing = await getWalkthroughById(id);
  if (!existing) return null;
  await exec(
    `UPDATE walkthroughs SET title = $1, target_url = $2, steps_json = $3,
       auth_actions_json = $4, updated_at = $5 WHERE id = $6`,
    [
      patch.title ?? existing.title,
      patch.targetUrl ?? existing.targetUrl,
      JSON.stringify(patch.steps ?? existing.steps),
      JSON.stringify(patch.authActions ?? existing.authActions ?? null),
      nowIso(),
      id,
    ],
  );
  return getWalkthroughById(id);
}

// ---------- takes ----------

interface TakeRow {
  id: string;
  walkthrough_id: string;
  parent_take_id: string | null;
  pr_number: number | null;
  pr_title: string | null;
  summary: string | null;
  status: TakeStatus;
  step_diffs_json: StepDiff[] | null;
  segments_json: TakeSegment[] | null;
  steps_json: WalkthroughStep[] | null;
  master_sha256: string | null;
  video_key: string | null;
  poster_key: string | null;
  captions_key: string | null;
  duration_ms: number | null;
  frame_id: string | null;
  created_at: string;
  finished_at: string | null;
  error_message: string | null;
}

/** Storage keys are internal; the wire Take carries /api URLs instead. */
export interface TakeRecord extends Take {
  videoKey?: string;
  posterKey?: string;
  captionsKey?: string;
  steps: WalkthroughStep[];
}

function rowToTake(r: TakeRow): TakeRecord {
  return {
    id: r.id,
    walkthroughId: r.walkthrough_id,
    parentTakeId: r.parent_take_id ?? undefined,
    prNumber: r.pr_number ?? undefined,
    prTitle: r.pr_title ?? undefined,
    summary: r.summary ?? undefined,
    status: r.status,
    stepDiffs: r.step_diffs_json ?? [],
    segments: r.segments_json ?? [],
    steps: r.steps_json ?? [],
    masterSha256: r.master_sha256 ?? undefined,
    videoUrl: r.video_key ? `/api/walkthroughs/files/${r.video_key}` : undefined,
    posterUrl: r.poster_key ? `/api/walkthroughs/files/${r.poster_key}` : undefined,
    captionsUrl: r.captions_key ? `/api/walkthroughs/files/${r.captions_key}` : undefined,
    videoKey: r.video_key ?? undefined,
    posterKey: r.poster_key ?? undefined,
    captionsKey: r.captions_key ?? undefined,
    durationMs: r.duration_ms ?? undefined,
    frameId: r.frame_id ?? undefined,
    createdAt: r.created_at,
    finishedAt: r.finished_at ?? undefined,
    errorMessage: r.error_message ?? undefined,
  };
}

export async function listTakesForWalkthrough(walkthroughId: string): Promise<TakeRecord[]> {
  const rows = await query<TakeRow>(
    `SELECT * FROM walkthrough_takes WHERE walkthrough_id = $1 ORDER BY created_at ASC`,
    [walkthroughId],
  );
  return rows.map(rowToTake);
}

export async function getTakeById(id: string): Promise<TakeRecord | null> {
  const r = await queryOne<TakeRow>(`SELECT * FROM walkthrough_takes WHERE id = $1`, [id]);
  return r ? rowToTake(r) : null;
}

/** The most recent take that produced reusable segments (ready/degraded). */
export async function getLatestFinishedTake(
  walkthroughId: string,
): Promise<TakeRecord | null> {
  const r = await queryOne<TakeRow>(
    `SELECT * FROM walkthrough_takes
     WHERE walkthrough_id = $1 AND status IN ('ready','degraded')
     ORDER BY created_at DESC LIMIT 1`,
    [walkthroughId],
  );
  return r ? rowToTake(r) : null;
}

export interface TakeInsert {
  id: string;
  walkthroughId: string;
  parentTakeId?: string;
  prNumber?: number;
  prTitle?: string;
  steps: WalkthroughStep[];
}

export async function insertTake(t: TakeInsert): Promise<TakeRecord> {
  await exec(
    `INSERT INTO walkthrough_takes (id, walkthrough_id, parent_take_id, pr_number, pr_title, status, steps_json, created_at)
     VALUES ($1, $2, $3, $4, $5, 'queued', $6, $7)`,
    [
      t.id,
      t.walkthroughId,
      t.parentTakeId ?? null,
      t.prNumber ?? null,
      t.prTitle ?? null,
      JSON.stringify(t.steps),
      nowIso(),
    ],
  );
  return (await getTakeById(t.id))!;
}

export async function updateTake(
  id: string,
  patch: Partial<{
    status: TakeStatus;
    summary: string;
    stepDiffs: StepDiff[];
    segments: TakeSegment[];
    steps: WalkthroughStep[];
    masterSha256: string;
    videoKey: string;
    posterKey: string;
    captionsKey: string;
    durationMs: number;
    frameId: string;
    finishedAt: string;
    errorMessage: string;
  }>,
): Promise<TakeRecord | null> {
  const existing = await getTakeById(id);
  if (!existing) return null;
  await exec(
    `UPDATE walkthrough_takes SET
       status = $1, summary = $2, step_diffs_json = $3, segments_json = $4,
       steps_json = $5, master_sha256 = $6, video_key = $7, poster_key = $8,
       captions_key = $9, duration_ms = $10, frame_id = $11, finished_at = $12,
       error_message = $13
     WHERE id = $14`,
    [
      patch.status ?? existing.status,
      patch.summary ?? existing.summary ?? null,
      JSON.stringify(patch.stepDiffs ?? existing.stepDiffs),
      JSON.stringify(patch.segments ?? existing.segments),
      JSON.stringify(patch.steps ?? existing.steps),
      patch.masterSha256 ?? existing.masterSha256 ?? null,
      patch.videoKey ?? existing.videoKey ?? null,
      patch.posterKey ?? existing.posterKey ?? null,
      patch.captionsKey ?? existing.captionsKey ?? null,
      patch.durationMs ?? existing.durationMs ?? null,
      patch.frameId ?? existing.frameId ?? null,
      patch.finishedAt ?? existing.finishedAt ?? null,
      patch.errorMessage ?? existing.errorMessage ?? null,
      id,
    ],
  );
  return getTakeById(id);
}
