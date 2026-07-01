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

/**
 * Cap stored User-Agent strings. Real browsers send ~150 bytes; abusive
 * clients have been spotted sending KBs of junk that bloat the sessions
 * table and slow `/api/me/sessions`. 1024 is plenty of headroom for any
 * legitimate UA without giving the attacker free DB writes.
 */
const USER_AGENT_MAX = 1024;

export async function createSession(
  token: string,
  userId: string,
  userAgent?: string,
  kind: SessionKind = 'browser',
  label?: string,
): Promise<void> {
  const ua = (userAgent ?? '').slice(0, USER_AGENT_MAX) || null;
  await exec(
    `INSERT INTO sessions (token, user_id, user_agent, kind, label)
     VALUES ($1, $2, $3, $4, $5)`,
    [token, userId, ua, kind, label ?? null],
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

/**
 * How stale `last_seen_at` may get before we bother rewriting the row. The
 * previous implementation UPDATEd the session on *every* authenticated
 * request — cursor-heavy canvas use turned each read into a DB write and
 * serialized parallel requests from one tab on the same row lock.
 */
const SESSION_TOUCH_THRESHOLD = "interval '5 minutes'";

export async function getUserIdForToken(token: string): Promise<string | null> {
  // Hot path is a plain read; the sliding-window extend only writes when
  // last_seen_at is older than the touch threshold. API tokens are excluded
  // from the auto-extend so they keep a fixed lifetime.
  const r = await queryOne<SessionRow & { needs_touch: boolean }>(
    `SELECT *,
            (kind = 'browser' AND last_seen_at < now() - ${SESSION_TOUCH_THRESHOLD})
              AS needs_touch
       FROM sessions
      WHERE token = $1 AND expires_at > now()`,
    [token],
  );
  if (!r) return null;
  if (r.needs_touch) {
    await exec(
      `UPDATE sessions
          SET last_seen_at = now(),
              expires_at = now() + ${BROWSER_SESSION_TTL}
        WHERE token = $1`,
      [token],
    );
  }
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

/**
 * Delete every session whose `expires_at` has passed. Called from the GC
 * sweep so expired rows don't accumulate forever. Returns the number deleted.
 */
export async function deleteExpiredSessions(): Promise<number> {
  return exec(`DELETE FROM sessions WHERE expires_at <= now()`);
}
