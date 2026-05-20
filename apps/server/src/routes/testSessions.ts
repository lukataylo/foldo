import type { FastifyInstance, FastifyRequest } from 'fastify';
import { Transform, type Readable } from 'node:stream';
import type {
  AbandonTestSessionRequest,
  CompleteTestSessionRequest,
  CompleteTestSessionResponse,
  RecordingMode,
  StartTestSessionRequest,
  StartTestSessionResponse,
  Test,
  TestResponseAnswer,
  TestSession,
  TestTaskResult,
  UploadRecordingResponse,
} from '@foldo/protocol';
import { getTestByShareToken, sessionCountsForTest } from '../repo/tests.ts';
import {
  abandonSession,
  completeSession,
  createSession,
  saveRecording,
  verifySession,
} from '../repo/testSessions.ts';
import { getStorage } from '../storage/index.ts';
import { hub } from '../ws/hub.ts';
import { rateLimitPreHandler } from '../rateLimit.ts';
import { createSessionFrame, ensureSummaryFrame } from '../sessionFrames.ts';
import { enqueueTranscription } from '../transcription/index.ts';

const RECORDING_MODES: RecordingMode[] = [
  'screen_voice',
  'voice_only',
  'screen_only',
];
const TASK_OUTCOMES: TestTaskResult['outcome'][] = [
  'completed',
  'skipped',
  'gave_up',
];

const SESSION_HEADER = 'x-foldo-session-token';

/**
 * Hard cap on a single recording upload. The body is streamed straight to
 * blob storage, so this only bounds the size of a stored object — peak
 * memory per request is now O(chunk), not O(file).
 */
const MAX_RECORDING_BYTES = 64 * 1024 * 1024; // 64 MB

/** Marker error so the route can map an over-limit stream to a 413. */
class RecordingTooLargeError extends Error {
  constructor() {
    super('Recording exceeds the maximum allowed size');
    this.name = 'RecordingTooLargeError';
  }
}

/**
 * A Transform that passes bytes through but aborts the stream with a
 * `RecordingTooLargeError` the moment the running total exceeds `max`.
 * Lets the route enforce the cap on chunked uploads (no Content-Length)
 * without ever buffering the whole body.
 */
function byteLimitStream(max: number): Transform {
  let total = 0;
  return new Transform({
    transform(chunk: Buffer, _enc, cb) {
      total += chunk.length;
      if (total > max) {
        cb(new RecordingTooLargeError());
        return;
      }
      cb(null, chunk);
    },
  });
}

/** Load a test by its share token, but only if it's currently runnable. */
async function loadLiveTest(token: string): Promise<Test | null> {
  const test = await getTestByShareToken(token);
  if (!test || test.status !== 'live') return null;
  return test;
}

function sessionTokenFrom(req: FastifyRequest): string | null {
  const h = req.headers[SESSION_HEADER];
  if (!h || Array.isArray(h)) return null;
  return h.trim() || null;
}

function sanitizeTaskResults(raw: unknown): TestTaskResult[] | null {
  if (!Array.isArray(raw)) return null;
  const out: TestTaskResult[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') return null;
    const r = item as Record<string, unknown>;
    const taskId = String(r.taskId ?? '').trim();
    const outcome = r.outcome as TestTaskResult['outcome'];
    if (!taskId || !TASK_OUTCOMES.includes(outcome)) return null;
    const durationMs = Number(r.durationMs ?? 0);
    const recordingOffsetMs = Number(r.recordingOffsetMs ?? 0);
    if (!Number.isFinite(durationMs) || !Number.isFinite(recordingOffsetMs)) {
      return null;
    }
    out.push({
      taskId,
      outcome,
      durationMs: Math.max(0, durationMs),
      recordingOffsetMs: Math.max(0, recordingOffsetMs),
    });
  }
  return out;
}

/** undefined = not supplied (leave as-is), null = malformed, array = valid. */
function sanitizeResponses(
  raw: unknown,
): TestResponseAnswer[] | null | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (!Array.isArray(raw)) return null;
  const out: TestResponseAnswer[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') return null;
    const r = item as Record<string, unknown>;
    const questionId = String(r.questionId ?? '').trim();
    if (!questionId) return null;
    if (typeof r.value === 'string') {
      out.push({ questionId, value: r.value });
    } else if (Array.isArray(r.value)) {
      out.push({ questionId, value: r.value.map((v) => String(v)) });
    } else {
      return null;
    }
  }
  return out;
}

