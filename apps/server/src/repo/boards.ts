import type { Board } from '@foldo/protocol';
import { query, queryOne, exec } from '../db.ts';
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
