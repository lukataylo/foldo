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
