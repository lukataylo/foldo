// Email-verification token store. Mirrors passwordResets in shape; the
// behaviour differences are:
//   - 24h TTL (vs 15 min). A user who signs up at midnight should still
//     have a working link in the morning.
//   - Records the address verified, in case the user changed their email
//     between mint and use — verify only the address the token was for.

import { createHash, randomBytes } from 'node:crypto';
import { exec, queryOne } from '../db.ts';

const TOKEN_BYTES = 32;
const TTL_HOURS_DEFAULT = 24;

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export interface MintedVerification {
  token: string;
  expiresAt: Date;
}

export async function mintEmailVerificationToken(
  userId: string,
  email: string,
  ttlHours: number = TTL_HOURS_DEFAULT,
): Promise<MintedVerification> {
  const token = randomBytes(TOKEN_BYTES).toString('hex');
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + ttlHours * 3600_000);
  await exec(
    `INSERT INTO email_verifications (token_hash, user_id, email, expires_at)
     VALUES ($1, $2, $3, $4)`,
    [tokenHash, userId, email, expiresAt.toISOString()],
  );
  return { token, expiresAt };
}

export interface ConsumedVerification {
  userId: string;
  email: string;
}

/**
 * Atomically validate + consume. On success, every other outstanding token
 * for the same user is removed so a resent token invalidates the older
 * link.
 */
export async function consumeEmailVerificationToken(
  token: string,
): Promise<ConsumedVerification | null> {
  if (!token || token.length < 16) return null;
  const tokenHash = hashToken(token);
  const row = await queryOne<{ user_id: string; email: string }>(
    `UPDATE email_verifications
        SET used_at = now()
      WHERE token_hash = $1
        AND used_at IS NULL
        AND expires_at > now()
      RETURNING user_id, email`,
    [tokenHash],
  );
  if (!row) return null;
  await exec(
    `DELETE FROM email_verifications
      WHERE user_id = $1 AND token_hash <> $2`,
    [row.user_id, tokenHash],
  );
  return { userId: row.user_id, email: row.email };
}

export async function deleteExpiredEmailVerifications(): Promise<number> {
  return exec(`DELETE FROM email_verifications WHERE expires_at <= now()`);
}

export async function _clearEmailVerificationsForTests(): Promise<number> {
  return exec(`DELETE FROM email_verifications`);
}
