import type {
  Branch,
  Frame,
  TestSession,
  TestSummaryFrameContent,
  TestSessionFrameContent,
} from '@foldo/protocol';
import { getBranchById, upsertBranch } from './repo/branches.ts';
import {
  getFrameById,
  insertFrame,
  listFramesForBoard,
  updateFrame,
} from './repo/frames.ts';
import {
  getSessionById,
  setSessionResultFrame,
} from './repo/testSessions.ts';
import {
  getTestById,
  sessionCountsForTest,
  setSummaryFrame,
  taskStatsForTest,
} from './repo/tests.ts';
import { hub } from './ws/hub.ts';
import { newCommitSha, newId, nowIso } from './util.ts';

/**
 * Builds and maintains the test-results frames on the canvas.
 *
 * Layout: a single `test_summary` frame per test is the hub; each completed
 * session gets a `test_session` frame whose `parentFrameId` points at the
 * summary, laid out in a grid row beneath it. As async transcription /
 * synthesis jobs finish they call `updateSessionFrame` to refresh content in
 * place, and every mutation broadcasts over the existing board WS path.
 */

const SUMMARY_WIDTH = 520;
const SUMMARY_HEIGHT = 360;
const SESSION_WIDTH = 420;
const SESSION_HEIGHT = 520;
const GAP = 60;
const COLUMNS = 4;

/** Frames need a branch — one lightweight per-board branch holds all tests. */
function testsBranchId(boardId: string): string {
  return `tests-${boardId}`;
}

async function ensureTestsBranch(boardId: string): Promise<Branch> {
  const id = testsBranchId(boardId);
  const existing = await getBranchById(id);
  if (existing) return existing;
  const now = nowIso();
  const branch: Branch = {
    id,
    boardId,
    name: 'tests',
    authoredBy: 'human',
    authorUserId: 'system',
    color: '#8b6bf5',
    headSha: '0000000',
    createdAt: now,
    updatedAt: now,
  };
  await upsertBranch(branch);
  hub.broadcast(boardId, { type: 'branch.added', branch });
  return branch;
}

function summaryContent(
  test: { id: string; name: string; shareToken: string; status: TestSummaryFrameContent['status'] },
  counts: { total: number; completed: number },
  taskStats: TestSummaryFrameContent['taskStats'],
): TestSummaryFrameContent {
  return {
    kind: 'test_summary',
    testId: test.id,
    testName: test.name,
    shareToken: test.shareToken,
    status: test.status,
    totalSessions: counts.total,
    completedSessions: counts.completed,
    taskStats,
  };
}

function sessionContent(session: TestSession): TestSessionFrameContent {
  return {
    kind: 'test_session',
    testId: session.testId,
    sessionId: session.id,
    testerLabel: session.testerLabel,
    recordingMode: session.recordingMode,
    recordingUrl: session.recordingUrl,
    recordingDurationMs: session.recordingDurationMs,
    taskResults: session.taskResults ?? [],
    responses: session.responses,
    transcript: session.transcript,
    transcriptStatus: session.transcriptStatus,
    synthesis: session.synthesis,
    completedAt: session.completedAt,
  };
}

/**
 * Create (or refresh) the single `test_summary` hub frame for a test,
 * recomputing aggregate stats. Persists `tests.summary_frame_id` and
 * broadcasts `frame.added` / `frame.updated`.
 */
export async function ensureSummaryFrame(testId: string): Promise<Frame> {
  const test = await getTestById(testId);
  if (!test) throw new Error(`ensureSummaryFrame: test ${testId} not found`);

  const branch = await ensureTestsBranch(test.boardId);
  const [counts, taskStats] = await Promise.all([
    sessionCountsForTest(testId),
    taskStatsForTest(testId),
  ]);
  const content = summaryContent(test, counts, taskStats);

  // Update in place if the summary frame already exists.
  if (test.summaryFrameId) {
    const existing = await getFrameById(test.summaryFrameId);
    if (existing) {
      const updated = await updateFrame(existing.id, { content });
      if (updated) {
        hub.broadcast(test.boardId, { type: 'frame.updated', frame: updated });
        return updated;
      }
    }
  }

  // Position the summary above-left of where session frames will sit.
  const boardFrames = await listFramesForBoard(test.boardId);
  const maxY = boardFrames.reduce(
    (m, f) => Math.max(m, f.position.y + f.size.height),
    0,
  );
  const now = nowIso();
  const frame: Frame = {
    id: newId('f'),
    boardId: test.boardId,
    kind: 'test_summary',
    branchId: branch.id,
    commitSha: newCommitSha(),
    commitMessage: `test: ${test.name}`,
    age: 'just now',
    position: { x: 80, y: maxY + 120 },
    size: { width: SUMMARY_WIDTH, height: SUMMARY_HEIGHT },
    content,
    createdAt: now,
    updatedAt: now,
  };
  await insertFrame(frame);
  await setSummaryFrame(testId, frame.id);
  hub.broadcast(test.boardId, { type: 'frame.added', frame });
  return frame;
}

