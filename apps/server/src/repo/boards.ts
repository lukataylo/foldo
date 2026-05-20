import type { Board } from '@foldo/protocol';
import { query, queryOne, exec, withTx, type Executor } from '../db.ts';
import { nowIso } from '../util.ts';

interface BoardRow {
  id: string;
  name: string;
  repo_slug: string;
  dev_url: string | null;
  created_at: string;
}

function rowToBoard(r: BoardRow): Board {
  return {
    id: r.id,
    name: r.name,
    repoSlug: r.repo_slug,
    devUrl: r.dev_url ?? undefined,
    createdAt: r.created_at,
  };
}

export async function listBoards(): Promise<Board[]> {
  const rows = await query<BoardRow>(`SELECT * FROM boards ORDER BY created_at`);
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

export async function upsertBoard(b: Board, client?: Executor): Promise<Board> {
  await exec(
    `INSERT INTO boards (id, name, repo_slug, dev_url, created_at)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT(id) DO UPDATE SET
       name = EXCLUDED.name,
       repo_slug = EXCLUDED.repo_slug,
       dev_url = EXCLUDED.dev_url`,
    [b.id, b.name, b.repoSlug, b.devUrl ?? null, b.createdAt ?? nowIso()],
    client,
  );
  return b;
}

/** Rename a board. Returns the updated Board, or null if the id is unknown. */
export async function renameBoard(
  id: string,
  name: string,
  client?: Executor,
): Promise<Board | null> {
  await exec(`UPDATE boards SET name = $1 WHERE id = $2`, [name, id], client);
  const r = await queryOne<BoardRow>(`SELECT * FROM boards WHERE id = $1`, [id], client);
  return r ? rowToBoard(r) : null;
}

/**
 * Delete a board and everything that hangs off it.
 *
 * `board_members` and `board_shares` cascade via FK, but `branches`,
 * `commits`, `frames`, `comments`, `dispatches`, `tests` reference
 * `board_id` as a plain TEXT column with no FK — so we must delete those
 * rows explicitly or they orphan. `commits` is keyed off `branch_id`, so we
 * resolve the board's branch ids first. Everything runs in one transaction.
 */
export async function deleteBoardCascade(id: string): Promise<void> {
  await withTx(async (client) => {
    const branchIds = (
      await query<{ id: string }>(
        `SELECT id FROM branches WHERE board_id = $1`,
        [id],
        client,
      )
    ).map((r) => r.id);
    // test_tasks / test_sessions / test_task_results cascade off `tests`.
    await exec(`DELETE FROM tests WHERE board_id = $1`, [id], client);
    await exec(`DELETE FROM dispatches WHERE board_id = $1`, [id], client);
    await exec(`DELETE FROM comments WHERE board_id = $1`, [id], client);
    await exec(`DELETE FROM frames WHERE board_id = $1`, [id], client);
    if (branchIds.length > 0) {
      await exec(
        `DELETE FROM commits WHERE branch_id = ANY($1::text[])`,
        [branchIds],
        client,
      );
    }
    await exec(`DELETE FROM branches WHERE board_id = $1`, [id], client);
    // board_members + board_shares cascade when the board row goes.
    await exec(`DELETE FROM boards WHERE id = $1`, [id], client);
  });
}
