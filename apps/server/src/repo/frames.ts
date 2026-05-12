import type { Frame, FrameContent, FrameKind } from '@foldo/protocol';
import { db } from '../db.ts';
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
    position: { x: r.position_x, y: r.position_y },
    size: { width: r.width, height: r.height },
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

export function listFramesForBoard(boardId: string): Frame[] {
  const rows = db
    .prepare(`SELECT * FROM frames WHERE board_id = ? ORDER BY created_at`)
    .all(boardId) as FrameRow[];
  return rows.map(rowToFrame);
}

export function getFrameById(id: string): Frame | null {
  const r = db.prepare(`SELECT * FROM frames WHERE id = ?`).get(id) as
    | FrameRow
    | undefined;
  return r ? rowToFrame(r) : null;
}

export function insertFrame(f: Frame): Frame {
  db.prepare(
    `INSERT INTO frames (id, board_id, kind, branch_id, commit_sha, commit_message, age,
       position_x, position_y, width, height, content_json, parent_frame_id,
       generated_by_dispatch_id, captured_from_url, created_at, updated_at)
     VALUES (@id, @board_id, @kind, @branch_id, @commit_sha, @commit_message, @age,
       @position_x, @position_y, @width, @height, @content_json, @parent_frame_id,
       @generated_by_dispatch_id, @captured_from_url, @created_at, @updated_at)`,
  ).run({
    id: f.id,
    board_id: f.boardId,
    kind: f.kind,
    branch_id: f.branchId,
    commit_sha: f.commitSha,
    commit_message: f.commitMessage,
    age: f.age,
    position_x: f.position.x,
    position_y: f.position.y,
    width: f.size.width,
    height: f.size.height,
    content_json: JSON.stringify(f.content),
    parent_frame_id: f.parentFrameId ?? null,
    generated_by_dispatch_id: f.generatedByDispatchId ?? null,
    captured_from_url: f.capturedFromUrl ?? null,
    created_at: f.createdAt,
    updated_at: f.updatedAt,
  });
  return f;
}

export interface FrameUpdate {
  position?: { x: number; y: number };
  size?: { width: number; height: number };
  content?: FrameContent;
}

export function updateFrame(id: string, patch: FrameUpdate): Frame | null {
  const existing = getFrameById(id);
  if (!existing) return null;
  const next: Frame = {
    ...existing,
    position: patch.position ?? existing.position,
    size: patch.size ?? existing.size,
    content: patch.content ?? existing.content,
    updatedAt: nowIso(),
  };
  db.prepare(
    `UPDATE frames SET
       position_x = @position_x,
       position_y = @position_y,
       width = @width,
       height = @height,
       content_json = @content_json,
       updated_at = @updated_at
     WHERE id = @id`,
  ).run({
    id,
    position_x: next.position.x,
    position_y: next.position.y,
    width: next.size.width,
    height: next.size.height,
    content_json: JSON.stringify(next.content),
    updated_at: next.updatedAt,
  });
  return next;
}

export function moveFrame(id: string, pos: { x: number; y: number }): Frame | null {
  const existing = getFrameById(id);
  if (!existing) return null;
  db.prepare(
    `UPDATE frames SET position_x = ?, position_y = ?, updated_at = ? WHERE id = ?`,
  ).run(pos.x, pos.y, nowIso(), id);
  return getFrameById(id);
}

export function deleteFrame(id: string): boolean {
  const info = db.prepare(`DELETE FROM frames WHERE id = ?`).run(id);
  return info.changes > 0;
}
