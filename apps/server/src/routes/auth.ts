import type { FastifyInstance } from 'fastify';
import type { MeResponse } from '@foldo/protocol';
import { listUsers } from '../repo/users.ts';
import { requireUser } from '../auth.ts';

/**
 * Demo-mode helper routes for picking a user / minting a "token" (just the user id).
 */
export async function registerAuthRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/auth/users', async (_req, reply) => {
    return reply.send({ users: listUsers() });
  });

  app.get('/api/me', async (req, reply) => {
    const user = requireUser(req);
    return reply.send({ user, token: user.id } satisfies MeResponse);
  });
}
