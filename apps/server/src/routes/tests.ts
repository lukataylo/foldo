import type { FastifyInstance } from 'fastify';
import type {
  CreateTestRequest,
  CreateTestResponse,
  DuplicateTestResponse,
  GetTestResponse,
  ListTestSessionsResponse,
  ListTestsResponse,
  PublicTestResponse,
  RecordingMode,
  ReplaceTestTasksRequest,
  Test,
  TestDeliveryMode,
  TestQuestion,
  TestQuestionKind,
  TestTargetMode,
  TestTaskInput,
  UpdateTestRequest,
} from '@foldo/protocol';
import { requireUser } from '../auth.ts';
import { getBoardById } from '../repo/boards.ts';
import { canEditBoard, isMember } from '../repo/members.ts';
import {
  createTest,
  deleteTest,
  duplicateTest,
  getTestById,
  getTestByShareToken,
  listTasksForTest,
  listTestsForBoard,
  replaceTasks,
  sessionCountsForTest,
  updateTest,
} from '../repo/tests.ts';
import { listSessionsForTest } from '../repo/testSessions.ts';
import { probeFrameable } from '../probe.ts';
import { hub } from '../ws/hub.ts';

const RECORDING_MODES: RecordingMode[] = [
  'screen_voice',
  'voice_only',
  'screen_only',
];
const TARGET_MODES: TestTargetMode[] = [
  'auto',
  'iframe',
  'handoff',
  'dom_snapshot',
];
const QUESTION_KINDS: TestQuestionKind[] = [
  'short_text',
  'long_text',
  'single_choice',
  'multi_choice',
  'rating',
];

function publicWebOrigin(): string {
  return process.env.FOLDO_PUBLIC_WEB_ORIGIN ?? 'http://localhost:5173';
}

function testShareUrl(token: string): string {
  return `${publicWebOrigin()}/t/${token}`;
}

function isAbsoluteUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

/** Pick the concrete delivery mode a tester should get for this test. */
function resolveDeliveryMode(test: Test): TestDeliveryMode {
  if (test.targetMode === 'dom_snapshot') return 'dom_snapshot';
  if (test.targetMode === 'iframe') return 'iframe';
  if (test.targetMode === 'handoff') return 'handoff';
  // 'auto' , no target URL means there's nothing to reach but a snapshot;
  // otherwise let the cached probe result decide.
  if (!test.targetUrl) return 'dom_snapshot';
  return test.frameable === true ? 'iframe' : 'handoff';
}

function sanitizeRecordingModes(raw: unknown): RecordingMode[] | null {
  if (raw === undefined) return ['screen_voice', 'voice_only'];
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const out: RecordingMode[] = [];
  for (const m of raw) {
    if (!RECORDING_MODES.includes(m as RecordingMode)) return null;
    if (!out.includes(m as RecordingMode)) out.push(m as RecordingMode);
  }
  return out;
}

function sanitizeQuestionnaire(raw: unknown): TestQuestion[] | null | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (!Array.isArray(raw)) return null;
  const out: TestQuestion[] = [];
  for (const q of raw) {
    if (!q || typeof q !== 'object') return null;
    const item = q as Record<string, unknown>;
    const id = String(item.id ?? '').trim();
    const prompt = String(item.prompt ?? '').trim();
    const kind = item.kind as TestQuestionKind;
    if (!id || !prompt || !QUESTION_KINDS.includes(kind)) return null;
    const choices = Array.isArray(item.choices)
      ? item.choices.map((c) => String(c))
      : undefined;
    out.push({ id, prompt, kind, choices, required: Boolean(item.required) });
  }
  return out;
}

