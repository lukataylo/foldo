import type { FastifyInstance } from 'fastify';
import type { SourceFile } from '@foldo/protocol';
import { getSource } from '../repo/sources.ts';

export async function registerSourceRoutes(app: FastifyInstance): Promise<void> {
  app.get<{
    Querystring: { repoSlug?: string; commitSha?: string; path?: string };
  }>('/api/sources', async (req, reply) => {
    const { repoSlug, commitSha, path } = req.query;
    if (!repoSlug || !commitSha || !path) {
      return reply
        .code(400)
        .send({ error: 'repoSlug, commitSha, path required', code: 'BAD_REQUEST' });
    }
    const src = await getSource(repoSlug, commitSha, path);
    if (!src) return reply.code(404).send({ error: 'Source not found', code: 'NOT_FOUND' });
    return reply.send(src satisfies SourceFile);
  });
}
