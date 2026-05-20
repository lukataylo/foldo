// API helpers for E2E tests. These hit the running Foldo server directly so a
// spec can arrange its own test data (and tear it down) without going through
// the UI. Demo auth: the bearer token is just the user id.

const API = process.env.FOLDO_API ?? 'http://localhost:4000';
const BOARD_ID = 'board-acme-landing';
const HEADERS = {
  'Content-Type': 'application/json',
  Authorization: 'Bearer u-you',
};
// Body-less requests must not declare a JSON content-type (Fastify rejects it).
const AUTH_ONLY = { Authorization: 'Bearer u-you' };

export interface CreatedTest {
  id: string;
  shareToken: string;
  name: string;
}

interface TestTaskInput {
  title: string;
  instruction: string;
}

interface QuestionInput {
  id: string;
  kind: 'short_text' | 'long_text' | 'single_choice' | 'multi_choice' | 'rating';
  prompt: string;
  choices?: string[];
  required?: boolean;
}

export async function apiCreateTest(opts: {
  name: string;
  targetUrl?: string;
  recordingModes?: string[];
  tasks?: TestTaskInput[];
  questionnaire?: QuestionInput[];
  publish?: boolean;
}): Promise<CreatedTest> {
  const res = await fetch(`${API}/api/tests`, {
    method: 'POST',
    headers: HEADERS,
    body: JSON.stringify({
      boardId: BOARD_ID,
      name: opts.name,
      targetUrl: opts.targetUrl ?? 'http://localhost:5174',
      recordingModes: opts.recordingModes ?? ['voice_only'],
      tasks: opts.tasks ?? [
        { title: 'Look around', instruction: 'Browse the page.' },
      ],
      questionnaire: opts.questionnaire ?? [],
    }),
  });
  if (!res.ok) {
    throw new Error(`apiCreateTest ${res.status}: ${await res.text()}`);
  }
  const json = (await res.json()) as {
    test: { id: string; shareToken: string };
  };
  const created: CreatedTest = {
    id: json.test.id,
    shareToken: json.test.shareToken,
    name: opts.name,
  };
  if (opts.publish) await apiSetStatus(created.id, 'live');
  return created;
}

export async function apiSetStatus(
  id: string,
  status: 'draft' | 'live' | 'closed',
): Promise<void> {
  const res = await fetch(`${API}/api/tests/${id}`, {
    method: 'PATCH',
    headers: HEADERS,
    body: JSON.stringify({ status }),
  });
  if (!res.ok) {
    throw new Error(`apiSetStatus ${res.status}: ${await res.text()}`);
  }
}

export async function apiDeleteTest(id: string): Promise<void> {
  await fetch(`${API}/api/tests/${id}`, {
    method: 'DELETE',
    headers: AUTH_ONLY,
  }).catch(() => undefined);
}

/**
 * Delete the `test_session` / `test_summary` frames that completing a test
 * session spawns on the demo board. The seeded board has none, so any present
 * are E2E residue — left unchecked they accumulate and stretch the board,
 * which throws off zoom-to-fit-dependent canvas tests.
 */
export async function apiCleanupTestFrames(): Promise<void> {
  try {
    const res = await fetch(`${API}/api/boards/${BOARD_ID}`, {
      headers: AUTH_ONLY,
    });
    if (!res.ok) return;
    const json = (await res.json()) as {
      frames: Array<{ id: string; kind: string }>;
    };
    for (const f of json.frames) {
      if (f.kind === 'test_session' || f.kind === 'test_summary') {
        await fetch(`${API}/api/frames/${encodeURIComponent(f.id)}`, {
          method: 'DELETE',
          headers: AUTH_ONLY,
        }).catch(() => undefined);
      }
    }
  } catch {
    /* best-effort */
  }
}

