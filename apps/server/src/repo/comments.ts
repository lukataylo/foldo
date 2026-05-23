import type {
  Comment,
  CommentAnchor,
  CommentPin,
  CommentReply,
  CommentTarget,
  User,
} from '@foldo/protocol';
import { query, queryOne, exec } from '../db.ts';
import { nowIso } from '../util.ts';
import { getUserById } from './users.ts';

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
  // JSONB columns — pg driver returns these already parsed.
  target_json: CommentTarget | null;
  replies_json: CommentReply[] | null;
}

/** Pure row → Comment mapping. No DB I/O — pass the resolved author in. */
function rowToComment(r: CommentRow, author: User | null): Comment {
  const pin: CommentPin | undefined =
    r.pin_x != null && r.pin_y != null ? { x: Number(r.pin_x), y: Number(r.pin_y) } : undefined;
  const anchor: CommentAnchor | undefined = r.anchor_section
    ? {
        sectionId: r.anchor_section,
        lineStart: r.anchor_line_start ?? undefined,
        lineEnd: r.anchor_line_end ?? undefined,
      }
    : undefined;
  const target = r.target_json ?? undefined;
  const replies = r.replies_json ?? [];
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

interface UserRow {
  id: string;
  name: string;
  initial: string;
  color: string;
  kind: 'human' | 'agent';
  email: string | null;
}

function userRowToUser(r: UserRow): User {
  return {
    id: r.id,
    name: r.name,
    initial: r.initial,
    color: r.color,
    kind: r.kind,
    email: r.email ?? undefined,
  };
}

export async function listCommentsForBoard(boardId: string): Promise<Comment[]> {
  const rows = await query<CommentRow>(
    `SELECT * FROM comments WHERE board_id = $1 ORDER BY created_at`,
    [boardId],
  );
  if (rows.length === 0) return [];
  // Batch-fetch every distinct author in a single SELECT instead of one
  // per row — the previous code called getUserById per comment, so a board
  // with 100 comments issued 101 queries (this listing + 100 author lookups).
  const authorIds = Array.from(new Set(rows.map((r) => r.author_user_id)));
  const authorRows = await query<UserRow>(
    `SELECT id, name, initial, color, kind, email
       FROM users
      WHERE id = ANY($1::text[])`,
    [authorIds],
  );
  const authors = new Map<string, User>(
    authorRows.map((u) => [u.id, userRowToUser(u)]),
  );
  return rows.map((r) => rowToComment(r, authors.get(r.author_user_id) ?? null));
}

export async function getCommentById(id: string): Promise<Comment | null> {
  const r = await queryOne<CommentRow>(`SELECT * FROM comments WHERE id = $1`, [id]);
  if (!r) return null;
  const author = await getUserById(r.author_user_id);
  return rowToComment(r, author);
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
  // Atomic append: previously this was read-mutate-write at the application
  // layer, so two concurrent replies could each read the same `existing.replies`
  // and one of the writes would silently clobber the other. JSONB array
  // concat in a single statement; the row's implicit row-lock during UPDATE
  // serialises concurrent appends.
  const updated = await exec(
    `UPDATE comments
        SET replies_json = COALESCE(replies_json, '[]'::jsonb) || $1::jsonb,
            updated_at = $2
      WHERE id = $3`,
    [JSON.stringify([reply]), nowIso(), commentId],
  );
  if (updated === 0) return null;
  return getCommentById(commentId);
}

export async function deleteComment(id: string): Promise<boolean> {
  const changes = await exec(`DELETE FROM comments WHERE id = $1`, [id]);
  return changes > 0;
}

/**
 * Every comment authored by `userId`, across every board. Used by the GDPR
 * data-export endpoint — exposes the raw row text so the user can keep their
 * own contributions. Author display fields come from the live `users` row at
 * call time (so a deleted user shows up as "deleted user", same as the canvas).
 */
export async function listCommentsAuthoredBy(userId: string): Promise<Comment[]> {
  const rows = await query<CommentRow>(
    `SELECT * FROM comments WHERE author_user_id = $1 ORDER BY created_at`,
    [userId],
  );
  if (rows.length === 0) return [];
  const author = await getUserById(userId);
  return rows.map((r) => rowToComment(r, author));
}

/**
 * Repoint every comment authored by `fromUserId` at `toUserId`. Used by the
 * GDPR delete flow to anonymise authorship while preserving the comment row
 * itself — the board still shows the conversation, just attributed to the
 * "deleted user" sentinel. Returns the number of rows reassigned.
 */
export async function reassignCommentsAuthor(
  fromUserId: string,
  toUserId: string,
): Promise<number> {
  return exec(
    `UPDATE comments SET author_user_id = $2 WHERE author_user_id = $1`,
    [fromUserId, toUserId],
  );
}
