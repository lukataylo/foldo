import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { User } from '@foldo/protocol';
import { getUserById } from './repo/users.ts';

declare module 'fastify' {
  interface FastifyRequest {
    user?: User;
  }
}

/**
 * Demo auth: bearer token IS the user id. A few aliases for demo convenience:
 *   demo-user → u-you (the default browser user)
 *   demo-mcp  → u-claude (the in-directory MCP agent)
 */
const TOKEN_ALIASES: Record<string, string> = {
  'demo-user': 'u-you',
  'demo-mcp': 'u-claude',
};

export function resolveUserFromToken(token: string | null | undefined): User | null {
  if (!token) return null;
  const id = TOKEN_ALIASES[token] ?? token;
  return getUserById(id);
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
    const user = resolveUserFromToken(token);
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
