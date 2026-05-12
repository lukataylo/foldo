import type { FastifyInstance } from 'fastify';
import type {
  CommentReply,
  CreateCommentRequest,
  ReplyToCommentRequest,
  SuccessResponse,
  UpdateCommentRequest,
} from '@foldo/protocol';
import { requireUser } from '../auth.ts';
import {
  addReply,
  deleteComment,
  getCommentById,
  insertComment,
  updateComment,
} from '../repo/comments.ts';
import { hub } from '../ws/hub.ts';
import { newId, nowIso } from '../util.ts';

export async function registerCommentRoutes(app: FastifyInstance): Promise<void> {
  app.post<{ Body: CreateCommentRequest }>('/api/comments', async (req, reply) => {
    const user = requireUser(req);
    const body = req.body;
    if (!body?.boardId || !body?.frameId || !body?.text) {
      return reply.code(400).send({ error: 'Invalid comment body', code: 'BAD_REQUEST' });
    }
    const comment = insertComment({
      id: newId('c'),
      boardId: body.boardId,
      frameId: body.frameId,
      authorUserId: user.id,
      text: body.text,
      pin: body.pin,
      anchor: body.anchor,
      target: body.target,
    });
    hub.broadcast(comment.boardId, { type: 'comment.added', comment });
    return reply.send(comment);
  });

  app.patch<{ Params: { id: string }; Body: UpdateCommentRequest }>(
    '/api/comments/:id',
    async (req, reply) => {
      const user = requireUser(req);
      const existing = getCommentById(req.params.id);
      if (!existing) return reply.code(404).send({ error: 'Comment not found', code: 'NOT_FOUND' });
      const next = updateComment(req.params.id, {
        text: req.body?.text,
        resolved: req.body?.resolved,
        resolvedByUserId: user.id,
      });
      if (!next) return reply.code(404).send({ error: 'Comment not found', code: 'NOT_FOUND' });
      hub.broadcast(next.boardId, { type: 'comment.updated', comment: next });
      return reply.send(next);
    },
  );

  app.post<{ Params: { id: string }; Body: ReplyToCommentRequest }>(
    '/api/comments/:id/replies',
    async (req, reply) => {
      const user = requireUser(req);
      const existing = getCommentById(req.params.id);
      if (!existing) return reply.code(404).send({ error: 'Comment not found', code: 'NOT_FOUND' });
      if (!req.body?.text) {
        return reply.code(400).send({ error: 'Missing reply text', code: 'BAD_REQUEST' });
      }
      const replyObj: CommentReply = {
        id: newId('cr'),
        authorUserId: user.id,
        authorName: user.name,
        authorInitial: user.initial,
        authorColor: user.color,
        text: req.body.text,
        createdAt: nowIso(),
      };
      const updated = addReply(existing.id, replyObj);
      if (updated) {
        hub.broadcast(updated.boardId, {
          type: 'comment.reply.added',
          commentId: updated.id,
          reply: replyObj,
        });
      }
      return reply.send(replyObj);
    },
  );

  app.delete<{ Params: { id: string } }>('/api/comments/:id', async (req, reply) => {
    requireUser(req);
    const existing = getCommentById(req.params.id);
    if (!existing) return reply.code(404).send({ error: 'Comment not found', code: 'NOT_FOUND' });
    deleteComment(existing.id);
    hub.broadcast(existing.boardId, {
      type: 'comment.deleted',
      commentId: existing.id,
    });
    return reply.send({ ok: true } satisfies SuccessResponse);
  });
}
