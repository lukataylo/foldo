import type { Board } from '@foldo/protocol';
import { db } from '../db.ts';
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

export function listBoards(): Board[] {
  const rows = db.prepare(`SELECT * FROM boards ORDER BY created_at`).all() as BoardRow[];
  return rows.map(rowToBoard);
}

export function getBoardById(id: string): Board | null {
  const r = db.prepare(`SELECT * FROM boards WHERE id = ?`).get(id) as BoardRow | undefined;
  return r ? rowToBoard(r) : null;
}

export function getBoardByRepoSlug(slug: string): Board | null {
  const r = db
    .prepare(`SELECT * FROM boards WHERE repo_slug = ?`)
    .get(slug) as BoardRow | undefined;
  return r ? rowToBoard(r) : null;
}

export function upsertBoard(b: Board): Board {
  db.prepare(
    `INSERT INTO boards (id, name, repo_slug, dev_url, created_at)
     VALUES (@id, @name, @repo_slug, @dev_url, @created_at)
     ON CONFLICT(id) DO UPDATE SET
       name = excluded.name,
       repo_slug = excluded.repo_slug,
       dev_url = excluded.dev_url`,
  ).run({
    id: b.id,
    name: b.name,
    repo_slug: b.repoSlug,
    dev_url: b.devUrl ?? null,
    created_at: b.createdAt ?? nowIso(),
  });
  return b;
}
