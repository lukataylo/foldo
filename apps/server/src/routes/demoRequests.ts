import type { FastifyInstance } from 'fastify';
import { exec } from '../db.ts';
import { newId } from '../util.ts';

interface DemoRequestBody {
  name?: string;
  email?: string;
  company?: string;
  teamSize?: string;
  agents?: string;
  message?: string;
}

export async function registerDemoRequestRoutes(app: FastifyInstance): Promise<void> {
  app.post<{ Body: DemoRequestBody }>('/api/demo-requests', async (req, reply) => {
    const name = (req.body?.name ?? '').trim();
    const email = (req.body?.email ?? '').trim();
    if (!name || !email) {
      return reply.code(400).send({ error: 'Name and email required', code: 'BAD_REQUEST' });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return reply.code(400).send({ error: 'Invalid email', code: 'BAD_REQUEST' });
    }
    await exec(
      `INSERT INTO demo_requests (id, name, email, company, team_size, agents, message)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        newId('dr'),
        name,
        email,
        req.body?.company?.trim() || null,
        req.body?.teamSize?.trim() || null,
        req.body?.agents?.trim() || null,
        req.body?.message?.trim() || null,
      ],
    );
    return reply.send({ ok: true });
  });
}