export async function registerTestSessionRoutes(
  app: FastifyInstance,
): Promise<void> {
  // ---- Start a session (public, no auth) ----
  app.post<{
    Params: { token: string };
    Body: StartTestSessionRequest;
  }>(
    '/api/t/:token/sessions',
    { preHandler: rateLimitPreHandler('test-session-start', 10, 60_000) },
    async (req, reply) => {
    const test = await loadLiveTest(req.params.token);
    if (!test) {
      return reply
        .code(404)
        .send({ error: 'Test not found', code: 'NOT_FOUND' });
    }
    if (test.responseLimit !== undefined) {
      const counts = await sessionCountsForTest(test.id);
      if (counts.completed >= test.responseLimit) {
        return reply.code(410).send({
          error: 'This test has reached its response limit',
          code: 'TEST_CLOSED',
        });
      }
    }

    const body = req.body ?? ({} as StartTestSessionRequest);
    const recordingMode = body.recordingMode;
    if (!RECORDING_MODES.includes(recordingMode)) {
      return reply
        .code(400)
        .send({ error: 'Invalid recordingMode', code: 'BAD_REQUEST' });
    }
    if (!test.recordingModes.includes(recordingMode)) {
      return reply.code(400).send({
        error: 'That recording mode is not allowed for this test',
        code: 'BAD_REQUEST',
      });
    }

    const { session, sessionToken } = await createSession({
      testId: test.id,
      recordingMode,
      testerLabel:
        typeof body.testerLabel === 'string' ? body.testerLabel : undefined,
      testerMeta:
        body.testerMeta && typeof body.testerMeta === 'object'
          ? body.testerMeta
          : undefined,
    });

    hub.broadcast(test.boardId, {
      type: 'test.session.started',
      testId: test.id,
      sessionId: session.id,
    });

    return reply.code(201).send({
      sessionId: session.id,
      sessionToken,
      testerLabel: session.testerLabel,
    } satisfies StartTestSessionResponse);
  });

  // ---- Upload the recording (raw binary body, streamed to storage) ----
  app.post<{
    Params: { token: string; id: string };
    Querystring: { durationMs?: string };
    Body: Readable;
  }>(
    '/api/t/:token/sessions/:id/recording',
    { preHandler: rateLimitPreHandler('test-session-recording', 20, 60_000) },
    async (req, reply) => {
      const test = await loadLiveTest(req.params.token);
      if (!test) {
        return reply
          .code(404)
          .send({ error: 'Test not found', code: 'NOT_FOUND' });
      }
      const token = sessionTokenFrom(req);
      if (!token) {
        return reply
          .code(401)
          .send({ error: 'Missing session token', code: 'UNAUTHORIZED' });
      }
      const session = await verifySession(req.params.id, test.id, token);
      if (!session) {
        return reply
          .code(404)
          .send({ error: 'Session not found', code: 'NOT_FOUND' });
      }

      // Reject oversized uploads up-front via Content-Length when present,
      // so a stream that lies in its header is rejected before any I/O.
      const declaredLength = Number(req.headers['content-length'] ?? 0);
      if (Number.isFinite(declaredLength) && declaredLength > MAX_RECORDING_BYTES) {
        return reply.code(413).send({
          error: 'Recording exceeds the maximum allowed size',
          code: 'PAYLOAD_TOO_LARGE',
        });
      }

      const body = req.body;
      if (!body || typeof body.pipe !== 'function') {
        return reply.code(400).send({
          error: 'Recording body must be a binary stream',
          code: 'BAD_REQUEST',
        });
      }

      const durationMs = Math.max(
        0,
        Math.round(Number(req.query.durationMs ?? 0)),
      );
      const key = `recordings/${test.id}/${session.id}.webm`;

      // Stream the body straight to storage, enforcing the cap as bytes
      // flow — chunked uploads have no Content-Length to trust.
      let stored;
      try {
        const limited = body.pipe(byteLimitStream(MAX_RECORDING_BYTES));
        stored = await getStorage().putStream(key, limited, 'video/webm');
      } catch (err) {
        if (err instanceof RecordingTooLargeError) {
          // Best-effort: drop the partial object so storage isn't littered.
          await getStorage()
            .remove(key)
            .catch(() => undefined);
          return reply.code(413).send({
            error: 'Recording exceeds the maximum allowed size',
            code: 'PAYLOAD_TOO_LARGE',
          });
        }
        throw err;
      }
      if (stored.size === 0) {
        await getStorage()
          .remove(key)
          .catch(() => undefined);
        return reply.code(400).send({
          error: 'Recording body must be non-empty binary data',
          code: 'BAD_REQUEST',
        });
      }
      await saveRecording(session.id, key, durationMs);

      return reply.send({
        ok: true,
        recordingDurationMs: durationMs,
      } satisfies UploadRecordingResponse);
    },
  );

  // ---- Abandon a session (tab-close recovery, often via sendBeacon) ----
  app.post<{
    Params: { token: string; id: string };
    Body: AbandonTestSessionRequest;
  }>('/api/t/:token/sessions/:id/abandon', async (req, reply) => {
    // sendBeacon ignores responses, so this endpoint is deliberately quiet:
    // it always 200s, never throws, and only mutates when the token checks
    // out. Worst case a bad call is a silent no-op.
    const test = await getTestByShareToken(req.params.token);
    if (!test) return reply.send({ ok: true });

    const bodyToken =
      typeof req.body?.sessionToken === 'string'
        ? req.body.sessionToken.trim()
        : '';
    if (!bodyToken) return reply.send({ ok: true });

    const session = await verifySession(req.params.id, test.id, bodyToken);
    if (!session) return reply.send({ ok: true });

    // Idempotent — abandonSession leaves already-completed sessions alone.
    await abandonSession(session.id);
    return reply.send({ ok: true });
  });

  // ---- Complete a session ----
  app.post<{
    Params: { token: string; id: string };
    Body: CompleteTestSessionRequest;
  }>('/api/t/:token/sessions/:id/complete', async (req, reply) => {
    const test = await loadLiveTest(req.params.token);
    if (!test) {
      return reply
        .code(404)
        .send({ error: 'Test not found', code: 'NOT_FOUND' });
    }
    const token = sessionTokenFrom(req);
    if (!token) {
      return reply
        .code(401)
        .send({ error: 'Missing session token', code: 'UNAUTHORIZED' });
    }
    const session = await verifySession(req.params.id, test.id, token);
    if (!session) {
      return reply
        .code(404)
        .send({ error: 'Session not found', code: 'NOT_FOUND' });
    }

    const taskResults = sanitizeTaskResults(req.body?.taskResults ?? []);
    if (!taskResults) {
      return reply
        .code(400)
        .send({ error: 'Invalid taskResults', code: 'BAD_REQUEST' });
    }
    const responses = sanitizeResponses(req.body?.responses);
    if (responses === null) {
      return reply
        .code(400)
        .send({ error: 'Invalid responses', code: 'BAD_REQUEST' });
    }
    const recordingDurationMs =
      req.body?.recordingDurationMs !== undefined
        ? Math.max(0, Number(req.body.recordingDurationMs))
        : undefined;

    const completed = await completeSession(session.id, {
      taskResults,
      responses: responses ?? undefined,
      recordingDurationMs: Number.isFinite(recordingDurationMs ?? NaN)
        ? recordingDurationMs
        : undefined,
    });
    if (!completed) {
      return reply
        .code(404)
        .send({ error: 'Session not found', code: 'NOT_FOUND' });
    }

    hub.broadcast(test.boardId, {
      type: 'test.session.completed',
      testId: test.id,
      session: completed satisfies TestSession,
    });

    // Land the result on the canvas: a `test_session` frame under the test's
    // `test_summary` hub frame, then kick off the async transcription job
    // (which chains into AI synthesis). Each of those refreshes the frame in
    // place as it finishes. Failures here must not fail the tester's request —
    // they've done their part — so log and move on.
    try {
      await ensureSummaryFrame(test.id);
      await createSessionFrame(completed);
      enqueueTranscription(completed.id);
    } catch (err) {
      req.log.error(
        { err, sessionId: completed.id },
        'failed to publish test session frame',
      );
    }

    return reply.send({
      session: completed,
    } satisfies CompleteTestSessionResponse);
  });
}
