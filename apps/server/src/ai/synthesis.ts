import type {
  TestSession,
  TestSessionIssue,
  TestSessionSynthesis,
  TestTask,
} from '@foldo/protocol';
import {
  getSessionById,
  updateSessionSynthesis,
} from '../repo/testSessions.ts';
import { listTasksForTest } from '../repo/tests.ts';
import { updateSessionFrame } from '../sessionFrames.ts';
import { nowIso } from '../util.ts';

/**
 * AI synthesis of a single test session — a short summary plus discrete issues
 * with a severity, the "intelligence layer" from the spec.
 *
 * Two modes:
 *  - `ANTHROPIC_API_KEY` set → one Claude Messages API call over the transcript,
 *    task outcomes and questionnaire answers.
 *  - no key → a deterministic **stub** derived purely from task outcomes. It's
 *    honest (`generatedBy: 'stub'`), useful (flags skipped / gave-up tasks),
 *    and never invents user quotes.
 */
const DEFAULT_MODEL = 'claude-opus-4-7';

export async function synthesizeSession(
  session: TestSession,
  tasks: TestTask[],
): Promise<TestSessionSynthesis> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (apiKey) {
    try {
      return await synthesizeWithClaude(session, tasks, apiKey);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(
        `[synthesis] Claude call failed for ${session.id}, falling back to stub:`,
        err,
      );
      // Fall through to the stub so the session still gets *some* synthesis.
    }
  }
  return stubSynthesis(session, tasks);
}

// ---------- stub ----------

function stubSynthesis(
  session: TestSession,
  tasks: TestTask[],
): TestSessionSynthesis {
  const titleById = new Map(tasks.map((t) => [t.id, t.title]));
  const results = session.taskResults ?? [];
  const completed = results.filter((r) => r.outcome === 'completed').length;
  const skipped = results.filter((r) => r.outcome === 'skipped');
  const gaveUp = results.filter((r) => r.outcome === 'gave_up');

  const issues: TestSessionIssue[] = [];
  for (const r of gaveUp) {
    issues.push({
      severity: 'high',
      text: `Tester gave up on "${titleById.get(r.taskId) ?? r.taskId}".`,
      taskId: r.taskId,
      atMs: r.recordingOffsetMs,
    });
  }
  for (const r of skipped) {
    issues.push({
      severity: 'medium',
      text: `Tester skipped "${titleById.get(r.taskId) ?? r.taskId}".`,
      taskId: r.taskId,
      atMs: r.recordingOffsetMs,
    });
  }

  const total = results.length;
  const summary =
    total === 0
      ? 'No task results were recorded for this session.'
      : `${session.testerLabel} completed ${completed} of ${total} task${
          total === 1 ? '' : 's'
        }` +
        (skipped.length > 0 ? `, skipped ${skipped.length}` : '') +
        (gaveUp.length > 0 ? `, gave up on ${gaveUp.length}` : '') +
        '. (Heuristic summary — configure ANTHROPIC_API_KEY for an AI synthesis.)';

  return {
    summary,
    issues,
    generatedBy: 'stub',
    generatedAt: nowIso(),
  };
}

// ---------- Claude ----------

interface AnthropicMessageResponse {
  content?: Array<{ type: string; text?: string }>;
}

