import type { User } from '@foldo/protocol';
import { createHash } from 'node:crypto';
import { query, queryOne, exec } from '../db.ts';
import { nowIso } from '../util.ts';

/**
 * Stable id for the "deleted user" sentinel. When a real user soft-deletes,
 * we reassign their comments + sessions to this account so board history
 * stays intact but the original identity is gone. The row is minted lazily
 * on first delete via `ensureDeletedSentinelUser()`.
 */
export const DELETED_USER_ID = 'u-deleted';
export const DELETED_USER_NAME = 'deleted user';

interface UserRow {
  id: string;
  name: string;
  initial: string;
  color: string;
  email: string | null;
  email_verified_at: string | null;
  kind: 'human' | 'agent';
  created_at: string;
}

function rowToUser(r: UserRow): User {
  return {
    id: r.id,
    name: r.name,
    initial: r.initial,
    color: r.color,
    email: r.email ?? undefined,
    emailVerifiedAt: r.email_verified_at ?? undefined,
    kind: r.kind,
  };
}

/** Stamp the user's email_verified_at to now. Idempotent — safe to call twice. */
export async function markEmailVerified(userId: string): Promise<void> {
  await exec(
    `UPDATE users SET email_verified_at = COALESCE(email_verified_at, now())
      WHERE id = $1`,
    [userId],
  );
}

export async function listUsers(): Promise<User[]> {
  const rows = await query<UserRow>(`SELECT * FROM users ORDER BY created_at`);
  return rows.map(rowToUser);
}

/**
 * Users relevant to one board: current members plus anyone who authored a
 * comment or initiated a dispatch there (covers ex-members and the deleted
 * sentinel, whose content stays on the board). Board hydration used to ship
 * `listUsers()` — every account in the database — to every member and every
 * public share viewer.
 */
export async function listUsersForBoard(boardId: string): Promise<User[]> {
  const rows = await query<UserRow>(
    `SELECT u.* FROM users u
      WHERE u.id IN (
        SELECT user_id FROM board_members WHERE board_id = $1
        UNION
        SELECT author_user_id FROM comments WHERE board_id = $1
        UNION
        SELECT initiator_user_id FROM dispatches WHERE board_id = $1
      )
      ORDER BY u.created_at`,
    [boardId],
  );
  return rows.map(rowToUser);
}

export async function getUserById(id: string): Promise<User | null> {
  const r = await queryOne<UserRow>(`SELECT * FROM users WHERE id = $1`, [id]);
  return r ? rowToUser(r) : null;
}

export async function getUserByEmail(email: string): Promise<User | null> {
  const r = await queryOne<UserRow>(
    `SELECT * FROM users WHERE lower(email) = lower($1)`,
    [email],
  );
  return r ? rowToUser(r) : null;
}

export async function getUserPasswordHash(id: string): Promise<string | null> {
  const r = await queryOne<{ password_hash: string | null }>(
    `SELECT password_hash FROM users WHERE id = $1`,
    [id],
  );
  return r?.password_hash ?? null;
}

export async function setUserPasswordHash(id: string, hash: string): Promise<void> {
  await exec(`UPDATE users SET password_hash = $1 WHERE id = $2`, [hash, id]);
}

export interface ProfilePatch {
  name?: string;
  email?: string;
  color?: string;
}

/**
 * Update a user's editable profile fields. Returns the resulting User row.
 * Caller must validate input, this only filters out undefined keys.
 */
export async function updateUserProfile(
  id: string,
  patch: ProfilePatch,
): Promise<User | null> {
  const sets: string[] = [];
  const args: unknown[] = [];
  let i = 1;
  if (patch.name !== undefined) {
    sets.push(`name = $${i++}`);
    args.push(patch.name);
    sets.push(`initial = $${i++}`);
    args.push(patch.name.trim()[0]?.toUpperCase() ?? '?');
  }
  if (patch.email !== undefined) {
    sets.push(`email = $${i++}`);
    args.push(patch.email);
  }
  if (patch.color !== undefined) {
    sets.push(`color = $${i++}`);
    args.push(patch.color);
  }
  if (sets.length === 0) return getUserById(id);
  args.push(id);
  await exec(`UPDATE users SET ${sets.join(', ')} WHERE id = $${i}`, args);
  return getUserById(id);
}

export async function upsertUser(u: User): Promise<User> {
  await exec(
    `INSERT INTO users (id, name, initial, color, email, kind, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT(id) DO UPDATE SET
       name = EXCLUDED.name,
       initial = EXCLUDED.initial,
       color = EXCLUDED.color,
       email = EXCLUDED.email,
       kind = EXCLUDED.kind`,
    [u.id, u.name, u.initial, u.color, u.email ?? null, u.kind, nowIso()],
  );
  return u;
}

/**
 * Lazily mint the `u-deleted` sentinel row. Called from `softDeleteUser` so
 * the first real account-deletion seeds it; subsequent deletes are no-ops.
 * Idempotent: ON CONFLICT(id) DO NOTHING.
 */
export async function ensureDeletedSentinelUser(): Promise<void> {
  await exec(
    `INSERT INTO users (id, name, initial, color, email, kind, created_at)
     VALUES ($1, $2, '?', '#999', NULL, 'human', $3)
     ON CONFLICT(id) DO NOTHING`,
    [DELETED_USER_ID, DELETED_USER_NAME, nowIso()],
  );
}

/**
 * GDPR soft-delete: anonymise the user row so the unique email index frees up
 * (so the same person can sign back up later) and the password hash is gone.
 *
 *  - `email` → NULL (releases the lower(email) unique index)
 *  - `email_hash` → sha256(originalEmail) — kept so abuse / fraud audits can
 *    still recognise a previously-known address without storing the plaintext
 *  - `password_hash` → NULL (account can no longer log in)
 *  - `name` → "deleted user"
 *  - `email_verified_at` → NULL
 *
 * Returns the sha256 hash that was stored (callers may log it, never the
 * plaintext email).
 */
export async function softDeleteUser(userId: string): Promise<string | null> {
  const row = await queryOne<{ email: string | null }>(
    `SELECT email FROM users WHERE id = $1`,
    [userId],
  );
  if (!row) return null;
  const emailHash = row.email
    ? createHash('sha256').update(row.email.trim().toLowerCase()).digest('hex')
    : null;
  await exec(
    `UPDATE users
        SET name = $1,
            initial = '?',
            email = NULL,
            email_hash = $2,
            password_hash = NULL,
            email_verified_at = NULL
      WHERE id = $3`,
    [DELETED_USER_NAME, emailHash, userId],
  );
  return emailHash;
}

/**
 * Read the stored email hash (set by `softDeleteUser`). Useful for audits;
 * the column lives outside the User wire type because the value is
 * write-only — the app never exposes it to the client.
 */
export async function getUserEmailHash(userId: string): Promise<string | null> {
  const r = await queryOne<{ email_hash: string | null }>(
    `SELECT email_hash FROM users WHERE id = $1`,
    [userId],
  );
  return r?.email_hash ?? null;
}
