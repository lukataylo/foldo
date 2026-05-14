import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { User } from '@foldo/protocol';
import { getUserById } from './repo/users.ts';
import { getUserIdForToken } from './repo/sessions.ts';

declare module 'fastify' {
  interface FastifyRequest {
    user?: User;
  }
}

/**
 * Convenience aliases used by demo flows / the in-directory MCP. Real users
 * authenticate via a session token stored in the `sessions` table.
 */
const TOKEN_ALIASES: Record<string, string> = {
  'demo-user': 'u-you',
  'demo-mcp': 'u-claude',
};

/**
 * Resolve a bearer token to a user. Resolution order:
 *   1. Session token in `sessions` table → owning user
 *   2. Demo alias (demo-user / demo-mcp) → mapped user id
 *   3. Demo fall-through: token == existing user id (for the demo-account dropdown)
 *
 * Step 3 is intentional, anonymous canvas visitors who pick a demo identity
 * use that identity as their bearer. Real signups always use step 1 with a
 * cryptographically random token that can't be guessed.
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
  return match ? match[1].trim() : null;
}

export async function registerAuth(app: FastifyInstance): Promise<void> {
  app.addHook('onRequest', async (req) => {
    const token = extractBearerToken(req);
    const user = await resolveUserFromToken(token);
    if (user) req.user = user;
  });
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
