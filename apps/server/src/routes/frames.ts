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
import { getBoardById } from '../repo/boards.ts';
import { upsertSource } from '../repo/sources.ts';
import { hub } from '../ws/hub.ts';
import { withTransaction } from '../db.ts';
import { newId, nowIso } from '../util.ts';

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
 * timestamp. Untouched lines keep their existing attribution. Sparse object —
 * only edited lines carry an entry.
 *
 * Returns a new MarkdownFrameContent with `lineAuthors`, `lastEditedAt`, and
 * `lastEditedBy` set. Body / docPath / title / kind passed through.
 *
 * Exported for unit tests in `__tests__/stampMarkdownAuthorship.test.ts`.
 */
export function stampMarkdownAuthorship(
  prev: MarkdownFrameContent,
  next: MarkdownFrameContent,
  editorUserId: string,
  nowFn: () => string = nowIso,
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
  const ts = nowFn();

  for (let i = 0; i < nextLines.length; i++) {
    const before = prevLines[i];
    const after = nextLines[i];
    if (before !== after) {
      lineAuthors[String(i)] = { authorUserId: editorUserId, editedAt: ts };
    } else {
      const prev = prevAuthors[String(i)];
      if (prev) lineAuthors[String(i)] = prev;
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
      // Wrap the frame update + the sources mirror in a single transaction so
      // a failure between them can't leave the two tables drifted (this is the
      // bug class behind the "save doesn't save" issue: frames.content_json
      // and sources.body must stay in lock-step for markdown).
      const patchedMd =
        body.content?.kind === 'markdown' ? body.content : undefined;
      const board = patchedMd ? await getBoardById(existing.boardId) : null;
      const next = await withTransaction(async (tx) => {
        const updated = await updateFrame(
          req.params.id,
          {
            position: body.position,
            size: body.size,
            content: merged,
          },
          tx,
        );
        if (!updated) return null;
        if (
          updated.content.kind === 'markdown' &&
          existing.content.kind === 'markdown' &&
          typeof patchedMd?.body === 'string' &&
          patchedMd.body !== existing.content.body &&
          board
        ) {
          await upsertSource(
            {
              repoSlug: board.repoSlug,
              commitSha: updated.commitSha,
              path: updated.content.docPath,
              body: updated.content.body ?? '',
              contentType: 'markdown',
              updatedAt: nowIso(),
            },
            tx,
          );
        }
        return updated;
      });
      if (!next) return reply.code(404).send({ error: 'Frame not found', code: 'NOT_FOUND' });
      // Broadcast AFTER commit — never tell other clients about a write that
      // might roll back.
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
      // A+ W1: validate + clamp coordinates server-side. Without this, a
      // misbehaving client (or a fuzzer) can ship NaN/Infinity, which the DB
      // CHECK `frames_position_finite` rejects with a 500-grade error, or
      // ship coordinates so far off-canvas the frame becomes unreachable
      // through the UI. We clamp to [-CANVAS_RANGE, +CANVAS_RANGE] and
      // return the *actual* persisted frame so the client picks up the
      // coercion immediately.
      const { x, y } = body.position;
      if (!Number.isFinite(x) || !Number.isFinite(y)) {
        return reply.code(400).send({
          error: 'position.x and position.y must be finite numbers',
          code: 'BAD_REQUEST',
        });
      }
      const CANVAS_RANGE = 100_000;
      const clampedX = Math.max(-CANVAS_RANGE, Math.min(CANVAS_RANGE, x));
      const clampedY = Math.max(-CANVAS_RANGE, Math.min(CANVAS_RANGE, y));
      const existing = await getFrameById(req.params.id);
      if (!existing) return reply.code(404).send({ error: 'Frame not found', code: 'NOT_FOUND' });
      await requireEditor(me.id, existing.boardId);
      const next = await moveFrame(req.params.id, { x: clampedX, y: clampedY });
      if (!next) return reply.code(404).send({ error: 'Frame not found', code: 'NOT_FOUND' });
      hub.broadcast(next.boardId, {
        type: 'frame.moved',
        frameId: next.id,
        x: next.position.x,
        y: next.position.y,
      });
      // Return the updated frame so the client sees the persisted (possibly
      // clamped) coordinates instead of the values it sent.
      return reply.send(next);
    },
  );

  app.delete<{ Params: { id: string } }>('/api/frames/:id', async (req, reply) => {
    const me = requireUser(req);
    const existing = await getFrameById(req.params.id);
    if (!existing) return reply.code(404).send({ error: 'Frame not found', code: 'NOT_FOUND' });
    await requireEditor(me.id, existing.boardId);
    await deleteFrame(existing.id);
    hub.broadcast(existing.boardId, { type: 'frame.deleted', frameId: existing.id });
    return reply.send({ ok: true } satisfies SuccessResponse);
  });
}
