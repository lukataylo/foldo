import type { Board } from '@foldo/protocol';
import { query, queryOne, exec } from '../db.ts';
import { nowIso } from '../util.ts';

interface BoardRow {
  id: string;
  name: string;
  repo_slug: string;
  dev_url: string | null;
  created_at: string;
  archived_at: string | null;
}

function rowToBoard(r: BoardRow): Board {
  return {
    id: r.id,
    name: r.name,
    repoSlug: r.repo_slug,
    devUrl: r.dev_url ?? undefined,
    createdAt: r.created_at,
    archivedAt: r.archived_at ?? null,
  };
}

export interface ListBoardsOptions {
  /** When true, returns archived boards as well (default: false). */
  includeArchived?: boolean;
}

export async function listBoards(opts: ListBoardsOptions = {}): Promise<Board[]> {
  // Default path filters out archived boards — a soft-deleted board is
  // off the user's home grid until they tick "Show archived" and call us
  // again with includeArchived=true.
  const where = opts.includeArchived ? '' : 'WHERE archived_at IS NULL';
  const rows = await query<BoardRow>(
    `SELECT * FROM boards ${where} ORDER BY created_at`,
  );
  return rows.map(rowToBoard);
}

/**
 * Boards the given user is a member of. `GET /api/boards` used to fetch
 * every board in the database and filter in JS — O(total boards in the
 * system) per request.
 */
export async function listBoardsForUser(
  userId: string,
  opts: ListBoardsOptions = {},
): Promise<Board[]> {
  const archivedFilter = opts.includeArchived ? '' : 'AND b.archived_at IS NULL';
  const rows = await query<BoardRow>(
    `SELECT b.* FROM boards b
       JOIN board_members m ON m.board_id = b.id
      WHERE m.user_id = $1 ${archivedFilter}
      ORDER BY b.created_at`,
    [userId],
  );
  return rows.map(rowToBoard);
}

export async function getBoardById(id: string): Promise<Board | null> {
  const r = await queryOne<BoardRow>(`SELECT * FROM boards WHERE id = $1`, [id]);
  return r ? rowToBoard(r) : null;
}

export async function getBoardByRepoSlug(slug: string): Promise<Board | null> {
  const r = await queryOne<BoardRow>(`SELECT * FROM boards WHERE repo_slug = $1`, [slug]);
  return r ? rowToBoard(r) : null;
}

/**
 * Boards on which the given user holds the `owner` role. Used by the GDPR
 * data-export endpoint — owners get the full board row, anyone else just
 * gets membership metadata. Implementation joins `board_members` so we
 * don't have to store the creator on `boards` itself.
 */
export async function listBoardsOwnedBy(userId: string): Promise<Board[]> {
  const rows = await query<BoardRow>(
    `SELECT b.* FROM boards b
       JOIN board_members m ON m.board_id = b.id
      WHERE m.user_id = $1 AND m.role = 'owner'
      ORDER BY b.created_at`,
    [userId],
  );
  return rows.map(rowToBoard);
}

export async function upsertBoard(b: Board): Promise<Board> {
  await exec(
    `INSERT INTO boards (id, name, repo_slug, dev_url, created_at)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT(id) DO UPDATE SET
       name = EXCLUDED.name,
       repo_slug = EXCLUDED.repo_slug,
       dev_url = EXCLUDED.dev_url`,
    [b.id, b.name, b.repoSlug, b.devUrl ?? null, b.createdAt ?? nowIso()],
  );
  return b;
}

/**
 * Soft-delete: set archived_at = NOW(). The row stays in place (and so do
 * all child frames / comments / dispatches) so a Restore call can revive
 * the board without losing any history. Idempotent: if the board is
 * already archived, this is a no-op (the WHERE clause leaves the timestamp
 * pinned at the first archive moment).
 */
export async function archiveBoard(id: string): Promise<number> {
  return exec(
    `UPDATE boards SET archived_at = now()
      WHERE id = $1 AND archived_at IS NULL`,
    [id],
  );
}

/**
 * Inverse of archiveBoard — clears the archived_at marker so the board
 * shows up in the default list again. Idempotent for already-live boards.
 */
export async function restoreBoard(id: string): Promise<number> {
  return exec(
    `UPDATE boards SET archived_at = NULL
      WHERE id = $1 AND archived_at IS NOT NULL`,
    [id],
  );
}
