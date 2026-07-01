import { randomBytes } from 'node:crypto';
import type {
  RecordingMode,
  TestResponseAnswer,
  TestSession,
  TestSessionStatus,
  TestSessionSynthesis,
  TestTaskResult,
  TranscriptCue,
  TranscriptStatus,
} from '@foldo/protocol';
import { exec, query, queryOne } from '../db.ts';
import { newId, nowIso } from '../util.ts';
import { getStorage } from '../storage/index.ts';

interface TestSessionRow {
  id: string;
  test_id: string;
  session_token: string | null;
  status: string;
  recording_mode: string;
  tester_label: string;
  // JSONB columns — pg returns them already parsed.
  tester_meta_json: Record<string, unknown> | null;
  consent_at: string | null;
  recording_key: string | null;
  recording_duration_ms: number | null;
  transcript_json: TranscriptCue[] | null;
  transcript_status: string;
  responses_json: TestResponseAnswer[] | null;
  synthesis_json: TestSessionSynthesis | null;
  result_frame_id: string | null;
  started_at: string;
  completed_at: string | null;
}

interface TestTaskResultRow {
  id: string;
  session_id: string;
  task_id: string;
  outcome: string;
  duration_ms: number;
  recording_offset_ms: number;
  events_json: unknown | null;
}

function rowToTaskResult(r: TestTaskResultRow): TestTaskResult {
  return {
    taskId: r.task_id,
    outcome: r.outcome as TestTaskResult['outcome'],
    durationMs: Number(r.duration_ms),
    recordingOffsetMs: Number(r.recording_offset_ms),
  };
}

function rowToSession(
  r: TestSessionRow,
  taskResults?: TestTaskResult[],
): TestSession {
  return {
    id: r.id,
    testId: r.test_id,
    status: r.status as TestSessionStatus,
    recordingMode: r.recording_mode as RecordingMode,
    testerLabel: r.tester_label,
    testerMeta: r.tester_meta_json ?? undefined,
    consentAt: r.consent_at ?? undefined,
    recordingUrl: r.recording_key
      ? getStorage().pathFor(r.recording_key)
      : undefined,
    recordingDurationMs: r.recording_duration_ms ?? undefined,
    transcript: r.transcript_json ?? undefined,
    transcriptStatus: r.transcript_status as TranscriptStatus,
    responses: r.responses_json ?? undefined,
    synthesis: r.synthesis_json ?? undefined,
    taskResults,
    resultFrameId: r.result_frame_id ?? undefined,
    startedAt: r.started_at,
    completedAt: r.completed_at ?? undefined,
  };
}

function newSessionToken(): string {
  return randomBytes(18).toString('base64url');
}

/**
 * The raw storage key of a session's recording. The wire-type `TestSession`
 * only carries the derived playback URL; transcription providers need the
 * key itself so they can hand the object (or a presigned URL) to their API.
 */
export async function getSessionRecordingKey(
  sessionId: string,
): Promise<string | null> {
  const r = await queryOne<{ recording_key: string | null }>(
    `SELECT recording_key FROM test_sessions WHERE id = $1`,
    [sessionId],
  );
  return r?.recording_key ?? null;
}

export interface NewSessionInput {
  testId: string;
  recordingMode: RecordingMode;
  testerLabel?: string;
  testerMeta?: Record<string, unknown>;
}

export async function createSession(
  input: NewSessionInput,
): Promise<{ session: TestSession; sessionToken: string }> {
  // Anonymous "Tester N" label when the tester doesn't volunteer a name.
  const countRow = await queryOne<{ n: string }>(
    `SELECT COUNT(*)::text AS n FROM test_sessions WHERE test_id = $1`,
    [input.testId],
  );
  const n = (countRow ? Number(countRow.n) : 0) + 1;
  const testerLabel = input.testerLabel?.trim() || `Tester ${n}`;
  const id = newId('ts');
  const sessionToken = newSessionToken();
  await exec(
    `INSERT INTO test_sessions
       (id, test_id, session_token, status, recording_mode, tester_label,
        tester_meta_json, consent_at, transcript_status, started_at)
     VALUES ($1,$2,$3,'started',$4,$5,$6,$7,'pending',$8)`,
    [
      id,
      input.testId,
      sessionToken,
      input.recordingMode,
      testerLabel,
      input.testerMeta ? JSON.stringify(input.testerMeta) : null,
      nowIso(),
      nowIso(),
    ],
  );
  const row = await queryOne<TestSessionRow>(
    `SELECT * FROM test_sessions WHERE id = $1`,
    [id],
  );
  if (!row) throw new Error('Session creation failed');
  return { session: rowToSession(row, []), sessionToken };
}

