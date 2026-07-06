import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type {
  CreateWalkthroughRequest,
  CreateWalkthroughResponse,
  GetWalkthroughResponse,
  ListWalkthroughsResponse,
  RenderTakeRequest,
  RenderTakeResponse,
  Take,
  UpdateWalkthroughRequest,
  WalkthroughStep,
  WalkthroughStepInput,
} from '@foldo/protocol';
import { requireUser } from '../auth.ts';
import {
  getWalkthroughById,
  insertWalkthrough,
  listTakesForWalkthrough,
  listWalkthroughsForBoard,
  updateWalkthrough,
  type TakeRecord,
} from '../repo/walkthroughs.ts';
import { enqueueTake } from '../director/service.ts';
import {
  DEFAULT_STEP_DURATION_MS,
  validateWalkthroughSteps,
} from '../director/models.ts';
import { getStorage } from '../storage/index.ts';
import { newId } from '../util.ts';

function toSteps(inputs: WalkthroughStepInput[] | undefined): WalkthroughStep[] {
  return (inputs ?? []).map((s, i) => ({
    id: s.id ?? `step_${i + 1}_${newId('s').slice(-6).toLowerCase()}`,
    title: s.title,
    narration: s.narration,
    actions: s.actions,
    durationMs: s.durationMs ?? DEFAULT_STEP_DURATION_MS,
  }));
}

/** Strip internal storage keys / step history off the wire Take. */
function toWireTake(t: TakeRecord): Take {
  const { videoKey: _v, posterKey: _p, captionsKey: _c, steps: _s, ...wire } = t;
  return wire;
}

/** Parse a single-range `bytes=start-end` header against a known size. */
function parseRange(
  header: string | undefined,
  size: number,
): { start: number; end: number } | null {
  if (!header) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match) return null;
  const [, rawStart, rawEnd] = match;
  let start: number;
  let end: number;
  if (rawStart === '') {
    const suffix = Number(rawEnd);
    if (!Number.isFinite(suffix) || suffix <= 0) return null;
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    start = Number(rawStart);
    end = rawEnd === '' ? size - 1 : Number(rawEnd);
  }
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  if (start < 0 || end < start || start >= size) return null;
  if (end >= size) end = size - 1;
  return { start, end };
}

