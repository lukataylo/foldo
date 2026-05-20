import type { FastifyInstance } from 'fastify';
import { randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import {
  getUserByEmail,
  getUserById,
  getUserPasswordHash,
  isEmailVerified,
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
import {
  consumeAuthActionToken,
  consumePendingTokensForUser,
  createAuthActionToken,
} from '../repo/authActionTokens.ts';
import { addBoardMember } from '../repo/members.ts';
import { DEMO_BOARD_ID } from '../seed.ts';
import { extractBearerToken, requireUser } from '../auth.ts';
import { rateLimitPreHandler } from '../rateLimit.ts';
import { nowIso } from '../util.ts';
import {
  isDevMailTransport,
  lastEmailTo,
  passwordResetEmail,
  sendEmail,
  verifyEmailEmail,
} from '../email/index.ts';

const scrypt = promisify(scryptCb) as (
  pw: string,
  salt: Buffer,
  keylen: number,
) => Promise<Buffer>;

const PASSWORD_MIN = 8;
const PASSWORD_MAX = 200;
const SCRYPT_KEYLEN = 64;

const PALETTE = ['#ff7849', '#5db0ff', '#b08cff', '#7fd49a', '#f5b86b', '#ff8ec2'];

async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(password, salt, SCRYPT_KEYLEN);
  return `scrypt:${salt.toString('hex')}:${key.toString('hex')}`;
}

async function verifyPassword(stored: string, password: string): Promise<boolean> {
  const parts = stored.split(':');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
  const salt = Buffer.from(parts[1], 'hex');
  const expected = Buffer.from(parts[2], 'hex');
  let actual: Buffer;
  try {
    actual = await scrypt(password, salt, expected.length);
  } catch {
    return false;
  }
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}

function newSessionToken(): string {
  return `sk_${randomBytes(32).toString('hex')}`;
}

function newUserId(): string {
  return `u-${randomBytes(8).toString('hex')}`;
}

/** Opaque, high-entropy token for password-reset / email-verify links. */
function newActionToken(): string {
  return randomBytes(32).toString('hex');
}

const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000; // 1 hour
const EMAIL_VERIFY_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Mint a fresh email-verification token for a user and send the email. Any
 * older pending verification tokens are invalidated first so only the latest
 * link works. Best-effort: a mail failure is logged, never thrown to callers.
 */
async function issueVerificationEmail(
  userId: string,
  email: string,
): Promise<void> {
  try {
    await consumePendingTokensForUser(userId, 'email_verify');
    const token = newActionToken();
    await createAuthActionToken({
      token,
      userId,
      kind: 'email_verify',
      expiresAt: new Date(Date.now() + EMAIL_VERIFY_TTL_MS),
    });
    const msg = verifyEmailEmail(token);
    await sendEmail({ to: email, subject: msg.subject, html: msg.html });
  } catch (err) {
    console.warn('[auth] could not send verification email:', String(err));
  }
}

function deriveInitial(name: string): string {
  const trimmed = name.trim();
  return trimmed.length > 0 ? trimmed[0].toUpperCase() : '?';
}

function pickColor(seed: string): string {
  let h = 0;
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return PALETTE[h % PALETTE.length];
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
    { preHandler: rateLimitPreHandler('auth-signup', 8, 60_000) },
    async (req, reply) => {
    const email = (req.body?.email ?? '').trim();
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

    // Soft email verification: send a verify link, but don't block login.
    await issueVerificationEmail(id, email);

    const user = await getUserById(id);
    return reply.send({
      token,
      user,
      emailVerified: false,
      createdAt: nowIso(),
    });
  });

  app.post<{ Body: LoginBody }>(
    '/api/auth/login',
    { preHandler: rateLimitPreHandler('auth-login', 12, 60_000) },
    async (req, reply) => {
    const email = (req.body?.email ?? '').trim();
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
    const ok = await verifyPassword(hash, password);
    if (!ok) {
      return reply.code(401).send({ error: 'Invalid email or password', code: 'INVALID_CREDENTIALS' });
    }

    const token = newSessionToken();
    await createSession(token, user.id, req.headers['user-agent']);
    const emailVerified = await isEmailVerified(user.id);
    return reply.send({ token, user, emailVerified });
  });

  app.post('/api/auth/logout', async (req, reply) => {
    const token = extractBearerToken(req);
    if (token) await deleteSession(token);
    return reply.send({ ok: true });
  });

  // ---------- password reset ----------

  // ALWAYS returns 200 with the same shape, whether or not the email maps to
  // an account — so the endpoint can't be used to enumerate registered users.
  // The token + email work is fire-and-forget (not awaited) so response
  // timing doesn't differ between a hit and a miss — closing a timing oracle.
  app.post<{ Body: { email?: string } }>(
    '/api/auth/request-password-reset',
    { preHandler: rateLimitPreHandler('auth-request-reset', 5, 60_000) },
    async (req, reply) => {
      const email = (req.body?.email ?? '').trim();
      if (email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        // Deliberately NOT awaited — see comment above.
        void (async () => {
          try {
            const user = await getUserByEmail(email);
            if (!user) return;
            // Only accounts that actually have a password can be reset
            // (demo / agent accounts have none).
            const hash = await getUserPasswordHash(user.id);
            if (!hash) return;
            await consumePendingTokensForUser(user.id, 'password_reset');
            const token = newActionToken();
            await createAuthActionToken({
              token,
              userId: user.id,
              kind: 'password_reset',
              expiresAt: new Date(Date.now() + PASSWORD_RESET_TTL_MS),
            });
            const msg = passwordResetEmail(token);
            await sendEmail({ to: email, subject: msg.subject, html: msg.html });
          } catch (err) {
            console.warn('[auth] password-reset email failed:', String(err));
          }
        })();
      }
      return reply.send({
        ok: true,
        message:
          'If an account exists for that email, a reset link is on its way.',
      });
    },
  );

  app.post<{ Body: { token?: string; password?: string } }>(
    '/api/auth/reset-password',
    { preHandler: rateLimitPreHandler('auth-reset-password', 10, 60_000) },
    async (req, reply) => {
      const token = (req.body?.token ?? '').trim();
      const password = req.body?.password ?? '';
      if (!token) {
        return reply
          .code(400)
          .send({ error: 'Reset token required', code: 'BAD_REQUEST' });
      }
      if (password.length < PASSWORD_MIN || password.length > PASSWORD_MAX) {
        return reply.code(400).send({
          error: `Password must be ${PASSWORD_MIN}–${PASSWORD_MAX} characters`,
          code: 'BAD_REQUEST',
        });
      }
      const row = await consumeAuthActionToken(token, 'password_reset');
      if (!row) {
        return reply.code(400).send({
          error: 'This reset link is invalid or has expired. Request a new one.',
          code: 'INVALID_TOKEN',
        });
      }
      const newHash = await hashPassword(password);
      await setUserPasswordHash(row.user_id, newHash);
      // Revoke every existing session — a reset means the prior password
      // (and any session minted with it) is no longer trusted.
      const revoked = await deleteAllSessionsForUserExcept(row.user_id, '');
      return reply.send({ ok: true, revokedSessions: revoked });
    },
  );

  // ---------- email verification ----------

  app.post<{ Body: { token?: string } }>(
    '/api/auth/verify-email',
    { preHandler: rateLimitPreHandler('auth-verify-email', 20, 60_000) },
    async (req, reply) => {
      const token = (req.body?.token ?? '').trim();
      if (!token) {
        return reply
          .code(400)
          .send({ error: 'Verification token required', code: 'BAD_REQUEST' });
      }
      const row = await consumeAuthActionToken(token, 'email_verify');
      if (!row) {
        return reply.code(400).send({
          error:
            'This verification link is invalid or has expired. Request a new one.',
          code: 'INVALID_TOKEN',
        });
      }
      await markEmailVerified(row.user_id);
      return reply.send({ ok: true });
    },
  );

  app.post(
    '/api/auth/resend-verification',
    { preHandler: rateLimitPreHandler('auth-resend-verification', 4, 60_000) },
    async (req, reply) => {
    const me = requireUser(req);
    if (await isEmailVerified(me.id)) {
      return reply.send({ ok: true, alreadyVerified: true });
    }
    if (!me.email) {
      return reply
        .code(400)
        .send({ error: 'This account has no email address', code: 'NO_EMAIL' });
    }
    await issueVerificationEmail(me.id, me.email);
    return reply.send({ ok: true });
  });

  // Authenticated identity + verification status, so the client can decide
  // whether to show the "verify your email" banner.
  app.get('/api/auth/me', async (req, reply) => {
    const me = requireUser(req);
    return reply.send({ user: me, emailVerified: await isEmailVerified(me.id) });
  });

  // ---------- dev-only mail inspection ----------
  //
  // Returns the most recent email sent to an address so E2E specs can extract
  // reset / verification links. 404 in production — never exposes mail there.
  app.get<{ Querystring: { to?: string } }>(
    '/api/dev/last-email',
    async (req, reply) => {
      if (process.env.NODE_ENV === 'production' || !isDevMailTransport()) {
        return reply.code(404).send({ error: 'Not found', code: 'NOT_FOUND' });
      }
      const to = (req.query?.to ?? '').trim();
      if (!to) {
        return reply
          .code(400)
          .send({ error: 'Query param "to" required', code: 'BAD_REQUEST' });
      }
      const email = lastEmailTo(to);
      if (!email) {
        return reply
          .code(404)
          .send({ error: 'No email for that address', code: 'NOT_FOUND' });
      }
      return reply.send({ email });
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
      const ok = await verifyPassword(hash, currentPassword);
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
