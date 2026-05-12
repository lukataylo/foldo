import type {
  Comment,
  CommentAnchor,
  CommentPin,
  CommentReply,
  CommentTarget,
} from '@foldo/protocol';
import { db } from '../db.ts';
import { nowIso, parseJson } from '../util.ts';
import { getUserById } from './users.ts';

interface CommentRow {
  id: string;
  board_id: string;
  frame_id: string;
  author_user_id: string;
  text: string;
  created_at: string;
  updated_at: string;
  resolved: number;
  resolved_by_user_id: string | null;
  resolved_at: string | null;
  pin_x: number | null;
  pin_y: number | null;
  anchor_section: string | null;
  anchor_line_start: number | null;
  anchor_line_end: number | null;
  target_json: string | null;
  replies_json: string;
}

function rowToComment(r: CommentRow): Comment {
  const author = getUserById(r.author_user_id);
  const pin: CommentPin | undefined =
    r.pin_x != null && r.pin_y != null ? { x: r.pin_x, y: r.pin_y } : undefined;
  const anchor: CommentAnchor | undefined = r.anchor_section
    ? {
        sectionId: r.anchor_section,
        lineStart: r.anchor_line_start ?? undefined,
        lineEnd: r.anchor_line_end ?? undefined,
      }
    : undefined;
  const target = parseJson<CommentTarget | null>(r.target_json, null) ?? undefined;
  const replies = parseJson<CommentReply[]>(r.replies_json, []);
  return {
    id: r.id,
    boardId: r.board_id,
    frameId: r.frame_id,
    authorUserId: r.author_user_id,
    authorName: author?.name ?? 'Unknown',
    authorInitial: author?.initial ?? '?',
    authorColor: author?.color ?? '#999',
    text: r.text,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    resolved: r.resolved === 1,
    resolvedByUserId: r.resolved_by_user_id ?? undefined,
    resolvedAt: r.resolved_at ?? undefined,
    pin,
    anchor,
    target,
    replies,
  };
}

export function listCommentsForBoard(boardId: string): Comment[] {
  const rows = db
    .prepare(`SELECT * FROM comments WHERE board_id = ? ORDER BY created_at`)
    .all(boardId) as CommentRow[];
  return rows.map(rowToComment);
}

export function getCommentById(id: string): Comment | null {
  const r = db.prepare(`SELECT * FROM comments WHERE id = ?`).get(id) as
    | CommentRow
    | undefined;
  return r ? rowToComment(r) : null;
}

export interface CommentInsert {
  id: string;
  boardId: string;
  frameId: string;
  authorUserId: string;
  text: string;
  createdAt?: string;
  pin?: CommentPin;
  anchor?: CommentAnchor;
  target?: CommentTarget;
}

export function insertComment(c: CommentInsert): Comment {
  const now = c.createdAt ?? nowIso();
  db.prepare(
    `INSERT INTO comments (id, board_id, frame_id, author_user_id, text, created_at, updated_at,
       resolved, pin_x, pin_y, anchor_section, anchor_line_start, anchor_line_end, target_json, replies_json)
     VALUES (@id, @board_id, @frame_id, @author_user_id, @text, @created_at, @updated_at,
       0, @pin_x, @pin_y, @anchor_section, @anchor_line_start, @anchor_line_end, @target_json, '[]')`,
  ).run({
    id: c.id,
    board_id: c.boardId,
    frame_id: c.frameId,
    author_user_id: c.authorUserId,
    text: c.text,
    created_at: now,
    updated_at: now,
    pin_x: c.pin?.x ?? null,
    pin_y: c.pin?.y ?? null,
    anchor_section: c.anchor?.sectionId ?? null,
    anchor_line_start: c.anchor?.lineStart ?? null,
    anchor_line_end: c.anchor?.lineEnd ?? null,
    target_json: c.target ? JSON.stringify(c.target) : null,
  });
  return getCommentById(c.id)!;
}

export interface CommentUpdate {
  text?: string;
  resolved?: boolean;
  resolvedByUserId?: string;
}

export function updateComment(id: string, patch: CommentUpdate): Comment | null {
  const existing = getCommentById(id);
  if (!existing) return null;
  const now = nowIso();
  const resolved = patch.resolved ?? existing.resolved;
  const resolvedAt = patch.resolved
    ? existing.resolved
      ? existing.resolvedAt
      : now
    : null;
  const resolvedBy = patch.resolved
    ? patch.resolvedByUserId ?? existing.resolvedByUserId ?? null
    : null;
  db.prepare(
    `UPDATE comments SET
       text = COALESCE(?, text),
       resolved = ?,
       resolved_by_user_id = ?,
       resolved_at = ?,
       updated_at = ?
     WHERE id = ?`,
  ).run(
    patch.text ?? null,
    resolved ? 1 : 0,
    resolvedBy,
    resolvedAt,
    now,
    id,
  );
  return getCommentById(id);
}

export function addReply(commentId: string, reply: CommentReply): Comment | null {
  const existing = getCommentById(commentId);
  if (!existing) return null;
  const replies = [...existing.replies, reply];
  db.prepare(
    `UPDATE comments SET replies_json = ?, updated_at = ? WHERE id = ?`,
  ).run(JSON.stringify(replies), nowIso(), commentId);
  return getCommentById(commentId);
}

export function deleteComment(id: string): boolean {
  const info = db.prepare(`DELETE FROM comments WHERE id = ?`).run(id);
  return info.changes > 0;
}
