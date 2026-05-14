import type { Frame, FrameContent, FrameKind } from '@foldo/protocol';
import { query, queryOne, exec } from '../db.ts';
import { nowIso, parseJson } from '../util.ts';

interface FrameRow {
  id: string;
  board_id: string;
  kind: FrameKind;
  branch_id: string;
  commit_sha: string;
  commit_message: string;
  age: string;
  position_x: number;
  position_y: number;
  width: number;
  height: number;
  content_json: string;
  parent_frame_id: string | null;
  generated_by_dispatch_id: string | null;
  captured_from_url: string | null;
  created_at: string;
  updated_at: string;
}

function rowToFrame(r: FrameRow): Frame {
  return {
    id: r.id,
    boardId: r.board_id,
    kind: r.kind,
    branchId: r.branch_id,
    commitSha: r.commit_sha,
    commitMessage: r.commit_message,
    age: r.age,
    position: { x: Number(r.position_x), y: Number(r.position_y) },
    size: { width: Number(r.width), height: Number(r.height) },
    content: parseJson<FrameContent>(r.content_json, {
      kind: 'markdown',
      docPath: '',
      title: '',
    } as FrameContent),
    parentFrameId: r.parent_frame_id ?? undefined,
    generatedByDispatchId: r.generated_by_dispatch_id ?? undefined,
    capturedFromUrl: r.captured_from_url ?? undefined,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export async function listFramesForBoard(boardId: string): Promise<Frame[]> {
  const rows = await query<FrameRow>(
    `SELECT * FROM frames WHERE board_id = $1 ORDER BY created_at`,
    [boardId],
  );
  return rows.map(rowToFrame);
}

export async function getFrameById(id: string): Promise<Frame | null> {
  const r = await queryOne<FrameRow>(`SELECT * FROM frames WHERE id = $1`, [id]);
  return r ? rowToFrame(r) : null;
}

export async function insertFrame(f: Frame): Promise<Frame> {
  await exec(
    `INSERT INTO frames (id, board_id, kind, branch_id, commit_sha, commit_message, age,
       position_x, position_y, width, height, content_json, parent_frame_id,
       generated_by_dispatch_id, captured_from_url, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)`,
    [
      f.id,
      f.boardId,
      f.kind,
      f.branchId,
      f.commitSha,
      f.commitMessage,
      f.age,
      f.position.x,
      f.position.y,
      f.size.width,
      f.size.height,
      JSON.stringify(f.content),
      f.parentFrameId ?? null,
      f.generatedByDispatchId ?? null,
      f.capturedFromUrl ?? null,
      f.createdAt,
      f.updatedAt,
    ],
  );
  return f;
}

export interface FrameUpdate {
  position?: { x: number; y: number };
  size?: { width: number; height: number };
  content?: FrameContent;
}

export async function updateFrame(id: string, patch: FrameUpdate): Promise<Frame | null> {
  const existing = await getFrameById(id);
  if (!existing) return null;
  const next: Frame = {
    ...existing,
    position: patch.position ?? existing.position,
    size: patch.size ?? existing.size,
    content: patch.content ?? existing.content,
    updatedAt: nowIso(),
  };
  await exec(
    `UPDATE frames SET
       position_x = $1,
       position_y = $2,
       width = $3,
       height = $4,
       content_json = $5,
       updated_at = $6
     WHERE id = $7`,
    [
      next.position.x,
      next.position.y,
      next.size.width,
      next.size.height,
      JSON.stringify(next.content),
      next.updatedAt,
      id,
    ],
  );
  return next;
}

export async function moveFrame(
  id: string,
  pos: { x: number; y: number },
): Promise<Frame | null> {
  const existing = await getFrameById(id);
  if (!existing) return null;
  await exec(
    `UPDATE frames SET position_x = $1, position_y = $2, updated_at = $3 WHERE id = $4`,
    [pos.x, pos.y, nowIso(), id],
  );
  return getFrameById(id);
}

export async function deleteFrame(id: string): Promise<boolean> {
  const changes = await exec(`DELETE FROM frames WHERE id = $1`, [id]);
  return changes > 0;
}
