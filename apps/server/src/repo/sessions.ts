import { query, queryOne, exec } from '../db.ts';

export type SessionKind = 'browser' | 'api';

export interface SessionRow {
  token: string;
  user_id: string;
  created_at: string;
  last_seen_at: string;
  expires_at: string;
  user_agent: string | null;
  kind: SessionKind;
  label: string | null;
}

/** Sliding-window TTL. Browser sessions get bumped by this on every touch. */
const BROWSER_SESSION_TTL = "interval '30 days'";

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
  // Single query that (a) verifies the session exists and isn't expired and
  // (b) extends the sliding window. API tokens are explicitly excluded from
  // the auto-extend so they have a fixed lifetime, browser sessions slide.
  const r = await queryOne<SessionRow>(
    `UPDATE sessions
        SET last_seen_at = now(),
            expires_at = CASE
              WHEN kind = 'browser' THEN now() + ${BROWSER_SESSION_TTL}
              ELSE expires_at
            END
      WHERE token = $1 AND expires_at > now()
      RETURNING *`,
    [token],
  );
  return r ? r.user_id : null;
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

/**
 * Delete every session whose `expires_at` has passed. Called from the GC
 * sweep so expired rows don't accumulate forever. Returns the number deleted.
 */
export async function deleteExpiredSessions(): Promise<number> {
  return exec(`DELETE FROM sessions WHERE expires_at <= now()`);
}