/**
 * Create a `test_session` frame for a completed session, parented to the
 * test's summary frame and laid out in a grid row beneath it. Persists
 * `test_sessions.result_frame_id` and broadcasts `frame.added`.
 */
export async function createSessionFrame(
  session: TestSession,
): Promise<Frame> {
  const test = await getTestById(session.testId);
  if (!test) {
    throw new Error(`createSessionFrame: test ${session.testId} not found`);
  }

  // Idempotent: if a frame already exists for this session, refresh it instead.
  if (session.resultFrameId) {
    const existing = await getFrameById(session.resultFrameId);
    if (existing) {
      const updated = await updateFrame(existing.id, {
        content: sessionContent(session),
      });
      if (updated) {
        hub.broadcast(test.boardId, { type: 'frame.updated', frame: updated });
        return updated;
      }
    }
  }

  const summary = await ensureSummaryFrame(session.testId);
  const branch = await ensureTestsBranch(test.boardId);

  // Lay sessions out in a grid row under the summary frame. The slot index is
  // the number of sibling session frames already on the board for this test.
  const boardFrames = await listFramesForBoard(test.boardId);
  const siblingCount = boardFrames.filter(
    (f) =>
      f.kind === 'test_session' &&
      f.content.kind === 'test_session' &&
      f.content.testId === session.testId,
  ).length;
  const col = siblingCount % COLUMNS;
  const rowIdx = Math.floor(siblingCount / COLUMNS);
  const baseX = summary.position.x;
  const baseY = summary.position.y + summary.size.height + GAP;
  const x = baseX + col * (SESSION_WIDTH + GAP);
  const y = baseY + rowIdx * (SESSION_HEIGHT + GAP);

  const now = nowIso();
  const frame: Frame = {
    id: newId('f'),
    boardId: test.boardId,
    kind: 'test_session',
    branchId: branch.id,
    commitSha: newCommitSha(),
    commitMessage: `test session: ${session.testerLabel}`,
    age: 'just now',
    position: { x, y },
    size: { width: SESSION_WIDTH, height: SESSION_HEIGHT },
    content: sessionContent(session),
    parentFrameId: summary.id,
    createdAt: now,
    updatedAt: now,
  };
  await insertFrame(frame);
  await setSessionResultFrame(session.id, frame.id);
  hub.broadcast(test.boardId, { type: 'frame.added', frame });
  return frame;
}

/**
 * Re-read a session and refresh its `test_session` frame's content — used by
 * the async transcription / synthesis jobs so their results appear on the
 * canvas without a reload. Broadcasts `frame.updated`. No-op if the session or
 * its frame is gone.
 */
export async function updateSessionFrame(sessionId: string): Promise<void> {
  const session = await getSessionById(sessionId);
  if (!session || !session.resultFrameId) return;
  const frame = await getFrameById(session.resultFrameId);
  if (!frame) return;
  const updated = await updateFrame(frame.id, {
    content: sessionContent(session),
  });
  if (updated) {
    hub.broadcast(updated.boardId, { type: 'frame.updated', frame: updated });
  }
}

/**
 * Convenience used when a session completes: ensure the summary frame, create
 * the session frame, and return both. Also refreshes the summary so its
 * aggregate counts include the new session.
 */
export async function publishSessionResult(
  session: TestSession,
): Promise<{ summary: Frame; sessionFrame: Frame }> {
  const sessionFrame = await createSessionFrame(session);
  // Recompute summary stats now that this session counts.
  const summary = await ensureSummaryFrame(session.testId);
  return { summary, sessionFrame };
}
