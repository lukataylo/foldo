// GDPR-posture routes — the "what's mine and how do I get it / delete it"
// half of the account surface. Two endpoints:
//
//   POST /api/me/export   →  full JSON dump of every row the requester
//                            authored or owns. No password hashes, no other
//                            users' data. Browser saves it as a file.
//   POST /api/me/delete   →  password-gated soft-delete. The row stays so
//                            board history survives, but the identity (email,
//                            name, hash) is wiped + every session is killed.
//
// Lives under /api/me/* so it composes with the existing PATCH /api/me
// profile-update route in routes/auth.ts. Both routes here are authenticated
// and never accept demo aliases — they touch destructive state.

import { randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { requireUser } from '../auth.ts';
import { rateLimitPreHandler } from '../rateLimit.ts';
import {
  DELETED_USER_ID,
  DELETED_USER_NAME,
  ensureDeletedSentinelUser,
  getUserPasswordHash,
  softDeleteUser,
} from '../repo/users.ts';
import { listBoardsOwnedBy } from '../repo/boards.ts';
import { listBranchesAuthoredBy } from '../repo/branches.ts';
import {
  anonymiseRepliesByAuthor,
  listCommentsAuthoredBy,
  reassignCommentsAuthor,
} from '../repo/comments.ts';
import {
  listSessionsForOwner,
  reassignTestCreator,
} from '../repo/testSessions.ts';
import { listDemoRequestsForEmail } from '../repo/demoRequests.ts';
import { exec } from '../db.ts';
import { nowIso } from '../util.ts';

// ----- password verify (copy of the impl in routes/auth.ts) ------------------
// Kept local rather than refactored into a shared module because the rest of
// the auth module is intentionally self-contained. If a third caller appears,
// promote this to apps/server/src/auth/passwords.ts.

interface ScryptParams { N: number; r: number; p: number }
const LEGACY_PARAMS: ScryptParams = { N: 16384, r: 8, p: 1 };
const SCRYPT_KEYLEN = 64;

function scryptAsync(
  password: string,
  salt: Buffer,
  keylen: number,
  params: ScryptParams,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCb(
      password,
      salt,
      keylen,
      {
        cost: params.N,
        blockSize: params.r,
        parallelization: params.p,
        maxmem: 128 * 1024 * 1024,
      },
      (err, derived) => {
        if (err) return reject(err);
        resolve(derived as Buffer);
      },
    );
  });
}

function parseParams(spec: string): ScryptParams | null {
  let N = 0, r = 0, p = 0;
  for (const kv of spec.split(',')) {
    const [k, v] = kv.split('=');
    const n = Number(v);
    if (!Number.isFinite(n) || n <= 0) return null;
    if (k === 'N') N = n;
    else if (k === 'r') r = n;
    else if (k === 'p') p = n;
  }
  if (!N || !r || !p) return null;
  return { N, r, p };
}

async function verifyPassword(stored: string, password: string): Promise<boolean> {
  const parts = stored.split(':');
  let params: ScryptParams | null = null;
  let saltHex: string | undefined;
  let keyHex: string | undefined;
  if (parts[0] === 'scrypt' && parts.length === 4) {
    params = parseParams(parts[1] ?? '');
    saltHex = parts[2];
    keyHex = parts[3];
  } else if (parts[0] === 'scrypt' && parts.length === 3) {
    params = LEGACY_PARAMS;
    saltHex = parts[1];
    keyHex = parts[2];
  }
  if (!params || !saltHex || !keyHex) return false;
  const salt = Buffer.from(saltHex, 'hex');
  const expected = Buffer.from(keyHex, 'hex');
  let actual: Buffer;
  try {
    actual = await scryptAsync(password, salt, expected.length, params);
  } catch {
    return false;
  }
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}
// Keep randomBytes referenced so a future password-rotation call doesn't need
// to re-import it.
void randomBytes;

// ----- route registration ---------------------------------------------------

interface DeleteBody {
  currentPassword?: string;
}

