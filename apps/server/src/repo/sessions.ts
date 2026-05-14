import { query, queryOne, exec } from '../db.ts';

export type SessionKind = 'browser' | 'api';

export interface SessionRow {
  token: string;
  user_id: string;
  created_at: string;
  last_seen_at: string;
  user_agent: string | null;
  kind: SessionKind;
  label: string | null;
}

export async function createSession(
  token: string,
  userId: string,
  userAgent?: string,
  kind: SessionKind = 'browser',
  label?: string,
): Promise<void> {
  await exec(
    `INSERT INTO sessions (token, user_id, user_agent, kind, label)
     VALUES ($1, $2, $3, $4, $5)`,
    [token, userId, userAgent ?? null, kind, label ?? null],
  );
}

export async function listApiTokensForUser(userId: string): Promise<SessionRow[]> {
  return query<SessionRow>(
    `SELECT * FROM sessions WHERE user_id = $1 AND kind = 'api' ORDER BY created_at DESC`,
    [userId],
  );
}

export async function getApiTokenForUser(
  userId: string,
  token: string,
): Promise<SessionRow | null> {
  return queryOne<SessionRow>(
    `SELECT * FROM sessions WHERE user_id = $1 AND kind = 'api' AND token = $2`,
    [userId, token],
  );
}

export async function getUserIdForToken(token: string): Promise<string | null> {
  const r = await queryOne<SessionRow>(
    `SELECT * FROM sessions WHERE token = $1`,
    [token],
  );
  if (!r) return null;
  exec(`UPDATE sessions SET last_seen_at = now() WHERE token = $1`, [token]).catch(
    () => undefined,
  );
  return r.user_id;
}

export async function deleteSession(token: string): Promise<void> {
  await exec(`DELETE FROM sessions WHERE token = $1`, [token]);
}

/**
 * Active browser sessions only. The /settings "Active sessions" view shows
 * devices, not API tokens — those live in their own section via
 * `listApiTokensForUser`.
 */
export async function listSessionsForUser(userId: string): Promise<SessionRow[]> {
  return query<SessionRow>(
    `SELECT * FROM sessions
      WHERE user_id = $1 AND kind = 'browser'
      ORDER BY last_seen_at DESC`,
    [userId],
  );
}

export async function deleteAllSessionsForUserExcept(
  userId: string,
  keepToken: string,
): Promise<number> {
  return exec(`DELETE FROM sessions WHERE user_id = $1 AND token <> $2`, [
    userId,
    keepToken,
  ]);
}

export async function deleteSessionOwnedBy(
  userId: string,
  token: string,
): Promise<number> {
  return exec(`DELETE FROM sessions WHERE user_id = $1 AND token = $2`, [
    userId,
    token,
  ]);
}