function sanitizeTasks(raw: unknown): TestTaskInput[] | null {
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) return null;
  const out: TestTaskInput[] = [];
  for (const t of raw) {
    if (!t || typeof t !== 'object') return null;
    const item = t as Record<string, unknown>;
    const title = String(item.title ?? '').trim();
    const instruction = String(item.instruction ?? '').trim();
    if (!title || !instruction) return null;
    out.push({
      title,
      instruction,
      successHint: item.successHint
        ? String(item.successHint).trim()
        : undefined,
      startUrl: item.startUrl ? String(item.startUrl).trim() : undefined,
      startRecipe: Array.isArray(item.startRecipe)
        ? (item.startRecipe as TestTaskInput['startRecipe'])
        : undefined,
    });
  }
  return out;
}

export async function registerTestRoutes(app: FastifyInstance): Promise<void> {
  // ---- Create a test ----
  app.post<{ Body: CreateTestRequest }>('/api/tests', async (req, reply) => {
    const user = requireUser(req);
    const body = req.body ?? ({} as CreateTestRequest);

    const name = (body.name ?? '').trim();
    if (!body.boardId || !name) {
      return reply
        .code(400)
        .send({ error: 'boardId and name are required', code: 'BAD_REQUEST' });
    }

    const board = await getBoardById(body.boardId);
    if (!board || !(await canEditBoard(board.id, user.id))) {
      return reply
        .code(404)
        .send({ error: 'Board not found', code: 'NOT_FOUND' });
    }

    const targetMode: TestTargetMode = body.targetMode ?? 'auto';
    if (!TARGET_MODES.includes(targetMode)) {
      return reply
        .code(400)
        .send({ error: 'Invalid targetMode', code: 'BAD_REQUEST' });
    }

    const targetUrl = (body.targetUrl ?? '').trim() || undefined;
    if (targetMode !== 'dom_snapshot') {
      if (!targetUrl) {
        return reply.code(400).send({
          error: 'targetUrl is required unless targetMode is dom_snapshot',
          code: 'BAD_REQUEST',
        });
      }
      if (!isAbsoluteUrl(targetUrl)) {
        return reply.code(400).send({
          error: 'targetUrl must be an absolute http(s) URL',
          code: 'BAD_REQUEST',
        });
      }
    }

    const recordingModes = sanitizeRecordingModes(body.recordingModes);
    if (!recordingModes) {
      return reply
        .code(400)
        .send({ error: 'Invalid recordingModes', code: 'BAD_REQUEST' });
    }

    const questionnaire = sanitizeQuestionnaire(body.questionnaire);
    if (questionnaire === null) {
      return reply
        .code(400)
        .send({ error: 'Invalid questionnaire', code: 'BAD_REQUEST' });
    }

    const tasks = sanitizeTasks(body.tasks);
    if (!tasks) {
      return reply
        .code(400)
        .send({ error: 'Invalid tasks', code: 'BAD_REQUEST' });
    }

    let responseLimit: number | undefined;
    if (body.responseLimit !== undefined && body.responseLimit !== null) {
      const n = Number(body.responseLimit);
      if (!Number.isInteger(n) || n < 1) {
        return reply.code(400).send({
          error: 'responseLimit must be a positive integer',
          code: 'BAD_REQUEST',
        });
      }
      responseLimit = n;
    }

    // Probe frameability up-front for auto/iframe so the public endpoint can
    // resolve a delivery mode without a per-request network call.
    let frameable: boolean | null = null;
    if (targetUrl && (targetMode === 'auto' || targetMode === 'iframe')) {
      frameable = await probeFrameable(targetUrl);
    }

    const test = await createTest({
      boardId: board.id,
      name,
      targetUrl,
      targetMode,
      frameable,
      intro: (body.intro ?? '').trim(),
      recordingModes,
      questionnaire,
      responseLimit,
      createdByUserId: user.id,
    });

    if (tasks.length > 0) await replaceTasks(test.id, tasks);

    hub.broadcast(board.id, { type: 'test.created', test });
    return reply.code(201).send({
      test,
      shareUrl: testShareUrl(test.shareToken),
    } satisfies CreateTestResponse);
  });

  // ---- List a board's tests ----
  app.get<{ Querystring: { boardId?: string } }>(
    '/api/tests',
    async (req, reply) => {
      const user = requireUser(req);
      const boardId = req.query.boardId;
      if (!boardId) {
        return reply
          .code(400)
          .send({ error: 'boardId query param required', code: 'BAD_REQUEST' });
      }
      if (!(await isMember(boardId, user.id))) {
        return reply
          .code(404)
          .send({ error: 'Board not found', code: 'NOT_FOUND' });
      }
      const rows = await listTestsForBoard(boardId);
      return reply.send({
        tests: rows.map((r) => ({ test: r.test, sessionCounts: r.counts })),
      } satisfies ListTestsResponse);
    },
  );

  // ---- Get one test + its tasks ----
  app.get<{ Params: { id: string } }>('/api/tests/:id', async (req, reply) => {
    const user = requireUser(req);
    const test = await getTestById(req.params.id);
    if (!test || !(await isMember(test.boardId, user.id))) {
      return reply
        .code(404)
        .send({ error: 'Test not found', code: 'NOT_FOUND' });
    }
    const tasks = await listTasksForTest(test.id);
    return reply.send({
      test,
      tasks,
      shareUrl: testShareUrl(test.shareToken),
    } satisfies GetTestResponse);
  });

  // ---- List a test's recorded sessions (creator side) ----
  app.get<{ Params: { id: string } }>(
    '/api/tests/:id/sessions',
    async (req, reply) => {
      const user = requireUser(req);
      const test = await getTestById(req.params.id);
      if (!test || !(await isMember(test.boardId, user.id))) {
        return reply
          .code(404)
          .send({ error: 'Test not found', code: 'NOT_FOUND' });
      }
      const sessions = await listSessionsForTest(test.id);
      return reply.send({ sessions } satisfies ListTestSessionsResponse);
    },
  );

  // ---- Update a test ----
  app.patch<{ Params: { id: string }; Body: UpdateTestRequest }>(
    '/api/tests/:id',
    async (req, reply) => {
      const user = requireUser(req);
      const test = await getTestById(req.params.id);
      if (!test || !(await canEditBoard(test.boardId, user.id))) {
        return reply
          .code(404)
          .send({ error: 'Test not found', code: 'NOT_FOUND' });
      }
      const body = req.body ?? {};
      const patch: Parameters<typeof updateTest>[1] = {};

      if (body.name !== undefined) {
        const name = body.name.trim();
        if (!name) {
          return reply
            .code(400)
            .send({ error: 'name cannot be empty', code: 'BAD_REQUEST' });
        }
        patch.name = name;
      }
      if (body.intro !== undefined) patch.intro = body.intro.trim();
      if (body.targetMode !== undefined) {
        if (!TARGET_MODES.includes(body.targetMode)) {
          return reply
            .code(400)
            .send({ error: 'Invalid targetMode', code: 'BAD_REQUEST' });
        }
        patch.targetMode = body.targetMode;
      }
      if (body.targetUrl !== undefined) {
        const url = body.targetUrl.trim();
        const mode = patch.targetMode ?? test.targetMode;
        if (url && !isAbsoluteUrl(url)) {
          return reply.code(400).send({
            error: 'targetUrl must be an absolute http(s) URL',
            code: 'BAD_REQUEST',
          });
        }
        patch.targetUrl = url;
        // Target changed , re-probe so the cached delivery decision stays honest.
        patch.frameable =
          url && (mode === 'auto' || mode === 'iframe')
            ? await probeFrameable(url)
            : null;
      }
      if (body.recordingModes !== undefined) {
        const modes = sanitizeRecordingModes(body.recordingModes);
        if (!modes) {
          return reply
            .code(400)
            .send({ error: 'Invalid recordingModes', code: 'BAD_REQUEST' });
        }
        patch.recordingModes = modes;
      }
      if (body.questionnaire !== undefined) {
        const q = sanitizeQuestionnaire(body.questionnaire);
        if (q === null) {
          return reply
            .code(400)
            .send({ error: 'Invalid questionnaire', code: 'BAD_REQUEST' });
        }
        patch.questionnaire = q;
      }
      if (body.responseLimit !== undefined) {
        if (body.responseLimit === null) {
          patch.responseLimit = null;
        } else {
          const n = Number(body.responseLimit);
          if (!Number.isInteger(n) || n < 1) {
            return reply.code(400).send({
              error: 'responseLimit must be a positive integer',
              code: 'BAD_REQUEST',
            });
          }
          patch.responseLimit = n;
        }
      }
      if (body.status !== undefined) {
        if (!['draft', 'live', 'closed'].includes(body.status)) {
          return reply
            .code(400)
            .send({ error: 'Invalid status', code: 'BAD_REQUEST' });
        }
        patch.status = body.status;
      }

      const next = await updateTest(test.id, patch);
      if (!next) {
        return reply
          .code(404)
          .send({ error: 'Test not found', code: 'NOT_FOUND' });
      }
      hub.broadcast(next.boardId, { type: 'test.updated', test: next });
      return reply.send({ test: next });
    },
  );

  // ---- Delete a test ----
  app.delete<{ Params: { id: string } }>(
    '/api/tests/:id',
    async (req, reply) => {
      const user = requireUser(req);
      const test = await getTestById(req.params.id);
      if (!test || !(await canEditBoard(test.boardId, user.id))) {
        return reply
          .code(404)
          .send({ error: 'Test not found', code: 'NOT_FOUND' });
      }
      await deleteTest(test.id);
      hub.broadcast(test.boardId, { type: 'test.deleted', testId: test.id });
      return reply.send({ ok: true });
    },
  );

  // ---- Duplicate a test ----
  app.post<{ Params: { id: string } }>(
    '/api/tests/:id/duplicate',
    async (req, reply) => {
      const user = requireUser(req);
      const test = await getTestById(req.params.id);
      if (!test || !(await canEditBoard(test.boardId, user.id))) {
        return reply
          .code(404)
          .send({ error: 'Test not found', code: 'NOT_FOUND' });
      }
      const copy = await duplicateTest(test.id, user.id);
      if (!copy) {
        return reply
          .code(404)
          .send({ error: 'Test not found', code: 'NOT_FOUND' });
      }
      hub.broadcast(copy.boardId, { type: 'test.created', test: copy });
      return reply.code(201).send({
        test: copy,
        shareUrl: testShareUrl(copy.shareToken),
      } satisfies DuplicateTestResponse);
    },
  );

  // ---- Replace a test's task list ----
  app.put<{ Params: { id: string }; Body: ReplaceTestTasksRequest }>(
    '/api/tests/:id/tasks',
    async (req, reply) => {
      const user = requireUser(req);
      const test = await getTestById(req.params.id);
      if (!test || !(await canEditBoard(test.boardId, user.id))) {
        return reply
          .code(404)
          .send({ error: 'Test not found', code: 'NOT_FOUND' });
      }
      const tasks = sanitizeTasks(req.body?.tasks);
      if (!tasks) {
        return reply
          .code(400)
          .send({ error: 'Invalid tasks', code: 'BAD_REQUEST' });
      }
      const created = await replaceTasks(test.id, tasks);
      const next = await getTestById(test.id);
      if (next) hub.broadcast(next.boardId, { type: 'test.updated', test: next });
      return reply.send({ tasks: created });
    },
  );

  // ---- Public, no auth: the test definition a tester runs ----
  app.get<{ Params: { token: string } }>(
    '/api/t/:token',
    async (req, reply) => {
      const test = await getTestByShareToken(req.params.token);
      if (!test || test.status !== 'live') {
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
      const tasks = await listTasksForTest(test.id);
      return reply.send({
        id: test.id,
        name: test.name,
        intro: test.intro,
        status: test.status,
        recordingModes: test.recordingModes,
        deliveryMode: resolveDeliveryMode(test),
        targetUrl: test.targetUrl,
        questionnaire: test.questionnaire,
        tasks,
      } satisfies PublicTestResponse);
    },
  );
}
