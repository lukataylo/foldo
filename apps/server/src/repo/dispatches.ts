import type {
  CommentTarget,
  Dispatch,
  DispatchEvent,
  DispatchStatus,
} from '@foldo/protocol';
import { db } from '../db.ts';
import { nowIso, parseJson } from '../util.ts';

interface DispatchRow {
  id: string;
  board_id: string;
  frame_id: string;
  branch_id: string;
  initiator_user_id: string;
  target_json: string;
  base_commit_sha: string;
  intent: string;
  status: DispatchStatus;
  events_json: string;
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
    target: parseJson<CommentTarget>(r.target_json, {}),
    baseCommitSha: r.base_commit_sha,
    intent: r.intent,
    status: r.status,
    events: parseJson<DispatchEvent[]>(r.events_json, []),
    resultFrameId: r.result_frame_id ?? undefined,
    resultCommitSha: r.result_commit_sha ?? undefined,
    createdAt: r.created_at,
    startedAt: r.started_at ?? undefined,
    finishedAt: r.finished_at ?? undefined,
    errorMessage: r.error_message ?? undefined,
  };
}

export function listDispatchesForBoard(boardId: string): Dispatch[] {
  const rows = db
    .prepare(`SELECT * FROM dispatches WHERE board_id = ? ORDER BY created_at DESC`)
    .all(boardId) as DispatchRow[];
  return rows.map(rowToDispatch);
}

export function getDispatchById(id: string): Dispatch | null {
  const r = db.prepare(`SELECT * FROM dispatches WHERE id = ?`).get(id) as
    | DispatchRow
    | undefined;
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

export function insertDispatch(d: DispatchInsert): Dispatch {
  const now = nowIso();
  db.prepare(
    `INSERT INTO dispatches (id, board_id, frame_id, branch_id, initiator_user_id, target_json,
       base_commit_sha, intent, status, events_json, created_at)
     VALUES (@id, @board_id, @frame_id, @branch_id, @initiator_user_id, @target_json,
       @base_commit_sha, @intent, 'queued', '[]', @created_at)`,
  ).run({
    id: d.id,
    board_id: d.boardId,
    frame_id: d.frameId,
    branch_id: d.branchId,
    initiator_user_id: d.initiatorUserId,
    target_json: JSON.stringify(d.target),
    base_commit_sha: d.baseCommitSha,
    intent: d.intent,
    created_at: now,
  });
  return getDispatchById(d.id)!;
}

export function setDispatchStatus(
  id: string,
  status: DispatchStatus,
  event?: DispatchEvent,
): Dispatch | null {
  const existing = getDispatchById(id);
  if (!existing) return null;
  const events = event ? [...existing.events, event] : existing.events;
  const now = nowIso();
  const startedAt =
    status === 'running' && !existing.startedAt ? now : existing.startedAt ?? null;
  const finishedAt =
    status === 'done' || status === 'error' || status === 'cancelled' ? now : null;
  db.prepare(
    `UPDATE dispatches SET status = ?, events_json = ?, started_at = COALESCE(?, started_at),
       finished_at = COALESCE(?, finished_at)
     WHERE id = ?`,
  ).run(status, JSON.stringify(events), startedAt, finishedAt, id);
  return getDispatchById(id);
}

export function addDispatchEvent(id: string, event: DispatchEvent): Dispatch | null {
  const existing = getDispatchById(id);
  if (!existing) return null;
  const events = [...existing.events, event];
  db.prepare(`UPDATE dispatches SET events_json = ? WHERE id = ?`).run(
    JSON.stringify(events),
    id,
  );
  return getDispatchById(id);
}

export function completeDispatch(
  id: string,
  resultFrameId: string,
  resultCommitSha: string,
  event?: DispatchEvent,
): Dispatch | null {
  const existing = getDispatchById(id);
  if (!existing) return null;
  const events = event ? [...existing.events, event] : existing.events;
  db.prepare(
    `UPDATE dispatches SET status = 'done', events_json = ?, result_frame_id = ?,
       result_commit_sha = ?, finished_at = ? WHERE id = ?`,
  ).run(JSON.stringify(events), resultFrameId, resultCommitSha, nowIso(), id);
  return getDispatchById(id);
}

export function failDispatch(id: string, message: string): Dispatch | null {
  const existing = getDispatchById(id);
  if (!existing) return null;
  const events: DispatchEvent[] = [
    ...existing.events,
    { ts: nowIso(), level: 'error', message },
  ];
  db.prepare(
    `UPDATE dispatches SET status = 'error', events_json = ?, error_message = ?, finished_at = ?
     WHERE id = ?`,
  ).run(JSON.stringify(events), message, nowIso(), id);
  return getDispatchById(id);
}