export async function listTaskResults(
  sessionId: string,
): Promise<TestTaskResult[]> {
  const rows = await query<TestTaskResultRow>(
    `SELECT * FROM test_task_results
      WHERE session_id = $1 ORDER BY recording_offset_ms`,
    [sessionId],
  );
  return rows.map(rowToTaskResult);
}

export async function getSessionById(
  id: string,
): Promise<TestSession | null> {
  const row = await queryOne<TestSessionRow>(
    `SELECT * FROM test_sessions WHERE id = $1`,
    [id],
  );
  if (!row) return null;
  return rowToSession(row, await listTaskResults(id));
}

/**
 * Return the session only if it exists, belongs to `testId`, and the
 * caller's `token` matches the session secret. Used to authorise every
 * tester-side write to a session.
 */
export async function verifySession(
  sessionId: string,
  testId: string,
  token: string,
): Promise<TestSession | null> {
  const row = await queryOne<TestSessionRow>(
    `SELECT * FROM test_sessions WHERE id = $1`,
    [sessionId],
  );
  if (!row) return null;
  if (row.test_id !== testId) return null;
  if (!row.session_token || row.session_token !== token) return null;
  return rowToSession(row, await listTaskResults(sessionId));
}

export async function saveRecording(
  sessionId: string,
  recordingKey: string,
  recordingDurationMs: number,
): Promise<void> {
  await exec(
    `UPDATE test_sessions
       SET recording_key = $1,
           recording_duration_ms = $2,
           status = CASE WHEN status = 'completed' THEN status ELSE 'recording' END
     WHERE id = $3`,
    [recordingKey, recordingDurationMs, sessionId],
  );
}

export async function listSessionsForTest(
  testId: string,
): Promise<TestSession[]> {
  const rows = await query<TestSessionRow>(
    `SELECT * FROM test_sessions WHERE test_id = $1 ORDER BY started_at DESC`,
    [testId],
  );
  if (rows.length === 0) return [];
  // Batch-fetch every task result for these sessions in a single query rather
  // than one `listTaskResults(sessionId)` per session (previous code was an
  // N+1: 50 sessions → 51 queries). Group in app, then build each session.
  const sessionIds = rows.map((r) => r.id);
  const resultRows = await query<TestTaskResultRow>(
    `SELECT * FROM test_task_results
      WHERE session_id = ANY($1::text[])
      ORDER BY recording_offset_ms`,
    [sessionIds],
  );
  const resultsBySession = new Map<string, TestTaskResult[]>();
  for (const r of resultRows) {
    const bucket = resultsBySession.get(r.session_id);
    if (bucket) bucket.push(rowToTaskResult(r));
    else resultsBySession.set(r.session_id, [rowToTaskResult(r)]);
  }
  return rows.map((r) => rowToSession(r, resultsBySession.get(r.id) ?? []));
}

export interface CompleteSessionInput {
  taskResults: TestTaskResult[];
  responses?: TestResponseAnswer[];
  recordingDurationMs?: number;
}

