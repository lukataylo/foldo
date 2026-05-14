import { randomBytes } from 'node:crypto';
import type {
  RecipeStep,
  RecordingMode,
  Test,
  TestQuestion,
  TestSessionCounts,
  TestStatus,
  TestTargetMode,
  TestTask,
  TestTaskInput,
  TestTaskStat,
} from '@foldo/protocol';
import { exec, query, queryOne } from '../db.ts';
import { newId, nowIso, parseJson } from '../util.ts';

// ---------- rows ----------
interface TestRow {
  id: string;
  board_id: string;
  name: string;
  target_url: string | null;
  target_mode: string;
  frameable: boolean | null;
  dom_snapshot_key: string | null;
  intro: string;
  recording_modes_json: string;
  questionnaire_json: string | null;
  status: string;
  share_token: string;
  response_limit: number | null;
  summary_frame_id: string | null;
  created_by_user_id: string;
  created_at: string;
  updated_at: string;
}

interface TestTaskRow {
  id: string;
  test_id: string;
  order_index: number;
  title: string;
  instruction: string;
  success_hint: string | null;
  start_url: string | null;
  start_recipe_json: string | null;
}

const DEFAULT_RECORDING_MODES: RecordingMode[] = ['screen_voice', 'voice_only'];

function rowToTest(r: TestRow): Test {
  return {
    id: r.id,
    boardId: r.board_id,
    name: r.name,
    targetUrl: r.target_url ?? undefined,
    targetMode: r.target_mode as TestTargetMode,
    frameable: r.frameable ?? null,
    domSnapshotKey: r.dom_snapshot_key ?? undefined,
    intro: r.intro,
    recordingModes: parseJson<RecordingMode[]>(
      r.recording_modes_json,
      DEFAULT_RECORDING_MODES,
    ),
    questionnaire: r.questionnaire_json
      ? parseJson<TestQuestion[]>(r.questionnaire_json, [])
      : undefined,
    status: r.status as TestStatus,
    shareToken: r.share_token,
    responseLimit: r.response_limit ?? undefined,
    summaryFrameId: r.summary_frame_id ?? undefined,
    createdByUserId: r.created_by_user_id,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function rowToTask(r: TestTaskRow): TestTask {
  return {
    id: r.id,
    testId: r.test_id,
    orderIndex: r.order_index,
    title: r.title,
    instruction: r.instruction,
    successHint: r.success_hint ?? undefined,
    startUrl: r.start_url ?? undefined,
    startRecipe: r.start_recipe_json
      ? parseJson<RecipeStep[]>(r.start_recipe_json, [])
      : undefined,
  };
}

// Short, base62-ish token , mirrors board_shares so foldo.dev/t/<token>
// links stay short enough to drop into chat.
const TOKEN_ALPHABET =
  'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
function newTestToken(): string {
  const bytes = randomBytes(10);
  let out = '';
  for (let i = 0; i < bytes.length; i++) {
    out += TOKEN_ALPHABET[bytes[i] % TOKEN_ALPHABET.length];
  }
  return out;
}

// ---------- tests ----------
export interface NewTestInput {
  boardId: string;
  name: string;
  targetUrl?: string;
  targetMode: TestTargetMode;
  frameable: boolean | null;
  intro: string;
  recordingModes: RecordingMode[];
  questionnaire?: TestQuestion[];
  responseLimit?: number;
  createdByUserId: string;
}

export async function createTest(input: NewTestInput): Promise<Test> {
  const now = nowIso();
  const test: Test = {
    id: newId('test'),
    boardId: input.boardId,
    name: input.name,
    targetUrl: input.targetUrl,
    targetMode: input.targetMode,
    frameable: input.frameable,
    intro: input.intro,
    recordingModes: input.recordingModes,
    questionnaire: input.questionnaire,
    status: 'draft',
    shareToken: newTestToken(),
    responseLimit: input.responseLimit,
    createdByUserId: input.createdByUserId,
    createdAt: now,
    updatedAt: now,
  };
  await exec(
    `INSERT INTO tests (id, board_id, name, target_url, target_mode, frameable,
       dom_snapshot_key, intro, recording_modes_json, questionnaire_json, status,
       share_token, response_limit, summary_frame_id, created_by_user_id,
       created_at, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
    [
      test.id,
      test.boardId,
      test.name,
      test.targetUrl ?? null,
      test.targetMode,
      test.frameable,
      null,
      test.intro,
      JSON.stringify(test.recordingModes),
      test.questionnaire ? JSON.stringify(test.questionnaire) : null,
      test.status,
      test.shareToken,
      test.responseLimit ?? null,
      null,
      test.createdByUserId,
      test.createdAt,
      test.updatedAt,
    ],
  );
  return test;
}

export async function getTestById(id: string): Promise<Test | null> {
  const r = await queryOne<TestRow>(`SELECT * FROM tests WHERE id = $1`, [id]);
  return r ? rowToTest(r) : null;
}

export async function getTestByShareToken(token: string): Promise<Test | null> {
  const r = await queryOne<TestRow>(
    `SELECT * FROM tests WHERE share_token = $1`,
    [token],
  );
  return r ? rowToTest(r) : null;
}

export interface TestListRow {
  test: Test;
  counts: TestSessionCounts;
}

export async function listTestsForBoard(
  boardId: string,
): Promise<TestListRow[]> {
  const rows = await query<TestRow & { _total: string; _completed: string }>(
    `SELECT t.*,
       COALESCE(s.total, 0)::text AS _total,
       COALESCE(s.completed, 0)::text AS _completed
     FROM tests t
     LEFT JOIN (
       SELECT test_id,
         COUNT(*) AS total,
         COUNT(*) FILTER (WHERE status = 'completed') AS completed
       FROM test_sessions
       GROUP BY test_id
     ) s ON s.test_id = t.id
     WHERE t.board_id = $1
     ORDER BY t.created_at DESC`,
    [boardId],
  );
  return rows.map((r) => ({
    test: rowToTest(r),
    counts: { total: Number(r._total), completed: Number(r._completed) },
  }));
}

export interface TestPatch {
  name?: string;
  targetUrl?: string;
  targetMode?: TestTargetMode;
  frameable?: boolean | null;
  intro?: string;
  recordingModes?: RecordingMode[];
  questionnaire?: TestQuestion[];
  responseLimit?: number | null;
  status?: TestStatus;
}

export async function updateTest(
  id: string,
  patch: TestPatch,
): Promise<Test | null> {
  const existing = await getTestById(id);
  if (!existing) return null;
  const next: Test = {
    ...existing,
    name: patch.name ?? existing.name,
    targetUrl:
      patch.targetUrl !== undefined
        ? patch.targetUrl || undefined
        : existing.targetUrl,
    targetMode: patch.targetMode ?? existing.targetMode,
    frameable: patch.frameable !== undefined ? patch.frameable : existing.frameable,
    intro: patch.intro ?? existing.intro,
    recordingModes: patch.recordingModes ?? existing.recordingModes,
    questionnaire:
      patch.questionnaire !== undefined
        ? patch.questionnaire
        : existing.questionnaire,
    responseLimit:
      patch.responseLimit !== undefined
        ? (patch.responseLimit ?? undefined)
        : existing.responseLimit,
    status: patch.status ?? existing.status,
    updatedAt: nowIso(),
  };
  await exec(
    `UPDATE tests SET
       name = $1, target_url = $2, target_mode = $3, frameable = $4, intro = $5,
       recording_modes_json = $6, questionnaire_json = $7, response_limit = $8,
       status = $9, updated_at = $10
     WHERE id = $11`,
    [
      next.name,
      next.targetUrl ?? null,
      next.targetMode,
      next.frameable,
      next.intro,
      JSON.stringify(next.recordingModes),
      next.questionnaire ? JSON.stringify(next.questionnaire) : null,
      next.responseLimit ?? null,
      next.status,
      next.updatedAt,
      id,
    ],
  );
  return next;
}

export async function deleteTest(id: string): Promise<boolean> {
  const changes = await exec(`DELETE FROM tests WHERE id = $1`, [id]);
  return changes > 0;
}

// ---------- tasks ----------
export async function listTasksForTest(testId: string): Promise<TestTask[]> {
  const rows = await query<TestTaskRow>(
    `SELECT * FROM test_tasks WHERE test_id = $1 ORDER BY order_index`,
    [testId],
  );
  return rows.map(rowToTask);
}

/**
 * Replace the whole ordered task list for a test. The builder UI edits tasks
 * as one list, so a wholesale replace is simpler and race-free vs per-row CRUD.
 */
export async function replaceTasks(
  testId: string,
  tasks: TestTaskInput[],
): Promise<TestTask[]> {
  await exec(`DELETE FROM test_tasks WHERE test_id = $1`, [testId]);
  const created: TestTask[] = [];
  for (let i = 0; i < tasks.length; i++) {
    const input = tasks[i];
    const task: TestTask = {
      id: newId('tt'),
      testId,
      orderIndex: i,
      title: input.title,
      instruction: input.instruction,
      successHint: input.successHint,
      startUrl: input.startUrl,
      startRecipe: input.startRecipe,
    };
    await exec(
      `INSERT INTO test_tasks (id, test_id, order_index, title, instruction,
         success_hint, start_url, start_recipe_json)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [
        task.id,
        task.testId,
        task.orderIndex,
        task.title,
        task.instruction,
        task.successHint ?? null,
        task.startUrl ?? null,
        task.startRecipe ? JSON.stringify(task.startRecipe) : null,
      ],
    );
    created.push(task);
  }
  await exec(`UPDATE tests SET updated_at = $1 WHERE id = $2`, [
    nowIso(),
    testId,
  ]);
  return created;
}

export async function sessionCountsForTest(
  testId: string,
): Promise<TestSessionCounts> {
  const r = await queryOne<{ total: string; completed: string }>(
    `SELECT COUNT(*)::text AS total,
       COUNT(*) FILTER (WHERE status = 'completed')::text AS completed
     FROM test_sessions WHERE test_id = $1`,
    [testId],
  );
  return {
    total: r ? Number(r.total) : 0,
    completed: r ? Number(r.completed) : 0,
  };
}

/** Persist the id of the test's hub `test_summary` frame on the canvas. */
export async function setSummaryFrame(
  testId: string,
  frameId: string,
): Promise<void> {
  await exec(`UPDATE tests SET summary_frame_id = $1 WHERE id = $2`, [
    frameId,
    testId,
  ]);
}

/**
 * Per-task aggregate stats across every *completed* session of a test:
 * completed / skipped / gave-up counts plus the median time-on-task. Drives
 * the `test_summary` frame on the canvas.
 */
export async function taskStatsForTest(
  testId: string,
): Promise<TestTaskStat[]> {
  const tasks = await query<{ id: string; title: string }>(
    `SELECT id, title FROM test_tasks WHERE test_id = $1 ORDER BY order_index`,
    [testId],
  );
  const resultRows = await query<{
    task_id: string;
    outcome: string;
    duration_ms: number;
  }>(
    `SELECT r.task_id, r.outcome, r.duration_ms
       FROM test_task_results r
       JOIN test_sessions s ON s.id = r.session_id
      WHERE s.test_id = $1 AND s.status = 'completed'`,
    [testId],
  );

  const byTask = new Map<
    string,
    { completed: number; skipped: number; gaveUp: number; durations: number[] }
  >();
  for (const t of tasks) {
    byTask.set(t.id, {
      completed: 0,
      skipped: 0,
      gaveUp: 0,
      durations: [],
    });
  }
  for (const row of resultRows) {
    const agg = byTask.get(row.task_id);
    if (!agg) continue;
    if (row.outcome === 'completed') agg.completed += 1;
    else if (row.outcome === 'skipped') agg.skipped += 1;
    else if (row.outcome === 'gave_up') agg.gaveUp += 1;
    agg.durations.push(Number(row.duration_ms));
  }

  return tasks.map((t) => {
    const agg = byTask.get(t.id)!;
    return {
      taskId: t.id,
      title: t.title,
      completed: agg.completed,
      skipped: agg.skipped,
      gaveUp: agg.gaveUp,
      medianDurationMs: median(agg.durations),
    };
  });
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? Math.round((sorted[mid - 1] + sorted[mid]) / 2)
    : sorted[mid];
}

/**
 * Copy a test — its definition, tasks and questionnaire — into a fresh
 * `draft` with a new share token and a " (copy)" name suffix. Sessions and
 * results are deliberately not copied; a duplicate starts clean.
 */
export async function duplicateTest(
  testId: string,
  userId: string,
): Promise<Test | null> {
  const source = await getTestById(testId);
  if (!source) return null;

  const copy = await createTest({
    boardId: source.boardId,
    name: `${source.name} (copy)`,
    targetUrl: source.targetUrl,
    targetMode: source.targetMode,
    frameable: source.frameable ?? null,
    intro: source.intro,
    recordingModes: source.recordingModes,
    questionnaire: source.questionnaire,
    responseLimit: source.responseLimit,
    createdByUserId: userId,
  });

  const tasks = await listTasksForTest(testId);
  if (tasks.length > 0) {
    await replaceTasks(
      copy.id,
      tasks.map((t) => ({
        title: t.title,
        instruction: t.instruction,
        successHint: t.successHint,
        startUrl: t.startUrl,
        startRecipe: t.startRecipe,
      })),
    );
  }

  // createTest always returns status 'draft', which is what we want.
  return copy;
}
