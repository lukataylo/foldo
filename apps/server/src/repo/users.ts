import type { User } from '@foldo/protocol';
import { query, queryOne, exec } from '../db.ts';
import { nowIso } from '../util.ts';

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