/** Delete every test on the demo board whose name contains `needle`. */
export async function apiCleanupByName(needle: string): Promise<void> {
  try {
    const res = await fetch(`${API}/api/tests?boardId=${BOARD_ID}`, {
      headers: AUTH_ONLY,
    });
    if (!res.ok) return;
    const json = (await res.json()) as {
      tests: Array<{ test: { id: string; name: string } }>;
    };
    for (const { test: t } of json.tests) {
      if (t.name.includes(needle)) await apiDeleteTest(t.id);
    }
  } catch {
    /* best-effort */
  }
}

export interface SessionSummary {
  id: string;
  status: string;
  recordingUrl?: string;
  recordingDurationMs?: number;
  responses?: Array<{ questionId: string; value: string | string[] }>;
  taskResults?: Array<{ taskId: string; outcome: string }>;
}

export async function apiListSessions(
  testId: string,
): Promise<SessionSummary[]> {
  const res = await fetch(`${API}/api/tests/${testId}/sessions`, {
    headers: AUTH_ONLY,
  });
  if (!res.ok) {
    throw new Error(`apiListSessions ${res.status}: ${await res.text()}`);
  }
  const json = (await res.json()) as { sessions: SessionSummary[] };
  return json.sessions;
}

// -------- Frames & comments helpers --------

export const E2E_BOARD_ID = BOARD_ID;
export const E2E_USER_ID = 'u-you';

/** Snapshot of a board's frames + branches (the canvas hydration payload). */
export async function apiGetBoard(boardId = BOARD_ID): Promise<{
  branches: Array<{ id: string; headSha: string }>;
  frames: Array<{ id: string; kind: string; branchId: string; content: { kind: string; body?: string } & Record<string, unknown> }>;
  comments: Array<{ id: string; frameId: string; text: string }>;
}> {
  const res = await fetch(`${API}/api/boards/${boardId}`, {
    headers: AUTH_ONLY,
  });
  if (!res.ok) throw new Error(`apiGetBoard ${res.status}: ${await res.text()}`);
  return (await res.json()) as never;
}

/** Delete a frame by id (best-effort; ignores 404). */
export async function apiDeleteFrame(frameId: string): Promise<void> {
  await fetch(`${API}/api/frames/${encodeURIComponent(frameId)}`, {
    method: 'DELETE',
    headers: AUTH_ONLY,
  }).catch(() => undefined);
}

/** Delete every frame on the board whose body / commit message contains `needle`. */
export async function apiCleanupFramesByText(needle: string): Promise<void> {
  try {
    const snap = await apiGetBoard();
    for (const f of snap.frames) {
      const body = String(f.content.body ?? '');
      const html = String((f.content as { html?: string }).html ?? '');
      if (body.includes(needle) || html.includes(needle)) {
        await apiDeleteFrame(f.id);
      }
    }
  } catch {
    /* best-effort */
  }
}

/** Delete every comment matching a substring. Useful for E2E cleanup. */
export async function apiCleanupCommentsByText(needle: string): Promise<void> {
  try {
    const snap = await apiGetBoard();
    for (const c of snap.comments) {
      if (c.text.includes(needle)) {
        await fetch(`${API}/api/comments/${encodeURIComponent(c.id)}`, {
          method: 'DELETE',
          headers: AUTH_ONLY,
        }).catch(() => undefined);
      }
    }
  } catch {
    /* best-effort */
  }
}

/**
 * Create a frame the way an MCP/automation client would. Returns the created
 * Frame so the test can assert on the canvas afterwards.
 */
export async function apiCreateFrame(
  body: Record<string, unknown>,
): Promise<{ id: string; kind: string; content: Record<string, unknown> }> {
  const res = await fetch(`${API}/api/frames`, {
    method: 'POST',
    headers: HEADERS,
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`apiCreateFrame ${res.status}: ${await res.text()}`);
  }
  return (await res.json()) as never;
}

/** Pick the first branch on the board, with its headSha — needed for createFrame. */
export async function apiPickBranch(): Promise<{ id: string; headSha: string }> {
  const snap = await apiGetBoard();
  const captures = snap.branches.find((b) => b.id === 'captures');
  return captures ?? snap.branches[0];
}
