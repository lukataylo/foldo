import type {
  CommentTarget,
  Dispatch,
  DispatchEvent,
  DispatchStatus,
} from '@foldo/protocol';
import { query, queryOne, exec, type Executor } from '../db.ts';
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

export async function listDispatchesForBoard(boardId: string): Promise<Dispatch[]> {
  const rows = await query<DispatchRow>(
    `SELECT * FROM dispatches WHERE board_id = $1 ORDER BY created_at DESC`,
    [boardId],
  );
  return rows.map(rowToDispatch);
}

export async function getDispatchById(
  id: string,
  client?: Executor,
): Promise<Dispatch | null> {
  const r = await queryOne<DispatchRow>(
    `SELECT * FROM dispatches WHERE id = $1`,
    [id],
    client,
  );
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

export async function setDispatchStatus(
  id: string,
  status: DispatchStatus,
  event?: DispatchEvent,
): Promise<Dispatch | null> {
  const existing = await getDispatchById(id);
  if (!existing) return null;
  const events = event ? [...existing.events, event] : existing.events;
  const now = nowIso();
  const startedAt =
    status === 'running' && !existing.startedAt ? now : existing.startedAt ?? null;
  const finishedAt =
    status === 'done' || status === 'error' || status === 'cancelled' ? now : null;
  await exec(
    `UPDATE dispatches SET status = $1, events_json = $2, started_at = COALESCE($3, started_at),
       finished_at = COALESCE($4, finished_at)
     WHERE id = $5`,
    [status, JSON.stringify(events), startedAt, finishedAt, id],
  );
  return getDispatchById(id);
}

export async function addDispatchEvent(
  id: string,
  event: DispatchEvent,
): Promise<Dispatch | null> {
  const existing = await getDispatchById(id);
  if (!existing) return null;
  const events = [...existing.events, event];
  await exec(`UPDATE dispatches SET events_json = $1 WHERE id = $2`, [
    JSON.stringify(events),
    id,
  ]);
  return getDispatchById(id);
}

export async function completeDispatch(
  id: string,
  resultFrameId: string,
  resultCommitSha: string,
  event?: DispatchEvent,
  client?: Executor,
): Promise<Dispatch | null> {
  const existing = await getDispatchById(id, client);
  if (!existing) return null;
  const events = event ? [...existing.events, event] : existing.events;
  await exec(
    `UPDATE dispatches SET status = 'done', events_json = $1, result_frame_id = $2,
       result_commit_sha = $3, finished_at = $4 WHERE id = $5`,
    [JSON.stringify(events), resultFrameId, resultCommitSha, nowIso(), id],
    client,
  );
  return getDispatchById(id, client);
}

export async function failDispatch(id: string, message: string): Promise<Dispatch | null> {
  const existing = await getDispatchById(id);
  if (!existing) return null;
  const events: DispatchEvent[] = [
    ...existing.events,
    { ts: nowIso(), level: 'error', message },
  ];
  await exec(
    `UPDATE dispatches SET status = 'error', events_json = $1, error_message = $2, finished_at = $3
     WHERE id = $4`,
    [JSON.stringify(events), message, nowIso(), id],
  );
  return getDispatchById(id);
}
