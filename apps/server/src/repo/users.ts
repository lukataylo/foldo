import type { User } from '@foldo/protocol';
import { db } from '../db.ts';
import { nowIso } from '../util.ts';

interface UserRow {
  id: string;
  name: string;
  initial: string;
  color: string;
  email: string | null;
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
    kind: r.kind,
  };
}

export function listUsers(): User[] {
  const rows = db.prepare(`SELECT * FROM users ORDER BY created_at`).all() as UserRow[];
  return rows.map(rowToUser);
}

export function getUserById(id: string): User | null {
  const r = db.prepare(`SELECT * FROM users WHERE id = ?`).get(id) as UserRow | undefined;
  return r ? rowToUser(r) : null;
}

export function upsertUser(u: User): User {
  db.prepare(
    `INSERT INTO users (id, name, initial, color, email, kind, created_at)
     VALUES (@id, @name, @initial, @color, @email, @kind, @created_at)
     ON CONFLICT(id) DO UPDATE SET
       name = excluded.name,
       initial = excluded.initial,
       color = excluded.color,
       email = excluded.email,
       kind = excluded.kind`,
  ).run({
    id: u.id,
    name: u.name,
    initial: u.initial,
    color: u.color,
    email: u.email ?? null,
    kind: u.kind,
    created_at: nowIso(),
  });
  return u;
}