export async function registerWalkthroughRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Params: { boardId: string } }>(
    '/api/boards/:boardId/walkthroughs',
    async (req, reply) => {
      requireUser(req);
      await app.requireMember(req, req.params.boardId);
      const walkthroughs = await listWalkthroughsForBoard(req.params.boardId);
      const res: ListWalkthroughsResponse = { walkthroughs };
      return reply.send(res);
    },
  );

  app.post<{ Body: CreateWalkthroughRequest }>('/api/walkthroughs', async (req, reply) => {
    requireUser(req);
    const body = req.body;
    if (!body?.boardId || !body?.title?.trim() || !body?.targetUrl?.trim()) {
      return reply
        .code(400)
        .send({ error: 'boardId, title and targetUrl are required', code: 'BAD_REQUEST' });
    }
    await app.requireEditor(req, body.boardId);
    let steps: WalkthroughStep[];
    try {
      steps = toSteps(body.steps);
      if (steps.length) validateWalkthroughSteps(steps);
    } catch (err) {
      return reply
        .code(400)
        .send({ error: String(err instanceof Error ? err.message : err), code: 'BAD_REQUEST' });
    }
    const walkthrough = await insertWalkthrough({
      id: newId('w'),
      boardId: body.boardId,
      title: body.title.trim(),
      targetUrl: body.targetUrl.trim(),
      steps,
      authActions: body.authActions,
    });
    const res: CreateWalkthroughResponse = { walkthrough };
    return reply.send(res);
  });

  app.get<{ Params: { id: string } }>('/api/walkthroughs/:id', async (req, reply) => {
    requireUser(req);
    const walkthrough = await getWalkthroughById(req.params.id);
    if (!walkthrough)
      return reply.code(404).send({ error: 'Walkthrough not found', code: 'NOT_FOUND' });
    await app.requireMember(req, walkthrough.boardId);
    const takes = (await listTakesForWalkthrough(walkthrough.id)).map(toWireTake);
    const res: GetWalkthroughResponse = { walkthrough, takes };
    return reply.send(res);
  });

  app.patch<{ Params: { id: string }; Body: UpdateWalkthroughRequest }>(
    '/api/walkthroughs/:id',
    async (req, reply) => {
      requireUser(req);
      const walkthrough = await getWalkthroughById(req.params.id);
      if (!walkthrough)
        return reply.code(404).send({ error: 'Walkthrough not found', code: 'NOT_FOUND' });
      await app.requireEditor(req, walkthrough.boardId);
      let steps: WalkthroughStep[] | undefined;
      try {
        if (req.body?.steps) {
          steps = toSteps(req.body.steps);
          validateWalkthroughSteps(steps);
        }
      } catch (err) {
        return reply
          .code(400)
          .send({ error: String(err instanceof Error ? err.message : err), code: 'BAD_REQUEST' });
      }
      const next = await updateWalkthrough(walkthrough.id, {
        title: req.body?.title,
        targetUrl: req.body?.targetUrl,
        steps,
        authActions: req.body?.authActions,
      });
      return reply.send({ walkthrough: next });
    },
  );

  // Manual render — the same path a merged PR takes. Used for the first take
  // (nothing has merged yet) and for retries after an error/degraded take.
  app.post<{ Params: { id: string }; Body: RenderTakeRequest }>(
    '/api/walkthroughs/:id/takes',
    async (req, reply) => {
      requireUser(req);
      const walkthrough = await getWalkthroughById(req.params.id);
      if (!walkthrough)
        return reply.code(404).send({ error: 'Walkthrough not found', code: 'NOT_FOUND' });
      await app.requireEditor(req, walkthrough.boardId);
      if (!walkthrough.steps.length) {
        return reply.code(400).send({
          error: 'Walkthrough has no steps yet — add steps before rendering',
          code: 'BAD_REQUEST',
        });
      }
      const take = await enqueueTake(walkthrough.id, {
        prNumber: req.body?.prNumber,
        prTitle: req.body?.prTitle,
        diff: req.body?.diff,
        summary: req.body?.summary,
      });
      if (!take) return reply.code(404).send({ error: 'Walkthrough not found', code: 'NOT_FOUND' });
      const res: RenderTakeResponse = { take: toWireTake(take) };
      return reply.send(res);
    },
  );

  // Rendered artifacts (master.mp4 / poster.png / captions.vtt / segments).
  // Public like recordings: keys are unguessable (nanoid take ids) and the
  // share viewer + board <video> tags need plain URLs. Range-aware locally,
  // presign-redirect on S3 — same contract as /api/recordings/*.
  app.get<{ Params: { '*': string } }>(
    '/api/walkthroughs/files/*',
    async (req: FastifyRequest<{ Params: { '*': string } }>, reply: FastifyReply) => {
      const key = decodeURIComponent(req.params['*'] ?? '');
      if (!key.startsWith('walkthroughs/') || key.includes('..')) {
        return reply.code(400).send({ error: 'Bad walkthrough key', code: 'BAD_REQUEST' });
      }
      const storage = getStorage();
      if (storage.signedUrl) {
        const url = await storage.signedUrl(key);
        if (url) {
          return reply.header('Cache-Control', 'private, max-age=300').redirect(url, 302);
        }
      }
      const obj = await storage.get(key);
      if (!obj) {
        return reply.code(404).send({ error: 'Not found', code: 'NOT_FOUND' });
      }
      const total = obj.body.length;
      const range = parseRange(
        Array.isArray(req.headers.range) ? req.headers.range[0] : req.headers.range,
        total,
      );
      reply
        .header('Content-Type', obj.contentType)
        .header('Cache-Control', 'public, max-age=3600')
        .header('Accept-Ranges', 'bytes');
      if (range) {
        const { start, end } = range;
        const chunk = obj.body.subarray(start, end + 1);
        return reply
          .code(206)
          .header('Content-Range', `bytes ${start}-${end}/${total}`)
          .header('Content-Length', String(chunk.length))
          .send(chunk);
      }
      return reply.header('Content-Length', String(total)).send(obj.body);
    },
  );
}