export async function registerMeRoutes(app: FastifyInstance): Promise<void> {
  // ---- POST /api/me/export -------------------------------------------------
  // Single JSON document. Each top-level key is one of the rowsets the user
  // contributed to. `exportedAt` lets a downstream tool spot a stale dump.
  //
  // Authenticated. Never includes password hashes, session tokens, or any
  // row authored by a different user. Demo-requests are matched on the
  // current email-on-file — a deleted account has none, so the export is a
  // no-op in that branch (defence-in-depth; in practice the user has been
  // logged out by then).
  app.post(
    '/api/me/export',
    { preHandler: rateLimitPreHandler('me-export', 5, 60_000) },
    async (req, reply) => {
      const me = requireUser(req);
      const [boards, branches, comments, sessions, demoRequests] = await Promise.all([
        listBoardsOwnedBy(me.id),
        listBranchesAuthoredBy(me.id),
        listCommentsAuthoredBy(me.id),
        listSessionsForOwner(me.id),
        me.email ? listDemoRequestsForEmail(me.email) : Promise.resolve([]),
      ]);
      // Public, scrubbed shape of the User row — drop nothing the wire type
      // already drops (no password_hash etc., because the User type doesn't
      // surface those in the first place).
      const profile = {
        id: me.id,
        name: me.name,
        initial: me.initial,
        color: me.color,
        email: me.email ?? null,
        emailVerifiedAt: me.emailVerifiedAt ?? null,
        kind: me.kind,
      };
      reply
        .header('content-type', 'application/json')
        .send({
          exportedAt: nowIso(),
          format: 'foldo-export@1',
          profile,
          boards,
          branches,
          comments,
          testSessions: sessions,
          demoRequests,
        });
    },
  );

  // ---- POST /api/me/delete -------------------------------------------------
  // Soft delete:
  //   * password-gated (401 if wrong)
  //   * anonymise comments to the `u-deleted` sentinel (board history intact)
  //   * reassign test ownership to the sentinel too
  //   * wipe email + email_verified_at + password_hash + name on the user row
  //   * store sha256(email) on the row for fraud-audit lookup
  //   * delete every session for the user (browser + api)
  //
  // Order: verify → anonymise → soft-delete user → kill sessions. The session
  // kill is LAST so we don't lose the auth context mid-flow.
  app.post<{ Body: DeleteBody }>(
    '/api/me/delete',
    { preHandler: rateLimitPreHandler('me-delete', 3, 60_000) },
    async (req, reply) => {
      const me = requireUser(req);
      const currentPassword = req.body?.currentPassword ?? '';
      if (!currentPassword) {
        return reply.code(400).send({
          error: 'currentPassword is required',
          code: 'BAD_REQUEST',
        });
      }
      const hash = await getUserPasswordHash(me.id);
      if (!hash) {
        // No password on file (demo / agent account). We refuse to delete
        // those via this endpoint — they're not real signups and the
        // password-gate is the whole point.
        return reply.code(400).send({
          error: 'This account has no password set',
          code: 'NO_PASSWORD',
        });
      }
      const ok = await verifyPassword(hash, currentPassword);
      if (!ok) {
        return reply
          .code(401)
          .send({ error: 'Wrong password', code: 'INVALID_CREDENTIALS' });
      }

      await ensureDeletedSentinelUser();
      await reassignCommentsAuthor(me.id, DELETED_USER_ID);
      // top-level reassignment doesn't touch nested replies that live in
      // `comments.replies_json` — anonymise those too. Mirrors the identity
      // shape the sentinel row carries (see ensureDeletedSentinelUser).
      const repliesAnonymised = await anonymiseRepliesByAuthor(me.id, {
        userId: DELETED_USER_ID,
        name: DELETED_USER_NAME,
        initial: '?',
        color: '#999',
      });
      await reassignTestCreator(me.id, DELETED_USER_ID);
      const emailHash = await softDeleteUser(me.id);
      // Kill every session belonging to this user — both browser and API
      // tokens. The cascade on sessions.user_id is fk-cascade on user DELETE,
      // but we soft-delete so the cascade doesn't fire — explicit cleanup.
      await exec(`DELETE FROM sessions WHERE user_id = $1`, [me.id]);

      req.log.info(
        { userId: me.id, emailHash, repliesAnonymised },
        'user soft-deleted (GDPR)',
      );
      return reply.send({ ok: true });
    },
  );
}
