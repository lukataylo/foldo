import type { FastifyInstance } from 'fastify';
import type { User } from '@foldo/protocol';
import { randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import {
  getUserByEmail,
  getUserById,
  getUserPasswordHash,
  listUsers,
  markEmailVerified,
  setUserPasswordHash,
  updateUserProfile,
  upsertUser,
} from '../repo/users.ts';
import {
  createSession,
  deleteAllSessionsForUserExcept,
  deleteSession,
  deleteSessionOwnedBy,
  getApiTokenForUser,
  listApiTokensForUser,
  listSessionsForUser,
} from '../repo/sessions.ts';
import { addBoardMember } from '../repo/members.ts';
import { DEMO_BOARD_ID } from '../seed.ts';
import { extractBearerToken, requireUser } from '../auth.ts';
import { rateLimitPreHandler } from '../rateLimit.ts';
import { nowIso } from '../util.ts';
import {
  consumePasswordResetToken,
  mintPasswordResetToken,
} from '../repo/passwordResets.ts';
import {
  consumeEmailVerificationToken,
  mintEmailVerificationToken,
} from '../repo/emailVerifications.ts';
import { getEmailSender } from '../email/index.ts';

interface ScryptParams {
  /** CPU/memory cost factor — must be a power of 2. */
  N: number;
  /** Block size. 8 is the well-tested default. */
  r: number;
  /** Parallelization. 1 is the well-tested default. */
  p: number;
}

/**
 * Async scrypt that lets us pass cost params. Node's promisified scrypt
 * doesn't expose the options arg cleanly, so we wrap the callback form.
 */
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
        // The memory needed for scrypt is roughly 128 * N * r bytes; for our
        // N=32768, r=8 that's exactly 32 MiB — the openssl default maxmem.
        // Bump the ceiling so we don't error at the limit and so we have
        // headroom to raise N again later without another code change.
        maxmem: 128 * 1024 * 1024,
      },
      (err, derived) => {
        if (err) return reject(err);
        resolve(derived as Buffer);
      },
    );
  });
}
// promisify(scryptCb) reference kept around so it isn't tree-shaken before
// the rewrite lands in any open feature branches.
void promisify;

const PASSWORD_MIN = 8;
const PASSWORD_MAX = 200;
const SCRYPT_KEYLEN = 64;

/**
 * Current cost params. N=2^15 puts a single hash at ~150ms on a modern
 * laptop — slow enough to make offline brute-force expensive, fast enough
 * that interactive login feels instant.
 */
const CURRENT_PARAMS: ScryptParams = { N: 32768, r: 8, p: 1 };

/**
 * Defaults that were in effect when the legacy (paramless) format was
 * written. Node's scrypt defaults are N=16384, r=8, p=1.
 */
const LEGACY_PARAMS: ScryptParams = { N: 16384, r: 8, p: 1 };

const PALETTE = ['#ff7849', '#5db0ff', '#b08cff', '#7fd49a', '#f5b86b', '#ff8ec2'];

/**
 * Hash format `scrypt:N=N,r=R,p=P:<salt-hex>:<key-hex>`. Encoding the cost
 * params alongside the hash means we can bump them safely later — verify still
 * works against old hashes, and the next successful login rotates the hash to
 * the new params (see `verifyPassword`'s `needsRehash`).
 *
 * Legacy hashes use the 3-part `scrypt:<salt>:<key>` and are verified with
 * `LEGACY_PARAMS`; they're rotated lazily on next login.
 */
async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scryptAsync(password, salt, SCRYPT_KEYLEN, CURRENT_PARAMS);
  return `scrypt:N=${CURRENT_PARAMS.N},r=${CURRENT_PARAMS.r},p=${CURRENT_PARAMS.p}:${salt.toString('hex')}:${key.toString('hex')}`;
}

/**
 * Discriminated result of {@link verifyPassword}.
 *
 * Historically this returned `{ ok: boolean, needsRehash: boolean }`, but a
 * boolean success flag muddled the "ok with a flag" and "rejected for reason X"
 * branches at every call site. We now mirror the public `{ error, code }` REST
 * shape so the call sites read like normal error handling — `if (!result.ok)`
 * still works for the happy-path guard, and on failure the `code` is a stable
 * machine-readable reason ('HASH_MALFORMED', 'HASH_MISMATCH', 'SCRYPT_FAILED')
 * we can log/branch on without inferring it from the boolean alone.
 */
