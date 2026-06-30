import { randomBytes } from 'node:crypto';
import { query, queryOne, exec } from '../db.ts';

export interface BoardShareRow {
  token: string;
  board_id: string;
  created_by_user_id: string;
  created_at: string;
  revoked_at: string | null;
}

// Short, base62-ish token. 10 chars = ~59.5 bits of entropy, more than enough
// for a share link that's already revocable. Avoids the older `bs_<64hex>`
// blob so URLs like foldo.dev/s/g7K9pN3xLm fit nicely in chat / DMs.
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
function newShareToken(): string {
  const bytes = randomBytes(10);
  let out = '';
  for (let i = 0; i < bytes.length; i++) {
    out += ALPHABET[(bytes[i] ?? 0) % ALPHABET.length];
  }
  return out;
}

export async function createShare(
  boardId: string,
  userId: string,
): Promise<BoardShareRow> {
  const token = newShareToken();
  await exec(
    `INSERT INTO board_shares (token, board_id, created_by_user_id) VALUES ($1, $2, $3)`,
    [token, boardId, userId],
  );
  const row = await queryOne<BoardShareRow>(
    `SELECT * FROM board_shares WHERE token = $1`,
    [token],
  );
  if (!row) throw new Error('Share creation failed');
  return row;
}

export async function getShareByToken(
  token: string,
): Promise<BoardShareRow | null> {
  return queryOne<BoardShareRow>(
    `SELECT * FROM board_shares WHERE token = $1`,
    [token],
  );
}

export async function listSharesForBoard(
  boardId: string,
): Promise<BoardShareRow[]> {
  return query<BoardShareRow>(
    `SELECT * FROM board_shares
      WHERE board_id = $1 AND revoked_at IS NULL
      ORDER BY created_at DESC`,
    [boardId],
  );
}

export async function revokeShare(token: string): Promise<number> {
  return exec(
    `UPDATE board_shares SET revoked_at = now()
      WHERE token = $1 AND revoked_at IS NULL`,
    [token],
  );
}
