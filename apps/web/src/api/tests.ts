import type {
  CompleteTestSessionRequest,
  CompleteTestSessionResponse,
  CreateTestRequest,
  CreateTestResponse,
  DuplicateTestResponse,
  GetTestResponse,
  ListTestSessionsResponse,
  ListTestsResponse,
  PublicTestResponse,
  ReplaceTestTasksRequest,
  StartTestSessionRequest,
  StartTestSessionResponse,
  Test,
  TestTask,
  UpdateTestRequest,
  UploadRecordingResponse,
} from '@foldo/protocol';
import { API_BASE, api } from './client';

/** Public, no-auth: the test definition a tester runs at /t/:token. */
export function getPublicTest(token: string, signal?: AbortSignal) {
  return api<PublicTestResponse>(`/api/t/${encodeURIComponent(token)}`, {
    signal,
  });
}

/** Start a tester session , returns the session id + its write token. */
export function startTestSession(
  token: string,
  body: StartTestSessionRequest,
) {
  return api<StartTestSessionResponse>(
    `/api/t/${encodeURIComponent(token)}/sessions`,
    { method: 'POST', body },
  );
}

/** Upload the session recording as a raw binary body. */
export async function uploadTestRecording(
  token: string,
  sessionId: string,
  sessionToken: string,
  blob: Blob,
  durationMs: number,
): Promise<UploadRecordingResponse> {
  const url =
    `${API_BASE}/api/t/${encodeURIComponent(token)}` +
    `/sessions/${encodeURIComponent(sessionId)}/recording` +
    `?durationMs=${Math.round(durationMs)}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/octet-stream',
      'X-Foldo-Session-Token': sessionToken,
    },
    body: blob,
  });
  if (!res.ok) {
    let msg = `Upload failed (${res.status})`;
    try {
      const j = (await res.json()) as { error?: string };
      if (j?.error) msg = j.error;
    } catch {
      /* ignore */
    }
    throw new Error(msg);
  }
  return (await res.json()) as UploadRecordingResponse;
}

/** Finalise a session: persist task results, mark it completed. */
export function completeTestSession(
  token: string,
  sessionId: string,
  sessionToken: string,
  body: CompleteTestSessionRequest,
) {
  return api<CompleteTestSessionResponse>(
    `/api/t/${encodeURIComponent(token)}` +
      `/sessions/${encodeURIComponent(sessionId)}/complete`,
    { method: 'POST', body, headers: { 'X-Foldo-Session-Token': sessionToken } },
  );
}

export function listTests(boardId: string, signal?: AbortSignal) {
  return api<ListTestsResponse>('/api/tests', { query: { boardId }, signal });
}

export function getTest(testId: string, signal?: AbortSignal) {
  return api<GetTestResponse>(`/api/tests/${encodeURIComponent(testId)}`, {
    signal,
  });
}

export function createTest(body: CreateTestRequest) {
  return api<CreateTestResponse>('/api/tests', { method: 'POST', body });
}

export function updateTest(testId: string, body: UpdateTestRequest) {
  return api<{ test: Test }>(`/api/tests/${encodeURIComponent(testId)}`, {
    method: 'PATCH',
    body,
  });
}

export function deleteTest(testId: string) {
  return api<{ ok: true }>(`/api/tests/${encodeURIComponent(testId)}`, {
    method: 'DELETE',
  });
}

/** Creator-side: clone a test (definition + tasks) into a fresh draft. */
export function duplicateTest(testId: string) {
  return api<DuplicateTestResponse>(
    `/api/tests/${encodeURIComponent(testId)}/duplicate`,
    { method: 'POST' },
  );
}

/**
 * Absolute URL for the public abandon endpoint. Used directly with
 * `navigator.sendBeacon` from TestRunner — sendBeacon can't set custom headers
 * or go through the `api()` helper, so the session token rides in the body.
 */
export function abandonTestSessionUrl(token: string, sessionId: string): string {
  return (
    `${API_BASE}/api/t/${encodeURIComponent(token)}` +
    `/sessions/${encodeURIComponent(sessionId)}/abandon`
  );
}

export function replaceTestTasks(testId: string, body: ReplaceTestTasksRequest) {
  return api<{ tasks: TestTask[] }>(
    `/api/tests/${encodeURIComponent(testId)}/tasks`,
    { method: 'PUT', body },
  );
}

/** Creator-side: every recorded session for a test. */
export function listTestSessions(testId: string, signal?: AbortSignal) {
  return api<ListTestSessionsResponse>(
    `/api/tests/${encodeURIComponent(testId)}/sessions`,
    { signal },
  );
}
