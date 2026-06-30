// Password-reset token store. Tokens are random 32-byte hex strings; we
// store only sha256(token) so a DB leak isn't a credential leak.

import { createHash, randomBytes } from 'node:crypto';
import { exec, queryOne } from '../db.ts';

const TOKEN_BYTES = 32;
const TTL_MINUTES = 15;

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export interface MintedToken {
  /** The raw token to put in the reset URL. Returned ONCE, never re-derivable. */
  token: string;
  expiresAt: Date;
}

/**
 * Mint a fresh single-use token for a user, persist the hash, return the raw
 * token. We deliberately don't cap the number of outstanding tokens — the GC
 * sweep removes expired rows, and `consumeToken` invalidates ALL of a user's
 * tokens on first use.
 */
export async function mintPasswordResetToken(
  userId: string,
  ttlMinutes: number = TTL_MINUTES,
): Promise<MintedToken> {
  const token = randomBytes(TOKEN_BYTES).toString('hex');
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + ttlMinutes * 60_000);
  await exec(
    `INSERT INTO password_reset_tokens (token_hash, user_id, expires_at)
     VALUES ($1, $2, $3)`,
    [tokenHash, userId, expiresAt.toISOString()],
  );
  return { token, expiresAt };
}

export interface ConsumedToken {
  userId: string;
}

/**
 * Validate + atomically consume a token. Returns the owning user id on
 * success, null on any failure (expired, used, unknown, malformed). On
 * success, every other outstanding token for the same user is wiped so a
 * resend can't replay an older link.
 *
 * Wrapped in a transaction so the consume + cleanup happen-or-both-don't.
 */
export async function consumePasswordResetToken(
  token: string,
): Promise<ConsumedToken | null> {
  if (!token || token.length < 16) return null;
  const tokenHash = hashToken(token);
  // RETURNING gives us the user_id only if the row matched + was unused +
  // unexpired AND we successfully marked it used in the same statement.
  const row = await queryOne<{ user_id: string }>(
    `UPDATE password_reset_tokens
        SET used_at = now()
      WHERE token_hash = $1
        AND used_at IS NULL
        AND expires_at > now()
      RETURNING user_id`,
    [tokenHash],
  );
  if (!row) return null;
  // Invalidate every other outstanding token for this user. Belt-and-braces:
  // if the email recipient generated multiple reset links, none of the older
  // ones should work after this one consumed.
  await exec(
    `DELETE FROM password_reset_tokens
      WHERE user_id = $1 AND token_hash <> $2`,
    [row.user_id, tokenHash],
  );
  return { userId: row.user_id };
}

/** GC: drop expired rows. Called from the periodic sweep. */
export async function deleteExpiredPasswordResetTokens(): Promise<number> {
  return exec(`DELETE FROM password_reset_tokens WHERE expires_at <= now()`);
}

/** Test helper — wipe all tokens for deterministic specs. */
export async function _clearPasswordResetTokensForTests(): Promise<number> {
  return exec(`DELETE FROM password_reset_tokens`);
}