async function synthesizeWithClaude(
  session: TestSession,
  tasks: TestTask[],
  apiKey: string,
): Promise<TestSessionSynthesis> {
  const model = process.env.FOLDO_SYNTHESIS_MODEL || DEFAULT_MODEL;
  const titleById = new Map(tasks.map((t) => [t.id, t.title]));

  const taskLines = (session.taskResults ?? [])
    .map((r) => {
      const title = titleById.get(r.taskId) ?? r.taskId;
      return `- "${title}" (taskId: ${r.taskId}) → ${r.outcome}, ${Math.round(
        r.durationMs / 1000,
      )}s, recording offset ${r.recordingOffsetMs}ms`;
    })
    .join('\n');

  const transcriptText = (session.transcript ?? [])
    .map((c) => `[${Math.round(c.startMs / 1000)}s] ${c.text}`)
    .join('\n');

  const responseLines = (session.responses ?? [])
    .map(
      (a) =>
        `- ${a.questionId}: ${
          Array.isArray(a.value) ? a.value.join(', ') : a.value
        }`,
    )
    .join('\n');

  const prompt = [
    'You are analysing one unmoderated usability-test session for a product team.',
    'Summarise how it went and extract concrete usability issues.',
    '',
    `Tester: ${session.testerLabel}`,
    `Recording mode: ${session.recordingMode}`,
    '',
    'Task outcomes:',
    taskLines || '(none recorded)',
    '',
    'Questionnaire answers:',
    responseLines || '(none)',
    '',
    'Transcript (timestamps in seconds):',
    transcriptText || '(no transcript available)',
    '',
    'Respond with ONLY a JSON object, no prose, no markdown fences, of the shape:',
    '{',
    '  "summary": "2-4 sentence plain-language summary of the session",',
    '  "issues": [',
    '    { "severity": "low|medium|high", "text": "the problem in one sentence", "taskId": "<taskId or omit>", "atMs": <recording offset in ms or omit> }',
    '  ]',
    '}',
    'Only include issues you have real evidence for. An empty issues array is fine.',
  ].join('\n');

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!res.ok) {
    throw new Error(
      `Anthropic API ${res.status}: ${await res.text().catch(() => '')}`,
    );
  }

  const data = (await res.json()) as AnthropicMessageResponse;
  const text =
    data.content?.find((b) => b.type === 'text')?.text?.trim() ?? '';
  const parsed = parseSynthesisJson(text);
  if (!parsed) {
    throw new Error('Could not parse synthesis JSON from Claude response');
  }

  return {
    summary: parsed.summary,
    issues: parsed.issues,
    generatedBy: model,
    generatedAt: nowIso(),
  };
}

const SEVERITIES = new Set(['low', 'medium', 'high']);

/** Tolerant parse — Claude may wrap JSON in fences or stray prose. */
function parseSynthesisJson(
  text: string,
): { summary: string; issues: TestSessionIssue[] } | null {
  let raw = text;
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return null;
  raw = raw.slice(start, end + 1);

  let obj: unknown;
  try {
    obj = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!obj || typeof obj !== 'object') return null;
  const o = obj as Record<string, unknown>;
  const summary = typeof o.summary === 'string' ? o.summary.trim() : '';
  if (!summary) return null;

  const issues: TestSessionIssue[] = [];
  if (Array.isArray(o.issues)) {
    for (const item of o.issues) {
      if (!item || typeof item !== 'object') continue;
      const i = item as Record<string, unknown>;
      const severity = String(i.severity ?? '').toLowerCase();
      const issueText =
        typeof i.text === 'string' ? i.text.trim() : '';
      if (!SEVERITIES.has(severity) || !issueText) continue;
      const issue: TestSessionIssue = {
        severity: severity as TestSessionIssue['severity'],
        text: issueText,
      };
      if (typeof i.taskId === 'string' && i.taskId.trim()) {
        issue.taskId = i.taskId.trim();
      }
      if (typeof i.atMs === 'number' && Number.isFinite(i.atMs)) {
        issue.atMs = Math.max(0, Math.round(i.atMs));
      }
      issues.push(issue);
    }
  }
  return { summary, issues };
}

// ---------- job ----------

/**
 * Fire-and-forget synthesis job. Runs after transcription, writes
 * `synthesis_json`, then refreshes the session's canvas frame so the synthesis
 * appears without a reload. Never throws.
 */
export function enqueueSynthesis(sessionId: string): void {
  void runSynthesis(sessionId);
}

async function runSynthesis(sessionId: string): Promise<void> {
  try {
    const session = await getSessionById(sessionId);
    if (!session) return;
    const tasks = await listTasksForTest(session.testId);
    const synthesis = await synthesizeSession(session, tasks);
    await updateSessionSynthesis(sessionId, synthesis);
    await updateSessionFrame(sessionId);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(`[synthesis] session ${sessionId} failed:`, err);
  }
}
