import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { User } from '@foldo/protocol';
import { getUserById } from './repo/users.ts';
import { getUserIdForToken } from './repo/sessions.ts';
import { authGate } from './plugins/authGate.ts';

declare module 'fastify' {
  interface FastifyRequest {
    user?: User;
  }
}

/**
 * Convenience aliases used by demo flows / the in-directory MCP. Real users
 * authenticate via a session token stored in the `sessions` table.
 *
 * These — and the id-as-token fall-through in step 3 below — are EXPLICITLY
 * disabled in production. In dev they let the demo dropdown and the in-dir
 * MCP work without a signup; in prod they would let anyone who knows a user
 * id impersonate that user.
 */
const TOKEN_ALIASES: Record<string, string> = {
  'demo-user': 'u-you',
  'demo-mcp': 'u-claude',
};

const ALLOW_DEMO_AUTH = process.env.NODE_ENV !== 'production';

/**
 * Resolve a bearer token to a user. Resolution order:
 *   1. Session token in `sessions` table → owning user (always)
 *   2. Demo alias (demo-user / demo-mcp) → mapped user id (dev only)
 *   3. Demo fall-through: token == existing user id (dev only)
 *
 * Steps 2 and 3 are gated by NODE_ENV. In production only real session tokens
 * (cryptographically random, stored in the `sessions` table) authenticate.
 */
export async function resolveUserFromToken(
  token: string | null | undefined,
): Promise<User | null> {
  if (!token) return null;
  const sessionUserId = await getUserIdForToken(token);
  if (sessionUserId) {
    const u = await getUserById(sessionUserId);
    if (u) return u;
  }
  if (!ALLOW_DEMO_AUTH) return null;
  const aliased = TOKEN_ALIASES[token];
  if (aliased) {
    const u = await getUserById(aliased);
    if (u) return u;
  }
  return getUserById(token);
}

export function extractBearerToken(req: FastifyRequest): string | null {
  const header = req.headers['authorization'];
  if (!header || Array.isArray(header)) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header);
  // match[1] is the first capture group — guaranteed present when match is non-null.
  return match && match[1] ? match[1].trim() : null;
}

export async function registerAuth(app: FastifyInstance): Promise<void> {
  app.addHook('onRequest', async (req) => {
    const token = extractBearerToken(req);
    const user = await resolveUserFromToken(token);
    if (user) {
      req.user = user;
      // Re-bind the per-request logger so every subsequent log line
      // (handler, error handler, hooks) carries `userId` — gives us one-line
      // "everything this user did in this session" lookups in aggregators.
      req.log = req.log.child({ userId: user.id });
    }
  });
  // Centralised board-membership gates exposed as `app.requireEditor` /
  // `app.requireMember`. Replaces the per-route copies in comments.ts,
  // frames.ts, dispatches.ts, tests.ts, shares.ts, etc.
  await app.register(authGate);
}

/** Throw a 401 unless the request has an authenticated user. */
export function requireUser(req: FastifyRequest): User {
  if (!req.user) {
    const err = new Error('Unauthorized') as Error & { statusCode?: number };
    err.statusCode = 401;
    throw err;
  }
  return req.user;
}

/**
 * Throw a 403 unless the authenticated user's email is verified. Use this
 * to gate actions that send outbound mail or share something publicly (publishing
 * a User Test, minting a public board-share link, etc.) so a spam signup
 * can't immediately weaponise the deploy. Demo accounts (no `email` on the
 * record) and agent accounts (`kind === 'agent'`) are grandfathered through.
 *
 * The Phase-2 protocol exposes `emailVerifiedAt` on the User type — the
 * client uses the same signal to render a "verify your email" banner.
 */
export function assertEmailVerified(req: FastifyRequest): User {
  const user = requireUser(req);
  // Agents (Claude Code, …) don't have human emails; demo accounts from the
  // seed have no email at all — both are exempt.
  if (user.kind === 'agent' || !user.email) return user;
  if (!user.emailVerifiedAt) {
    const err = new Error(
      'Please verify your email before doing this',
    ) as Error & { statusCode?: number; code?: string };
    err.statusCode = 403;
    err.code = 'EMAIL_NOT_VERIFIED';
    throw err;
  }
  return user;
}
