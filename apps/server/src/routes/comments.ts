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
import { canEditBoard, isMember } from '../repo/members.ts';
import { hub } from '../ws/hub.ts';
import { newId, nowIso } from '../util.ts';

async function requireEditor(userId: string, boardId: string): Promise<void> {
  if (!(await canEditBoard(boardId, userId))) {
    const err = new Error('Not a member of this board') as Error & {
      statusCode?: number;
    };
    err.statusCode = 403;
    throw err;
  }
}

async function requireMember(userId: string, boardId: string): Promise<void> {
  if (!(await isMember(boardId, userId))) {
    const err = new Error('Not a member of this board') as Error & {
      statusCode?: number;
    };
    err.statusCode = 403;
    throw err;
  }
}

export async function registerCommentRoutes(app: FastifyInstance): Promise<void> {
  app.post<{ Body: CreateCommentRequest }>('/api/comments', {
    config: { rateLimit: { max: 60, timeWindow: '1 minute' } },
  }, async (req, reply) => {
    const user = requireUser(req);
    const body = req.body;
    // `text` may be empty when the client opens a fresh drop-pin in compose
    // mode — the actual body lands via the subsequent PATCH. Require the
    // field to be a string but allow ''.
    if (!body?.boardId || !body?.frameId || typeof body?.text !== 'string') {
      return reply.code(400).send({ error: 'Invalid comment body', code: 'BAD_REQUEST' });
    }
    // Comments require membership; even viewers can leave them in this MVP.
    await requireMember(user.id, body.boardId);
    const comment = await insertComment({
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
      const existing = await getCommentById(req.params.id);
      if (!existing) return reply.code(404).send({ error: 'Comment not found', code: 'NOT_FOUND' });
      // Either the author or any editor may edit/resolve.
      if (existing.authorUserId !== user.id && !(await canEditBoard(existing.boardId, user.id))) {
        return reply.code(403).send({ error: 'Forbidden', code: 'FORBIDDEN' });
      }
      const next = await updateComment(req.params.id, {
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
      const existing = await getCommentById(req.params.id);
      if (!existing) return reply.code(404).send({ error: 'Comment not found', code: 'NOT_FOUND' });
      await requireMember(user.id, existing.boardId);
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
      const updated = await addReply(existing.id, replyObj);
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
    const user = requireUser(req);
    const existing = await getCommentById(req.params.id);
    if (!existing) return reply.code(404).send({ error: 'Comment not found', code: 'NOT_FOUND' });
    // Author or any editor.
    if (existing.authorUserId !== user.id && !(await canEditBoard(existing.boardId, user.id))) {
      return reply.code(403).send({ error: 'Forbidden', code: 'FORBIDDEN' });
    }
    await deleteComment(existing.id);
    hub.broadcast(existing.boardId, {
      type: 'comment.deleted',
      commentId: existing.id,
    });
    return reply.send({ ok: true } satisfies SuccessResponse);
  });
}
