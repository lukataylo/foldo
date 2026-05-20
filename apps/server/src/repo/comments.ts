import type {
  Comment,
  CommentAnchor,
  CommentPin,
  CommentReply,
  CommentTarget,
  User,
} from '@foldo/protocol';
import { query, queryOne, exec } from '../db.ts';
import { nowIso, parseJson } from '../util.ts';
import { getUserById, listUsers } from './users.ts';

interface CommentRow {
  id: string;
  board_id: string;
  frame_id: string;
  author_user_id: string;
  text: string;
  created_at: string;
  updated_at: string;
  resolved: boolean;
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

/**
 * Build a Comment from a row, resolving author display fields via the
 * supplied lookup. The lookup is in-memory (from an already-loaded user
 * list) so per-comment hydration costs no extra query — see W3.1.
 */
function rowToComment(
  r: CommentRow,
  resolveUser: (id: string) => User | undefined,
): Comment {
  const author = resolveUser(r.author_user_id);
  const pin: CommentPin | undefined =
    r.pin_x != null && r.pin_y != null ? { x: Number(r.pin_x), y: Number(r.pin_y) } : undefined;
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
    resolved: r.resolved === true,
    resolvedByUserId: r.resolved_by_user_id ?? undefined,
    resolvedAt: r.resolved_at ?? undefined,
    pin,
    anchor,
    target,
    replies,
  };
}

/**
 * List a board's comments. Pass `users` (the board route already loads the
 * full user list) to resolve author info in memory — without it, this falls
 * back to a single `listUsers()` query. Either way it's one query for
 * authors, never one-per-comment.
 */
export async function listCommentsForBoard(
  boardId: string,
  users?: User[],
): Promise<Comment[]> {
  const rows = await query<CommentRow>(
    `SELECT * FROM comments WHERE board_id = $1 ORDER BY created_at`,
    [boardId],
  );
  const userList = users ?? (await listUsers());
  const byId = new Map(userList.map((u) => [u.id, u]));
  return rows.map((r) => rowToComment(r, (id) => byId.get(id)));
}

export async function getCommentById(id: string): Promise<Comment | null> {
  const r = await queryOne<CommentRow>(`SELECT * FROM comments WHERE id = $1`, [id]);
  if (!r) return null;
  // Single-comment fetch: resolve just this one author.
  const author = await getUserById(r.author_user_id);
  return rowToComment(r, (id) => (id === author?.id ? author : undefined));
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

export async function insertComment(c: CommentInsert): Promise<Comment> {
  const now = c.createdAt ?? nowIso();
  await exec(
    `INSERT INTO comments (id, board_id, frame_id, author_user_id, text, created_at, updated_at,
       resolved, pin_x, pin_y, anchor_section, anchor_line_start, anchor_line_end, target_json, replies_json)
     VALUES ($1, $2, $3, $4, $5, $6, $7, false, $8, $9, $10, $11, $12, $13, '[]')`,
    [
      c.id,
      c.boardId,
      c.frameId,
      c.authorUserId,
      c.text,
      now,
      now,
      c.pin?.x ?? null,
      c.pin?.y ?? null,
      c.anchor?.sectionId ?? null,
      c.anchor?.lineStart ?? null,
      c.anchor?.lineEnd ?? null,
      c.target ? JSON.stringify(c.target) : null,
    ],
  );
  return (await getCommentById(c.id))!;
}

export interface CommentUpdate {
  text?: string;
  resolved?: boolean;
  resolvedByUserId?: string;
}

export async function updateComment(
  id: string,
  patch: CommentUpdate,
): Promise<Comment | null> {
  const existing = await getCommentById(id);
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
  await exec(
    `UPDATE comments SET
       text = COALESCE($1, text),
       resolved = $2,
       resolved_by_user_id = $3,
       resolved_at = $4,
       updated_at = $5
     WHERE id = $6`,
    [patch.text ?? null, resolved, resolvedBy, resolvedAt, now, id],
  );
  return getCommentById(id);
}

export async function addReply(
  commentId: string,
  reply: CommentReply,
): Promise<Comment | null> {
  const existing = await getCommentById(commentId);
  if (!existing) return null;
  const replies = [...existing.replies, reply];
  await exec(`UPDATE comments SET replies_json = $1, updated_at = $2 WHERE id = $3`, [
    JSON.stringify(replies),
    nowIso(),
    commentId,
  ]);
  return getCommentById(commentId);
}

export async function deleteComment(id: string): Promise<boolean> {
  const changes = await exec(`DELETE FROM comments WHERE id = $1`, [id]);
  return changes > 0;
}