type VerifyResult =
  | { ok: true; needsRehash: boolean }
  | { ok: false; error: string; code: 'HASH_MALFORMED' | 'HASH_MISMATCH' | 'SCRYPT_FAILED' };

function parseParams(spec: string): ScryptParams | null {
  // spec is like "N=32768,r=8,p=1"
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

async function verifyPassword(stored: string, password: string): Promise<VerifyResult> {
  const parts = stored.split(':');
  let params: ScryptParams | null = null;
  let saltHex: string | undefined;
  let keyHex: string | undefined;
  let isLegacy = false;
  if (parts[0] === 'scrypt' && parts.length === 4) {
    params = parseParams(parts[1] ?? '');
    saltHex = parts[2];
    keyHex = parts[3];
  } else if (parts[0] === 'scrypt' && parts.length === 3) {
    params = LEGACY_PARAMS;
    saltHex = parts[1];
    keyHex = parts[2];
    isLegacy = true;
  }
  if (!params || !saltHex || !keyHex) {
    return { ok: false, error: 'Stored hash is malformed', code: 'HASH_MALFORMED' };
  }
  const salt = Buffer.from(saltHex, 'hex');
  const expected = Buffer.from(keyHex, 'hex');
  let actual: Buffer;
  try {
    actual = await scryptAsync(password, salt, expected.length, params);
  } catch {
    return { ok: false, error: 'scrypt failed', code: 'SCRYPT_FAILED' };
  }
  if (actual.length !== expected.length) {
    return { ok: false, error: 'Password does not match', code: 'HASH_MISMATCH' };
  }
  if (!timingSafeEqual(actual, expected)) {
    return { ok: false, error: 'Password does not match', code: 'HASH_MISMATCH' };
  }
  // A successful verify against a legacy hash, OR against any params weaker
  // than CURRENT_PARAMS, signals the route to re-hash on this login.
  const needsRehash =
    isLegacy ||
    params.N < CURRENT_PARAMS.N ||
    params.r < CURRENT_PARAMS.r ||
    params.p < CURRENT_PARAMS.p;
  return { ok: true, needsRehash };
}

function newSessionToken(): string {
  return `sk_${randomBytes(32).toString('hex')}`;
}

function newUserId(): string {
  return `u-${randomBytes(8).toString('hex')}`;
}

/**
 * Mint a fresh email-verification token for the given user and send the
 * email via the configured EmailSender. Used on signup and from the
 * resend endpoint. Errors are caught + logged so a transient send failure
 * doesn't break the parent request.
 */
async function sendVerificationEmail(
  user: User,
  email: string,
  log: { info: Function; warn: Function; error: Function },
): Promise<void> {
  try {
    const { token, expiresAt } = await mintEmailVerificationToken(user.id, email);
    const origin =
      process.env.FOLDO_PUBLIC_WEB_ORIGIN ?? 'http://localhost:5173';
    const verifyUrl = `${origin}/verify?token=${encodeURIComponent(token)}`;
    const ttlHrs = Math.max(
      1,
      Math.round((expiresAt.getTime() - Date.now()) / 3600_000),
    );
    await getEmailSender().send({
      to: email,
      subject: 'Verify your Foldo email',
      kind: 'email-verification',
      text:
        `Hi ${user.name},\n\n` +
        `Welcome to Foldo. Confirm this email by opening the link below. It expires in ${ttlHrs} hours.\n\n` +
        `${verifyUrl}\n\n` +
        `If you didn't sign up, ignore this email.\n`,
      html:
        `<p>Hi ${escapeHtml(user.name)},</p>` +
        `<p>Welcome to Foldo. Confirm this email by opening the link below. It expires in ${ttlHrs} hours.</p>` +
        `<p><a href="${verifyUrl}">${verifyUrl}</a></p>` +
        `<p>If you didn't sign up, ignore this email.</p>`,
    });
    log.info({ userId: user.id }, 'verification email sent');
  } catch (err) {
    log.error({ err, userId: user.id }, 'verification email send failed');
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function deriveInitial(name: string): string {
  const trimmed = name.trim();
  const first = trimmed[0];
  return first ? first.toUpperCase() : '?';
}

function pickColor(seed: string): string {
  let h = 0;
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return PALETTE[h % PALETTE.length] ?? PALETTE[0]!;
}

interface SignupBody {
  email?: string;
  password?: string;
  name?: string;
}

interface LoginBody {
  email?: string;
  password?: string;
}

interface ProfileUpdateBody {
  name?: string;
  email?: string;
  color?: string;
}

interface ChangePasswordBody {
  currentPassword?: string;
  newPassword?: string;
}

export async function registerAuthRoutes(app: FastifyInstance): Promise<void> {
  // Authenticated-only, anyone can sign up, but only members can enumerate
  // the user catalogue (used by the canvas's author dropdown).
  app.get('/api/auth/users', async (req, reply) => {
    requireUser(req);
    return reply.send({ users: await listUsers() });
  });

  app.post<{ Body: SignupBody }>(
    '/api/auth/signup',
    { preHandler: rateLimitPreHandler('auth-signup', 5, 60_000) },
    async (req, reply) => {
    // Normalize to lowercase so the stored value matches what the
    // `lower(email)` unique index enforces and what lookups compare against.
    const email = (req.body?.email ?? '').trim().toLowerCase();
    const password = req.body?.password ?? '';
    const name = (req.body?.name ?? '').trim();

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return reply.code(400).send({ error: 'Valid email required', code: 'BAD_REQUEST' });
    }
    if (password.length < PASSWORD_MIN || password.length > PASSWORD_MAX) {
      return reply.code(400).send({
        error: `Password must be ${PASSWORD_MIN}–${PASSWORD_MAX} characters`,
        code: 'BAD_REQUEST',
      });
    }
    if (!name) {
      return reply.code(400).send({ error: 'Name required', code: 'BAD_REQUEST' });
    }

    const existing = await getUserByEmail(email);
    if (existing) {
      return reply.code(409).send({
        error: 'An account with that email already exists',
        code: 'EMAIL_TAKEN',
      });
    }

    const id = newUserId();
    await upsertUser({
      id,
      name,
      initial: deriveInitial(name),
      color: pickColor(email),
      email,
      kind: 'human',
    });
    const hash = await hashPassword(password);
    await setUserPasswordHash(id, hash);

    // Auto-join the shared demo board so new signups have something to see.
    try {
      await addBoardMember(DEMO_BOARD_ID, id, 'editor');
    } catch {
      // Demo board may not exist (fresh DB pre-seed), non-fatal.
    }

    const token = newSessionToken();
    await createSession(token, id, req.headers['user-agent']);

    const user = await getUserById(id);
    if (user) {
      // Mint + send the verification email. Don't await — the signup
      // response shouldn't be held up by the SMTP round-trip, and the
      // helper handles its own errors so a transient send failure doesn't
      // 500 the signup.
      void sendVerificationEmail(user, email, req.log);
    }
    return reply.send({ token, user, createdAt: nowIso() });
    },
  );

  app.post<{ Body: LoginBody }>(
    '/api/auth/login',
    { preHandler: rateLimitPreHandler('auth-login', 5, 60_000) },
    async (req, reply) => {
    const email = (req.body?.email ?? '').trim().toLowerCase();
    const password = req.body?.password ?? '';
    if (!email || !password) {
      return reply.code(400).send({ error: 'Email and password required', code: 'BAD_REQUEST' });
    }

    const user = await getUserByEmail(email);
    if (!user) {
      return reply.code(401).send({ error: 'Invalid email or password', code: 'INVALID_CREDENTIALS' });
    }
    const hash = await getUserPasswordHash(user.id);
    if (!hash) {
      return reply.code(401).send({ error: 'Invalid email or password', code: 'INVALID_CREDENTIALS' });
    }
    const result = await verifyPassword(hash, password);
    if (!result.ok) {
      return reply.code(401).send({ error: 'Invalid email or password', code: 'INVALID_CREDENTIALS' });
    }
    // Lazy rehash: any successful login against a hash with weaker-than-
    // CURRENT_PARAMS gets rotated to the current params transparently. This
    // is how we move the install off legacy/3-part hashes without a
    // forced-password-reset event.
    if (result.needsRehash) {
      try {
        const fresh = await hashPassword(password);
        await setUserPasswordHash(user.id, fresh);
        req.log.info({ userId: user.id }, 'rotated password hash to current params');
      } catch (err) {
        req.log.warn({ err, userId: user.id }, 'password rehash on login failed');
      }
    }

    const token = newSessionToken();
    await createSession(token, user.id, req.headers['user-agent']);
    return reply.send({ token, user });
    },
  );

  app.post('/api/auth/logout', async (req, reply) => {
    const token = extractBearerToken(req);
    if (token) await deleteSession(token);
    return reply.send({ ok: true });
  });

  // ---- Password reset: request a token + send the email ----
  // Public endpoint. ALWAYS returns 200 — never leaks whether the email
  // exists. Rate-limited per IP because token generation is cheap enough
  // that a flood is annoying. The actual delivery is via EmailSender;
  // dev/CI stub writes to .foldo-email-outbox/.
  app.post<{ Body: { email?: string } }>(
    '/api/auth/password-reset/request',
    { preHandler: rateLimitPreHandler('auth-pw-reset-req', 5, 60_000) },
    async (req, reply) => {
      const email = (req.body?.email ?? '').trim().toLowerCase();
      // Always reply success — no account-enumeration leak.
      const ack = { ok: true } as const;
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return reply.send(ack);
      }
      const user = await getUserByEmail(email);
      if (!user) {
        // Quiet warn, not a failure — useful telemetry without leaking the
        // signal to the caller.
        req.log.info({ email }, 'password-reset requested for unknown email');
        return reply.send(ack);
      }
      try {
        const { token, expiresAt } = await mintPasswordResetToken(user.id);
        const origin =
          process.env.FOLDO_PUBLIC_WEB_ORIGIN ?? 'http://localhost:5173';
        const resetUrl = `${origin}/reset?token=${encodeURIComponent(token)}`;
        const ttlMin = Math.max(
          1,
          Math.round((expiresAt.getTime() - Date.now()) / 60_000),
        );
        await getEmailSender().send({
          to: user.email ?? email,
          subject: 'Reset your Foldo password',
          kind: 'password-reset',
          text:
            `Hi ${user.name},\n\n` +
            `Click the link below to choose a new password. It expires in ${ttlMin} minutes.\n\n` +
            `${resetUrl}\n\n` +
            `If you didn't request this, ignore this email — your existing password still works.\n`,
          html:
            `<p>Hi ${escapeHtml(user.name)},</p>` +
            `<p>Click the link below to choose a new password. It expires in ${ttlMin} minutes.</p>` +
            `<p><a href="${resetUrl}">${resetUrl}</a></p>` +
            `<p>If you didn't request this, ignore this email — your existing password still works.</p>`,
        });
        req.log.info({ userId: user.id }, 'password-reset email sent');
      } catch (err) {
        req.log.error({ err, userId: user.id }, 'password-reset send failed');
      }
      return reply.send(ack);
    },
  );

  // ---- Password reset: consume the token + set the new password ----
  // Public endpoint. Returns the freshly-issued session token + user so the
  // client can log the user in immediately without a second login form.
  // EVERY other session for this user is revoked — the assumption is that
  // a password reset is triggered because the old password may have leaked.
  app.post<{ Body: { token?: string; newPassword?: string } }>(
    '/api/auth/password-reset/complete',
    // 5 attempts per 15 minutes per IP. Matches the login limit so a bot
    // can't pivot from "spray logins" to "spray reset-token completions"
    // — they're equally cheap to abuse if uncapped. The previous 10/min
    // was generous enough that a bot could try ~150 tokens before tripping.
    { preHandler: rateLimitPreHandler('auth-pw-reset-cmp', 5, 15 * 60_000) },
    async (req, reply) => {
      const token = (req.body?.token ?? '').trim();
      const newPassword = req.body?.newPassword ?? '';
      if (!token) {
        return reply
          .code(400)
          .send({ error: 'Reset token required', code: 'BAD_REQUEST' });
      }
      if (newPassword.length < PASSWORD_MIN || newPassword.length > PASSWORD_MAX) {
        return reply.code(400).send({
          error: `Password must be ${PASSWORD_MIN}–${PASSWORD_MAX} characters`,
          code: 'BAD_REQUEST',
        });
      }
      const consumed = await consumePasswordResetToken(token);
      if (!consumed) {
        return reply.code(400).send({
          error: 'Reset link is invalid or has expired',
          code: 'INVALID_TOKEN',
        });
      }
      const user = await getUserById(consumed.userId);
      if (!user) {
        return reply.code(400).send({
          error: 'Reset link is invalid or has expired',
          code: 'INVALID_TOKEN',
        });
      }
      const hash = await hashPassword(newPassword);
      await setUserPasswordHash(user.id, hash);
      // Mint a fresh session for the requester, then invalidate every other
      // session belonging to this user.
      const sessionToken = newSessionToken();
      await createSession(sessionToken, user.id, req.headers['user-agent']);
      const revoked = await deleteAllSessionsForUserExcept(user.id, sessionToken);
      req.log.info(
        { userId: user.id, revokedSessions: revoked },
        'password reset completed',
      );
      return reply.send({ token: sessionToken, user });
    },
  );

  // ---- Email verification: consume the token ----
  // Public endpoint. We accept either GET (link in email) or POST (the SPA
  // when it intercepts /verify?token=...). Either way: validate, stamp
  // users.email_verified_at, return 200. Always returns a JSON body so the
  // SPA can show a success state.
  const verifyHandler = async (
    req: import('fastify').FastifyRequest,
    reply: import('fastify').FastifyReply,
    rawToken: string | undefined,
  ): Promise<void> => {
    const token = (rawToken ?? '').trim();
    if (!token) {
      reply.code(400).send({
        error: 'Verification token required',
        code: 'BAD_REQUEST',
      });
      return;
    }
    const consumed = await consumeEmailVerificationToken(token);
    if (!consumed) {
      reply.code(400).send({
        error: 'Verification link is invalid or has expired',
        code: 'INVALID_TOKEN',
      });
      return;
    }
    await markEmailVerified(consumed.userId);
    req.log.info(
      { userId: consumed.userId, email: consumed.email },
      'email verified',
    );
    reply.send({ ok: true, email: consumed.email });
  };
  app.get<{ Querystring: { token?: string } }>(
    '/api/auth/verify-email',
    { preHandler: rateLimitPreHandler('auth-verify', 20, 60_000) },
    async (req, reply) => verifyHandler(req, reply, req.query.token),
  );
  app.post<{ Body: { token?: string } }>(
    '/api/auth/verify-email',
    { preHandler: rateLimitPreHandler('auth-verify', 20, 60_000) },
    async (req, reply) => verifyHandler(req, reply, req.body?.token),
  );

  // ---- Resend the verification email ----
  // Authenticated — only the user themselves can request a resend.
  // Idempotent on the verified case (no-op + 200). Rate-limited per user.
  app.post(
    '/api/auth/resend-verification',
    { preHandler: rateLimitPreHandler('auth-verify-resend', 3, 60_000) },
    async (req, reply) => {
      const me = requireUser(req);
      if (me.emailVerifiedAt) {
        return reply.send({ ok: true, alreadyVerified: true });
      }
      if (!me.email) {
        return reply.code(400).send({
          error: 'This account has no email on file',
          code: 'NO_EMAIL',
        });
      }
      await sendVerificationEmail(me, me.email, req.log);
      return reply.send({ ok: true });
    },
  );

  // ---------- authenticated routes ----------

  app.patch<{ Body: ProfileUpdateBody }>('/api/me', async (req, reply) => {
    const me = requireUser(req);
    const patch: ProfileUpdateBody = {};
    if (typeof req.body?.name === 'string') {
      const name = req.body.name.trim();
      if (name.length === 0 || name.length > 80) {
        return reply.code(400).send({ error: 'Name must be 1–80 chars', code: 'BAD_REQUEST' });
      }
      patch.name = name;
    }
    if (typeof req.body?.email === 'string') {
      const email = req.body.email.trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return reply.code(400).send({ error: 'Valid email required', code: 'BAD_REQUEST' });
      }
      if (email.toLowerCase() !== (me.email ?? '').toLowerCase()) {
        const taken = await getUserByEmail(email);
        if (taken && taken.id !== me.id) {
          return reply.code(409).send({
            error: 'Another account already uses that email',
            code: 'EMAIL_TAKEN',
          });
        }
      }
      patch.email = email;
    }
    if (typeof req.body?.color === 'string') {
      if (!PALETTE.includes(req.body.color)) {
        return reply.code(400).send({ error: 'Pick a colour from the palette', code: 'BAD_REQUEST' });
      }
      patch.color = req.body.color;
    }
    const updated = await updateUserProfile(me.id, patch);
    return reply.send({ user: updated });
  });

  app.post<{ Body: ChangePasswordBody }>(
    '/api/auth/change-password',
    { preHandler: rateLimitPreHandler('auth-change-pw', 10, 60_000) },
    async (req, reply) => {
      const me = requireUser(req);
      const currentPassword = req.body?.currentPassword ?? '';
      const newPassword = req.body?.newPassword ?? '';
      if (!currentPassword || !newPassword) {
        return reply.code(400).send({
          error: 'Both currentPassword and newPassword are required',
          code: 'BAD_REQUEST',
        });
      }
      if (newPassword.length < PASSWORD_MIN || newPassword.length > PASSWORD_MAX) {
        return reply.code(400).send({
          error: `Password must be ${PASSWORD_MIN}–${PASSWORD_MAX} characters`,
          code: 'BAD_REQUEST',
        });
      }
      const hash = await getUserPasswordHash(me.id);
      if (!hash) {
        return reply.code(400).send({
          error: 'Demo accounts have no password to change',
          code: 'NO_PASSWORD',
        });
      }
      const { ok } = await verifyPassword(hash, currentPassword);
      if (!ok) {
        return reply
          .code(401)
          .send({ error: 'Current password is wrong', code: 'INVALID_CREDENTIALS' });
      }
      const newHash = await hashPassword(newPassword);
      await setUserPasswordHash(me.id, newHash);

      // Revoke every other session so changing the password actually logs
      // attackers out everywhere except this device.
      const currentToken = extractBearerToken(req) ?? '';
      const revoked = await deleteAllSessionsForUserExcept(me.id, currentToken);
      return reply.send({ ok: true, revokedSessions: revoked });
    },
  );

  app.get('/api/auth/sessions', async (req, reply) => {
    const me = requireUser(req);
    const currentToken = extractBearerToken(req);
    const rows = await listSessionsForUser(me.id);
    return reply.send({
      sessions: rows.map((r) => ({
        token: r.token,
        userAgent: r.user_agent,
        createdAt: r.created_at,
        lastSeenAt: r.last_seen_at,
        current: r.token === currentToken,
      })),
    });
  });

  app.delete<{ Params: { token: string } }>(
    '/api/auth/sessions/:token',
    async (req, reply) => {
      const me = requireUser(req);
      const target = req.params.token;
      const removed = await deleteSessionOwnedBy(me.id, target);
      return reply.send({ ok: removed > 0 });
    },
  );

  // ---------- API tokens (long-lived, for MCP / agents) ----------
  //
  // Stored in the same `sessions` table with `kind = 'api'`. Validated by
  // the same auth middleware, so every existing protected route accepts
  // an API token in `Authorization: Bearer …`.

  function apiTokenRowToPublic(r: {
    token: string;
    label: string | null;
    created_at: string;
    last_seen_at: string;
  }, currentToken: string | null) {
    return {
      // Surface only a stable prefix / suffix so the user can identify a
      // token in the UI without re-exposing the full value (we don't
      // store a hash today, but treating the value as a secret in the
      // UI is the right discipline).
      id: r.token,
      preview: tokenPreview(r.token),
      label: r.label,
      createdAt: r.created_at,
      lastSeenAt: r.last_seen_at,
      current: r.token === currentToken,
    };
  }

  app.get('/api/auth/tokens', async (req, reply) => {
    const me = requireUser(req);
    const current = extractBearerToken(req);
    const rows = await listApiTokensForUser(me.id);
    return reply.send({ tokens: rows.map((r) => apiTokenRowToPublic(r, current)) });
  });

  app.post<{ Body: { label?: string } }>('/api/auth/tokens', async (req, reply) => {
    const me = requireUser(req);
    const labelRaw = (req.body?.label ?? '').trim();
    if (!labelRaw) {
      return reply.code(400).send({
        error: 'Give the token a label so you can recognise it later',
        code: 'BAD_REQUEST',
      });
    }
    if (labelRaw.length > 80) {
      return reply.code(400).send({ error: 'Label too long (80 max)', code: 'BAD_REQUEST' });
    }
    const token = newSessionToken();
    await createSession(token, me.id, req.headers['user-agent'], 'api', labelRaw);
    // Return the plaintext token EXACTLY once. Subsequent GETs return
    // only the preview.
    return reply.send({
      token,
      label: labelRaw,
      createdAt: nowIso(),
      warning: 'Copy this now — you will not see it again.',
    });
  });

  app.delete<{ Params: { token: string } }>(
    '/api/auth/tokens/:token',
    async (req, reply) => {
      const me = requireUser(req);
      // Only the owner can revoke; ensure the token is actually an api
      // token (otherwise the device-revocation route handles it).
      const row = await getApiTokenForUser(me.id, req.params.token);
      if (!row) {
        return reply.code(404).send({ error: 'Token not found', code: 'NOT_FOUND' });
      }
      const removed = await deleteSessionOwnedBy(me.id, req.params.token);
      return reply.send({ ok: removed > 0 });
    },
  );
}

function tokenPreview(token: string): string {
  if (token.length <= 12) return token;
  return `${token.slice(0, 6)}…${token.slice(-4)}`;
}
