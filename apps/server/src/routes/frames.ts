import type { FastifyInstance } from 'fastify';
import type {
  CreateFrameRequest,
  Frame,
  MoveFrameRequest,
  SuccessResponse,
  UpdateFrameRequest,
} from '@foldo/protocol';
import { requireUser } from '../auth.ts';
import {
  deleteFrame,
  getFrameById,
  insertFrame,
  moveFrame,
  updateFrame,
} from '../repo/frames.ts';
import { hub } from '../ws/hub.ts';
import { newId, nowIso } from '../util.ts';

export async function registerFrameRoutes(app: FastifyInstance): Promise<void> {
  app.post<{ Body: CreateFrameRequest }>('/api/frames', async (req, reply) => {
    requireUser(req);
    const body = req.body;
    if (!body || !body.boardId || !body.branchId || !body.content) {
      return reply.code(400).send({ error: 'Invalid frame body', code: 'BAD_REQUEST' });
    }
    const now = nowIso();
    const frame: Frame = {
      id: newId('f'),
      boardId: body.boardId,
      kind: body.kind,
      branchId: body.branchId,
      commitSha: body.commitSha,
      commitMessage: body.commitMessage,
      age: 'just now',
      position: body.position,
      size: body.size,
      content: body.content,
      parentFrameId: body.parentFrameId,
      createdAt: now,
      updatedAt: now,
    };
    insertFrame(frame);
    hub.broadcast(frame.boardId, { type: 'frame.added', frame });
    return reply.send(frame);
  });

  app.patch<{ Params: { id: string }; Body: UpdateFrameRequest }>(
    '/api/frames/:id',
    async (req, reply) => {
      requireUser(req);
      const existing = getFrameById(req.params.id);
      if (!existing) return reply.code(404).send({ error: 'Frame not found', code: 'NOT_FOUND' });
      const body = req.body ?? {};
      const merged = body.content
        ? ({ ...existing.content, ...body.content } as Frame['content'])
        : undefined;
      const next = updateFrame(req.params.id, {
        position: body.position,
        size: body.size,
        content: merged,
      });
      if (!next) return reply.code(404).send({ error: 'Frame not found', code: 'NOT_FOUND' });
      hub.broadcast(next.boardId, { type: 'frame.updated', frame: next });
      return reply.send(next);
    },
  );

  app.post<{ Params: { id: string }; Body: MoveFrameRequest }>(
    '/api/frames/:id/move',
    async (req, reply) => {
      requireUser(req);
      const body = req.body;
      if (!body?.position) {
        return reply.code(400).send({ error: 'Missing position', code: 'BAD_REQUEST' });
      }
      const next = moveFrame(req.params.id, body.position);
      if (!next) return reply.code(404).send({ error: 'Frame not found', code: 'NOT_FOUND' });
      hub.broadcast(next.boardId, {
        type: 'frame.moved',
        frameId: next.id,
        x: next.position.x,
        y: next.position.y,
      });
      return reply.send(next);
    },
  );

  app.delete<{ Params: { id: string } }>('/api/frames/:id', async (req, reply) => {
    requireUser(req);
    const existing = getFrameById(req.params.id);
    if (!existing) return reply.code(404).send({ error: 'Frame not found', code: 'NOT_FOUND' });
    deleteFrame(existing.id);
    hub.broadcast(existing.boardId, { type: 'frame.deleted', frameId: existing.id });
    return reply.send({ ok: true } satisfies SuccessResponse);
  });
}
