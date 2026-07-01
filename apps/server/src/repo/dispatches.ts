import type {
  CommentTarget,
  Dispatch,
  DispatchEvent,
  DispatchStatus,
} from '@foldo/protocol';
import { query, queryOne, exec } from '../db.ts';
import { nowIso } from '../util.ts';

interface DispatchRow {
  id: string;
  board_id: string;
  frame_id: string;
  branch_id: string;
  initiator_user_id: string;
  // JSONB columns — pg returns them already parsed.
  target_json: CommentTarget | null;
  base_commit_sha: string;
  intent: string;
  status: DispatchStatus;
  events_json: DispatchEvent[] | null;
  result_frame_id: string | null;
  result_commit_sha: string | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  error_message: string | null;
}

function rowToDispatch(r: DispatchRow): Dispatch {
  return {
    id: r.id,
    boardId: r.board_id,
    frameId: r.frame_id,
    branchId: r.branch_id,
    initiatorUserId: r.initiator_user_id,
    target: r.target_json ?? ({} as CommentTarget),
    baseCommitSha: r.base_commit_sha,
    intent: r.intent,
    status: r.status,
    events: r.events_json ?? [],
    resultFrameId: r.result_frame_id ?? undefined,
    resultCommitSha: r.result_commit_sha ?? undefined,
    createdAt: r.created_at,
    startedAt: r.started_at ?? undefined,
    finishedAt: r.finished_at ?? undefined,
    errorMessage: r.error_message ?? undefined,
  };
}

export async function listDispatchesForBoard(boardId: string): Promise<Dispatch[]> {
  const rows = await query<DispatchRow>(
    `SELECT * FROM dispatches WHERE board_id = $1 ORDER BY created_at DESC`,
    [boardId],
  );
  return rows.map(rowToDispatch);
}

export async function getDispatchById(id: string): Promise<Dispatch | null> {
  const r = await queryOne<DispatchRow>(`SELECT * FROM dispatches WHERE id = $1`, [id]);
  return r ? rowToDispatch(r) : null;
}

export interface DispatchInsert {
  id: string;
  boardId: string;
  frameId: string;
  branchId: string;
  initiatorUserId: string;
  target: CommentTarget;
  baseCommitSha: string;
  intent: string;
}

export async function insertDispatch(d: DispatchInsert): Promise<Dispatch> {
  const now = nowIso();
  await exec(
    `INSERT INTO dispatches (id, board_id, frame_id, branch_id, initiator_user_id, target_json,
       base_commit_sha, intent, status, events_json, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'queued', '[]', $9)`,
    [
      d.id,
      d.boardId,
      d.frameId,
      d.branchId,
      d.initiatorUserId,
      JSON.stringify(d.target),
      d.baseCommitSha,
      d.intent,
      now,
    ],
  );
  return (await getDispatchById(d.id))!;
}

// All four mutators below are single atomic UPDATEs. The previous
// read-modify-write shape (getDispatchById → mutate events array in JS →
// UPDATE) lost concurrent `dispatch.progress` events — two interleaved
// handlers each read the same events_json and one write clobbered the
// other — and let a late progress message resurrect a terminal dispatch.
// Same pattern as the atomic replies_json append in repo/comments.ts.

const TERMINAL_GUARD = `status NOT IN ('done', 'error', 'cancelled')`;

export async function setDispatchStatus(
  id: string,
  status: DispatchStatus,
  event?: DispatchEvent,
): Promise<Dispatch | null> {
  const rows = await query<DispatchRow>(
    `UPDATE dispatches
        SET status = $2,
            events_json = COALESCE(events_json, '[]'::jsonb) || $3::jsonb,
            started_at = CASE WHEN $2 = 'running'
                              THEN COALESCE(started_at, $4) ELSE started_at END,
            finished_at = CASE WHEN $2 IN ('done', 'error', 'cancelled')
                               THEN COALESCE(finished_at, $4) ELSE finished_at END
      WHERE id = $1 AND ${TERMINAL_GUARD}
      RETURNING *`,
    [id, status, JSON.stringify(event ? [event] : []), nowIso()],
  );
  const row = rows[0];
  if (row) return rowToDispatch(row);
  // Already terminal: return current state unchanged so callers can still
  // broadcast the real status; null only when the dispatch doesn't exist.
  return getDispatchById(id);
}

export async function addDispatchEvent(
  id: string,
  event: DispatchEvent,
): Promise<Dispatch | null> {
  const rows = await query<DispatchRow>(
    `UPDATE dispatches
        SET events_json = COALESCE(events_json, '[]'::jsonb) || $2::jsonb
      WHERE id = $1
      RETURNING *`,
    [id, JSON.stringify([event])],
  );
  const row = rows[0];
  return row ? rowToDispatch(row) : null;
}

export async function completeDispatch(
  id: string,
  resultFrameId: string,
  resultCommitSha: string,
  event?: DispatchEvent,
): Promise<Dispatch | null> {
  const rows = await query<DispatchRow>(
    `UPDATE dispatches
        SET status = 'done',
            events_json = COALESCE(events_json, '[]'::jsonb) || $2::jsonb,
            result_frame_id = $3,
            result_commit_sha = $4,
            finished_at = $5
      WHERE id = $1 AND ${TERMINAL_GUARD}
      RETURNING *`,
    [id, JSON.stringify(event ? [event] : []), resultFrameId, resultCommitSha, nowIso()],
  );
  const row = rows[0];
  return row ? rowToDispatch(row) : null;
}

/**
 * Watchdog: flip every non-terminal dispatch created before `olderThanIso`
 * to `error`. WS delivery of dispatch.completed/failed is not guaranteed
 * (agent crash, socket flap past the client's queue) — without a sweep those
 * rows sit in "running" forever and the board shows a stuck spinner.
 * Returns the affected dispatches so the caller can broadcast.
 */
export async function sweepStaleDispatches(
  olderThanIso: string,
): Promise<Dispatch[]> {
  const event: DispatchEvent = {
    ts: nowIso(),
    level: 'error',
    message: 'Dispatch timed out waiting for the agent.',
  };
  const rows = await query<DispatchRow>(
    `UPDATE dispatches
        SET status = 'error',
            events_json = COALESCE(events_json, '[]'::jsonb) || $2::jsonb,
            error_message = 'dispatch timed out',
            finished_at = $3
      WHERE ${TERMINAL_GUARD} AND created_at < $1
      RETURNING *`,
    [olderThanIso, JSON.stringify([event]), nowIso()],
  );
  return rows.map(rowToDispatch);
}

export async function failDispatch(id: string, message: string): Promise<Dispatch | null> {
  const event: DispatchEvent = { ts: nowIso(), level: 'error', message };
  const rows = await query<DispatchRow>(
    `UPDATE dispatches
        SET status = 'error',
            events_json = COALESCE(events_json, '[]'::jsonb) || $2::jsonb,
            error_message = $3,
            finished_at = $4
      WHERE id = $1 AND ${TERMINAL_GUARD}
      RETURNING *`,
    [id, JSON.stringify([event]), message, nowIso()],
  );
  const row = rows[0];
  return row ? rowToDispatch(row) : null;
}
