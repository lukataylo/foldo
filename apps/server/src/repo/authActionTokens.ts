// Single-use, expiring tokens for account-lifecycle emails: password reset
// and email verification. Backed by the `auth_action_tokens` table.
//
// A token is valid when it exists, has the expected kind, has not been
// consumed, and has not expired. `consumeAuthActionToken` atomically marks a
// token consumed and returns the row only if it was valid at consume time —
// so two concurrent redemptions cannot both succeed.

import { query, queryOne, exec } from '../db.ts';

export type AuthActionKind = 'password_reset' | 'email_verify';

export interface AuthActionTokenRow {
  token: string;
  user_id: string;
  kind: AuthActionKind;
  created_at: string;
  expires_at: string;
  consumed_at: string | null;
}

/** Insert a new token. Caller supplies a cryptographically random `token`. */
export async function createAuthActionToken(input: {
  token: string;
  userId: string;
  kind: AuthActionKind;
  expiresAt: Date;
}): Promise<void> {
  await exec(
    `INSERT INTO auth_action_tokens (token, user_id, kind, expires_at)
     VALUES ($1, $2, $3, $4)`,
    [input.token, input.userId, input.kind, input.expiresAt.toISOString()],
  );
}

/** Fetch a token row by value (no validity checks). */
export async function getAuthActionToken(
  token: string,
): Promise<AuthActionTokenRow | null> {
  return queryOne<AuthActionTokenRow>(
    `SELECT * FROM auth_action_tokens WHERE token = $1`,
    [token],
  );
}

/**
 * Atomically consume a token. Returns the row only if it was valid (right
 * kind, not yet consumed, not expired) — otherwise null. Uses a conditional
 * UPDATE so a race between two redemptions resolves to a single winner.
 */
export async function consumeAuthActionToken(
  token: string,
  kind: AuthActionKind,
): Promise<AuthActionTokenRow | null> {
  const rows = await query<AuthActionTokenRow>(
    `UPDATE auth_action_tokens
        SET consumed_at = now()
      WHERE token = $1
        AND kind = $2
        AND consumed_at IS NULL
        AND expires_at > now()
      RETURNING *`,
    [token, kind],
  );
  return rows[0] ?? null;
}

/**
 * Invalidate every still-pending token of a kind for a user. Called before
 * minting a fresh one so only the latest emailed link works.
 */
export async function consumePendingTokensForUser(
  userId: string,
  kind: AuthActionKind,
): Promise<number> {
  return exec(
    `UPDATE auth_action_tokens
        SET consumed_at = now()
      WHERE user_id = $1 AND kind = $2 AND consumed_at IS NULL`,
    [userId, kind],
  );
}

/** Delete expired / long-consumed tokens. Returns the row count removed. */
export async function purgeExpiredAuthActionTokens(): Promise<number> {
  return exec(
    `DELETE FROM auth_action_tokens
      WHERE expires_at < now() - interval '1 day'
         OR consumed_at < now() - interval '1 day'`,
  );
}