export async function completeSession(
  sessionId: string,
  input: CompleteSessionInput,
): Promise<TestSession | null> {
  // Idempotent: re-running `complete` (e.g. the tester retried) replaces the
  // previous task results rather than duplicating them.
  await exec(`DELETE FROM test_task_results WHERE session_id = $1`, [
    sessionId,
  ]);
  for (const tr of input.taskResults) {
    await exec(
      `INSERT INTO test_task_results
         (id, session_id, task_id, outcome, duration_ms, recording_offset_ms)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [
        newId('ttr'),
        sessionId,
        tr.taskId,
        tr.outcome,
        Math.max(0, Math.round(tr.durationMs)),
        Math.max(0, Math.round(tr.recordingOffsetMs)),
      ],
    );
  }
  await exec(
    `UPDATE test_sessions
       SET status = 'completed',
           completed_at = $1,
           recording_duration_ms = COALESCE($2, recording_duration_ms),
           responses_json = COALESCE($3, responses_json)
     WHERE id = $4`,
    [
      nowIso(),
      input.recordingDurationMs !== undefined
        ? Math.round(input.recordingDurationMs)
        : null,
      input.responses ? JSON.stringify(input.responses) : null,
      sessionId,
    ],
  );
  return getSessionById(sessionId);
}

/**
 * Mark a session `abandoned`. Idempotent and best-effort — used by the
 * tab-close beacon and the GC sweep. A session that already `completed` is
 * left untouched (the tester finished; a late beacon must not undo that).
 */
export async function abandonSession(sessionId: string): Promise<void> {
  await exec(
    `UPDATE test_sessions
       SET status = 'abandoned'
     WHERE id = $1 AND status IN ('started','recording')`,
    [sessionId],
  );
}

/**
 * Sweep sessions that have been stuck in `started`/`recording` for longer than
 * `olderThanMs` and mark them `abandoned`. Returns how many rows changed.
 */
export async function sweepAbandonedSessions(
  olderThanMs: number,
): Promise<number> {
  const cutoff = new Date(Date.now() - olderThanMs).toISOString();
  return exec(
    `UPDATE test_sessions
       SET status = 'abandoned'
     WHERE status IN ('started','recording')
       AND started_at < $1`,
    [cutoff],
  );
}

/**
 * Every test_session row belonging to a test owned by `userId`. Used by the
 * GDPR data-export endpoint — test sessions don't carry a direct user link,
 * so ownership is inherited via `tests.created_by_user_id`.
 */
export async function listSessionsForOwner(userId: string): Promise<TestSession[]> {
  const rows = await query<TestSessionRow>(
    `SELECT ts.* FROM test_sessions ts
       JOIN tests t ON t.id = ts.test_id
      WHERE t.created_by_user_id = $1
      ORDER BY ts.started_at DESC`,
    [userId],
  );
  if (rows.length === 0) return [];
  return rows.map((r) => rowToSession(r, []));
}

/**
 * Repoint every test that was created by `fromUserId` at `toUserId` — so
 * deleted users' tests collapse into the anonymous sentinel. Returns the
 * number of rows reassigned.
 */
export async function reassignTestCreator(
  fromUserId: string,
  toUserId: string,
): Promise<number> {
  return exec(
    `UPDATE tests SET created_by_user_id = $2 WHERE created_by_user_id = $1`,
    [fromUserId, toUserId],
  );
}

/** Persist transcript cues + status produced by the transcription job. */
export async function updateSessionTranscript(
  sessionId: string,
  cues: TranscriptCue[],
  status: TranscriptStatus,
): Promise<void> {
  await exec(
    `UPDATE test_sessions
       SET transcript_json = $1,
           transcript_status = $2
     WHERE id = $3`,
    [JSON.stringify(cues), status, sessionId],
  );
}

/** Persist the AI synthesis produced by the synthesis job. */
export async function updateSessionSynthesis(
  sessionId: string,
  synthesis: TestSessionSynthesis,
): Promise<void> {
  await exec(
    `UPDATE test_sessions
       SET synthesis_json = $1
     WHERE id = $2`,
    [JSON.stringify(synthesis), sessionId],
  );
}

/** Record which canvas frame represents this session. */
export async function setSessionResultFrame(
  sessionId: string,
  frameId: string,
): Promise<void> {
  await exec(`UPDATE test_sessions SET result_frame_id = $1 WHERE id = $2`, [
    frameId,
    sessionId,
  ]);
}
