import type { FastifyInstance } from 'fastify';
import type {
  CreateFrameRequest,
  Frame,
  MoveFrameRequest,
  SuccessResponse,
  UpdateFrameRequest,
} from '@foldo/protocol';
import type { MarkdownFrameContent } from '@foldo/protocol';
import { requireUser } from '../auth.ts';
import {
  deleteFrame,
  getFrameById,
  insertFrame,
  moveFrame,
  updateFrame,
} from '../repo/frames.ts';
import { canEditBoard } from '../repo/members.ts';
import { getStorage } from '../storage/index.ts';
import { hub } from '../ws/hub.ts';
import { newId, nowIso } from '../util.ts';

/**
 * If a frame's content references a blob we own (an uploaded image), return
 * the storage key so the caller can delete it and avoid an orphan blob.
 * Returns null for frames whose content lives entirely in Postgres.
 */
function storageKeyForFrame(frame: Frame): string | null {
  const content = frame.content;
  if (content.kind === 'image' && typeof content.url === 'string') {
    const m = /^\/api\/uploads\/(.+)$/.exec(content.url);
    if (m) {
      const tail = decodeURIComponent(m[1]);
      if (tail && !tail.includes('..')) return `uploads/${tail}`;
    }
  }
  return null;
}

async function requireEditor(
  userId: string,
  boardId: string,
): Promise<void> {
  if (!(await canEditBoard(boardId, userId))) {
    const err = new Error('Not a member of this board') as Error & {
      statusCode?: number;
    };
    err.statusCode = 403;
    throw err;
  }
}

/**
 * Compute per-line authorship for a markdown frame. Lines whose text differs
 * from the previous version are stamped with `editorUserId` and the current
 * timestamp. Untouched lines keep their existing attribution. Sparse object
 *, only edited lines carry an entry.
 *
 * Returns a new MarkdownFrameContent with `lineAuthors`, `lastEditedAt`, and
 * `lastEditedBy` set. Body / docPath / title / kind passed through.
 */
function stampMarkdownAuthorship(
  prev: MarkdownFrameContent,
  next: MarkdownFrameContent,
  editorUserId: string,
): MarkdownFrameContent {
  const prevBody = prev.body ?? '';
  const nextBody = next.body ?? '';
  if (prevBody === nextBody) {
    return next;
  }
  const prevLines = prevBody.split('\n');
  const nextLines = nextBody.split('\n');
  const prevAuthors = next.lineAuthors ?? prev.lineAuthors ?? {};
  const lineAuthors: Record<string, { authorUserId: string; editedAt: string }> = {};
  const ts = nowIso();

  for (let i = 0; i < nextLines.length; i++) {
    const before = prevLines[i];
    const after = nextLines[i];
    if (before !== after) {
      lineAuthors[String(i)] = { authorUserId: editorUserId, editedAt: ts };
    } else if (prevAuthors[String(i)]) {
      lineAuthors[String(i)] = prevAuthors[String(i)];
    }
  }
  return {
    ...next,
    lineAuthors,
    lastEditedAt: ts,
    lastEditedBy: editorUserId,
  };
}

export async function registerFrameRoutes(app: FastifyInstance): Promise<void> {
  app.post<{ Body: CreateFrameRequest }>('/api/frames', async (req, reply) => {
    const me = requireUser(req);
    const body = req.body;
    if (!body || !body.boardId || !body.branchId || !body.content) {
      return reply.code(400).send({ error: 'Invalid frame body', code: 'BAD_REQUEST' });
    }
    await requireEditor(me.id, body.boardId);
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
    await insertFrame(frame);
    hub.broadcast(frame.boardId, { type: 'frame.added', frame });
    return reply.send(frame);
  });

  app.patch<{ Params: { id: string }; Body: UpdateFrameRequest }>(
    '/api/frames/:id',
    async (req, reply) => {
      const me = requireUser(req);
      const existing = await getFrameById(req.params.id);
      if (!existing) return reply.code(404).send({ error: 'Frame not found', code: 'NOT_FOUND' });
      await requireEditor(me.id, existing.boardId);
      const body = req.body ?? {};
      let merged: Frame['content'] | undefined;
      if (body.content) {
        merged = { ...existing.content, ...body.content } as Frame['content'];
        // For markdown frames: stamp authorship onto every line that changed.
        if (
          merged.kind === 'markdown' &&
          existing.content.kind === 'markdown' &&
          typeof merged.body === 'string'
        ) {
          merged = stampMarkdownAuthorship(
            existing.content,
            merged,
            me.id,
          ) as Frame['content'];
        }
      }
      const next = await updateFrame(req.params.id, {
        position: body.position,
        size: body.size,
        content: merged,
        z: body.z,
        hidden: body.hidden,
        locked: body.locked,
        style: body.style,
      });
      if (!next) return reply.code(404).send({ error: 'Frame not found', code: 'NOT_FOUND' });
      hub.broadcast(next.boardId, { type: 'frame.updated', frame: next });
      return reply.send(next);
    },
  );

  app.post<{ Params: { id: string }; Body: MoveFrameRequest }>(
    '/api/frames/:id/move',
    async (req, reply) => {
      const me = requireUser(req);
      const body = req.body;
      if (!body?.position) {
        return reply.code(400).send({ error: 'Missing position', code: 'BAD_REQUEST' });
      }
      const existing = await getFrameById(req.params.id);
      if (!existing) return reply.code(404).send({ error: 'Frame not found', code: 'NOT_FOUND' });
      await requireEditor(me.id, existing.boardId);
      const next = await moveFrame(req.params.id, body.position);
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
    const me = requireUser(req);
    const existing = await getFrameById(req.params.id);
    if (!existing) return reply.code(404).send({ error: 'Frame not found', code: 'NOT_FOUND' });
    await requireEditor(me.id, existing.boardId);
    await deleteFrame(existing.id);
    // Best-effort orphan-blob cleanup: an image frame owns its uploaded
    // bytes, so dropping the row would otherwise leak the storage object.
    const key = storageKeyForFrame(existing);
    if (key) {
      try {
        await getStorage().remove(key);
      } catch (err) {
        req.log.warn({ err, key }, 'failed to remove frame blob');
      }
    }
    hub.broadcast(existing.boardId, { type: 'frame.deleted', frameId: existing.id });
    return reply.send({ ok: true } satisfies SuccessResponse);
  });
}
