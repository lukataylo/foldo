import { useCallback, useEffect, useState } from 'react';
import type {
  IssueSeverity,
  RecordingMode,
  Test,
  TestListItem,
  TestQuestion,
  TestQuestionKind,
  TestSession,
  TestStatus,
  TestTargetMode,
  TestTask,
} from '@foldo/protocol';
import {
  createTest,
  deleteTest,
  duplicateTest,
  getTest,
  listTests,
  listTestSessions,
  replaceTestTasks,
  updateTest,
} from '../api/tests';
import { resolveApiUrl } from '../api/client';
import { useBoardSelector } from '../state/useBoardStore';
import { WaveformPlayer } from '../test/WaveformPlayer';

interface Props {
  open: boolean;
  boardId: string | null;
  onClose: () => void;
}

interface TaskDraft {
  title: string;
  instruction: string;
}

interface QuestionDraft {
  id: string;
  kind: TestQuestionKind;
  prompt: string;
  /** one per line in the UI; only used by choice kinds */
  choices: string[];
  required: boolean;
}

interface Draft {
  name: string;
  targetMode: TestTargetMode;
  targetUrl: string;
  intro: string;
  recordingModes: RecordingMode[];
  responseLimit: string;
  tasks: TaskDraft[];
  questions: QuestionDraft[];
}

const RECORDING_MODE_LABELS: Record<RecordingMode, string> = {
  screen_voice: 'Screen + voice',
  voice_only: 'Voice only',
  screen_only: 'Screen only',
};

const TARGET_MODE_LABELS: Record<TestTargetMode, string> = {
  auto: 'Auto-detect (iframe or new tab)',
  iframe: 'Iframe wrapper',
  handoff: 'New-tab handoff',
  dom_snapshot: 'DOM snapshot (local-only app)',
};

const QUESTION_KIND_LABELS: Record<TestQuestionKind, string> = {
  short_text: 'Short text',
  long_text: 'Long text',
  single_choice: 'Single choice',
  multi_choice: 'Multiple choice',
  rating: 'Rating (1–5)',
};

function newQuestionId(): string {
  return `q-${Math.random().toString(36).slice(2, 9)}`;
}

function emptyDraft(): Draft {
  return {
    name: '',
    targetMode: 'auto',
    targetUrl: '',
    intro: '',
    recordingModes: ['screen_voice', 'voice_only'],
    responseLimit: '',
    tasks: [{ title: '', instruction: '' }],
    questions: [],
  };
}

function shareUrlForToken(token: string): string {
  return `${window.location.origin}/t/${token}`;
}

function formatDuration(ms: number | undefined): string {
  if (!ms || ms < 0) return '0:00';
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function isChoiceKind(kind: TestQuestionKind): boolean {
  return kind === 'single_choice' || kind === 'multi_choice';
}

export function TestsPanel({ open, boardId, onClose }: Props) {
  const [view, setView] = useState<'list' | 'editor' | 'results'>('list');
  const [items, setItems] = useState<TestListItem[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);

  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [editingTestId, setEditingTestId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);

  const [resultsTest, setResultsTest] = useState<Test | null>(null);
  const [resultsTasks, setResultsTasks] = useState<TestTask[]>([]);
  const [sessions, setSessions] = useState<TestSession[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [sessionsError, setSessionsError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!boardId) return;
    setListLoading(true);
    setListError(null);
    try {
      const res = await listTests(boardId);
      setItems(res.tests);
    } catch (e) {
      setListError(e instanceof Error ? e.message : String(e));
    } finally {
      setListLoading(false);
    }
  }, [boardId]);

  useEffect(() => {
    if (!open) return;
    setView('list');
    setSaveError(null);
  }, [open]);

  // Fetch on open, and refetch whenever a test.created/updated/deleted
  // broadcast bumps testsRevision — so an open panel stays live with
  // collaborator edits.
  const testsRevision = useBoardSelector((s) => s.testsRevision);
  useEffect(() => {
    if (!open) return;
    void refresh();
  }, [open, testsRevision, refresh]);

  if (!open) return null;

  const startNew = () => {
    setDraft(emptyDraft());
    setEditingTestId(null);
    setSaveError(null);
    setView('editor');
  };

  const startEdit = async (test: Test) => {
    setSaveError(null);
    try {
      const res = await getTest(test.id);
      setDraft({
        name: res.test.name,
        targetMode: res.test.targetMode,
        targetUrl: res.test.targetUrl ?? '',
        intro: res.test.intro,
        recordingModes:
          res.test.recordingModes.length > 0
            ? res.test.recordingModes
            : ['screen_voice'],
        responseLimit:
          res.test.responseLimit !== undefined
            ? String(res.test.responseLimit)
            : '',
        tasks:
          res.tasks.length > 0
            ? res.tasks.map((t) => ({
                title: t.title,
                instruction: t.instruction,
              }))
            : [{ title: '', instruction: '' }],
        questions: (res.test.questionnaire ?? []).map((q) => ({
          id: q.id,
          kind: q.kind,
          prompt: q.prompt,
          choices: q.choices ?? [],
          required: q.required ?? false,
        })),
      });
      setEditingTestId(test.id);
      setView('editor');
    } catch (e) {
      setListError(e instanceof Error ? e.message : String(e));
    }
  };

  const openResults = async (test: Test) => {
    setResultsTest(test);
    setResultsTasks([]);
    setSessions([]);
    setSessionsError(null);
    setView('results');
    setSessionsLoading(true);
    try {
      const [detail, sessionsRes] = await Promise.all([
        getTest(test.id),
        listTestSessions(test.id),
      ]);
      setResultsTest(detail.test);
      setResultsTasks(detail.tasks);
      setSessions(sessionsRes.sessions);
    } catch (e) {
      setSessionsError(e instanceof Error ? e.message : String(e));
    } finally {
      setSessionsLoading(false);
    }
  };

  const refreshResults = async () => {
    if (!resultsTest) return;
    setSessionsLoading(true);
    setSessionsError(null);
    try {
      const res = await listTestSessions(resultsTest.id);
      setSessions(res.sessions);
    } catch (e) {
      setSessionsError(e instanceof Error ? e.message : String(e));
    } finally {
      setSessionsLoading(false);
    }
  };

  const save = async () => {
    if (!boardId) return;
    const name = draft.name.trim();
    if (!name) {
      setSaveError('Give the test a name.');
      return;
    }
    if (draft.targetMode !== 'dom_snapshot') {
      const url = draft.targetUrl.trim();
      if (!url) {
        setSaveError('Add the URL of the app to test.');
        return;
      }
      try {
        new URL(url);
      } catch {
        setSaveError('Target URL must be a full http(s) URL.');
        return;
      }
    }
    if (draft.recordingModes.length === 0) {
      setSaveError('Allow at least one recording mode.');
      return;
    }
    const tasks = draft.tasks
      .map((t) => ({
        title: t.title.trim(),
        instruction: t.instruction.trim(),
      }))
      .filter((t) => t.title || t.instruction);
    if (tasks.some((t) => !t.title || !t.instruction)) {
      setSaveError('Every task needs both a title and an instruction.');
      return;
    }
    let responseLimit: number | undefined;
    if (draft.responseLimit.trim()) {
      const n = Number(draft.responseLimit.trim());
      if (!Number.isInteger(n) || n < 1) {
        setSaveError('Response limit must be a whole number above zero.');
        return;
      }
      responseLimit = n;
    }

    const questionnaire: TestQuestion[] = [];
    for (const q of draft.questions) {
      const prompt = q.prompt.trim();
      if (!prompt) continue;
      const choices = isChoiceKind(q.kind)
        ? q.choices.map((c) => c.trim()).filter(Boolean)
        : undefined;
      if (isChoiceKind(q.kind) && (choices?.length ?? 0) < 2) {
        setSaveError(`"${prompt}" needs at least two answer options.`);
        return;
      }
      questionnaire.push({
        id: q.id,
        kind: q.kind,
        prompt,
        choices,
        required: q.required,
      });
    }

    setSaving(true);
    setSaveError(null);
    try {
      if (editingTestId) {
        await updateTest(editingTestId, {
          name,
          targetMode: draft.targetMode,
          targetUrl:
            draft.targetMode === 'dom_snapshot' ? '' : draft.targetUrl.trim(),
          intro: draft.intro.trim(),
          recordingModes: draft.recordingModes,
          responseLimit: responseLimit ?? null,
          questionnaire,
        });
        await replaceTestTasks(editingTestId, { tasks });
      } else {
        await createTest({
          boardId,
          name,
          targetMode: draft.targetMode,
          targetUrl:
            draft.targetMode === 'dom_snapshot'
              ? undefined
              : draft.targetUrl.trim(),
          intro: draft.intro.trim(),
          recordingModes: draft.recordingModes,
          responseLimit,
          tasks,
          questionnaire,
        });
      }
      await refresh();
      setView('list');
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const setStatus = async (test: Test, status: TestStatus) => {
    try {
      await updateTest(test.id, { status });
      await refresh();
    } catch (e) {
      setListError(e instanceof Error ? e.message : String(e));
    }
  };

  const remove = async (test: Test) => {
    if (!window.confirm(`Delete "${test.name}"? This can't be undone.`)) return;
    try {
      await deleteTest(test.id);
      await refresh();
    } catch (e) {
      setListError(e instanceof Error ? e.message : String(e));
    }
  };

  const duplicate = async (test: Test) => {
    try {
      await duplicateTest(test.id);
      await refresh();
    } catch (e) {
      setListError(e instanceof Error ? e.message : String(e));
    }
  };

  const copyLink = async (token: string) => {
    const url = shareUrlForToken(token);
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = url;
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand('copy');
      } catch {
        /* ignore */
      }
      document.body.removeChild(ta);
    }
    setCopiedToken(token);
    setTimeout(() => setCopiedToken((t) => (t === token ? null : t)), 1400);
  };

  const toggleRecordingMode = (mode: RecordingMode) => {
    setDraft((d) => ({
      ...d,
      recordingModes: d.recordingModes.includes(mode)
        ? d.recordingModes.filter((m) => m !== mode)
        : [...d.recordingModes, mode],
    }));
  };

  const headerTitle =
    view === 'list'
      ? 'User tests'
      : view === 'results'
        ? 'Results'
        : editingTestId
          ? 'Edit test'
          : 'New test';

  return (
    <div className="pointer-events-auto absolute inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="flex max-h-[86vh] w-[640px] flex-col overflow-hidden rounded-xl border border-hairline bg-panel shadow-panel">
        <div className="flex items-center justify-between border-b border-hairlineSoft px-4 py-3">
          <div className="flex items-center gap-2 text-ink">
            <TestsIcon />
            <div>
              <div className="text-[13px] font-medium">{headerTitle}</div>
              <div className="text-[11px] text-inkFaint">
                {view === 'results' && resultsTest
                  ? resultsTest.name
                  : 'Unmoderated UX tests · publish a foldo.dev link, results land on this board'}
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-md text-inkMute hover:bg-white/5 hover:text-ink"
          >
            <svg width="11" height="11" viewBox="0 0 16 16">
              <path
                d="M4 4l8 8M12 4l-8 8"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>

        {view === 'list' ? (
          <div className="flex flex-col overflow-y-auto px-4 py-4">
            {listError && (
              <div className="mb-3 rounded-md border border-red-400/30 bg-red-400/10 px-3 py-2 text-[11.5px] text-red-300">
                {listError}
              </div>
            )}
            {listLoading && items.length === 0 ? (
              <div className="py-8 text-center text-[12px] text-inkFaint">
                Loading tests…
              </div>
            ) : items.length === 0 ? (
              <div className="rounded-md border border-dashed border-hairline bg-canvas/60 px-4 py-8 text-center">
                <div className="text-[12.5px] text-ink">No tests yet</div>
                <div className="mt-1 text-[11.5px] text-inkMute">
                  Create a test to publish a shareable link and gather
                  screen + voice recordings from real users.
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {items.map(({ test, sessionCounts }) => (
                  <div
                    key={test.id}
                    data-testid="test-row"
                    className="rounded-lg border border-hairlineSoft bg-canvas/60 px-3 py-2.5"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="truncate text-[12.5px] font-medium text-ink">
                            {test.name}
                          </span>
                          <StatusBadge status={test.status} />
                        </div>
                        <div className="mt-0.5 truncate font-mono text-[11px] text-inkFaint">
                          {test.targetUrl ?? 'DOM snapshot'}
                        </div>
                      </div>
                      <div className="shrink-0 text-right text-[11px] text-inkMute">
                        {sessionCounts.completed}/{sessionCounts.total} done
                      </div>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      <button
                        onClick={() => copyLink(test.shareToken)}
                        className="rounded-md border border-hairlineSoft px-2 py-1 text-[11px] text-ink hover:bg-white/5"
                      >
                        {copiedToken === test.shareToken
                          ? 'Link copied!'
                          : 'Copy link'}
                      </button>
                      <button
                        onClick={() => void openResults(test)}
                        className="rounded-md border border-hairlineSoft px-2 py-1 text-[11px] text-ink hover:bg-white/5"
                      >
                        Results ({sessionCounts.total})
                      </button>
                      <button
                        onClick={() => void startEdit(test)}
                        className="rounded-md border border-hairlineSoft px-2 py-1 text-[11px] text-ink hover:bg-white/5"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => void duplicate(test)}
                        className="rounded-md border border-hairlineSoft px-2 py-1 text-[11px] text-ink hover:bg-white/5"
                      >
                        Duplicate
                      </button>
                      {test.status === 'draft' && (
                        <button
                          onClick={() => void setStatus(test, 'live')}
                          className="rounded-md bg-accent px-2 py-1 text-[11px] font-medium text-white hover:bg-accentSoft"
                        >
                          Publish
                        </button>
                      )}
                      {test.status === 'live' && (
                        <button
                          onClick={() => void setStatus(test, 'closed')}
                          className="rounded-md border border-hairlineSoft px-2 py-1 text-[11px] text-ink hover:bg-white/5"
                        >
                          Close
                        </button>
                      )}
                      {test.status === 'closed' && (
                        <button
                          onClick={() => void setStatus(test, 'live')}
                          className="rounded-md border border-hairlineSoft px-2 py-1 text-[11px] text-ink hover:bg-white/5"
                        >
                          Reopen
                        </button>
                      )}
                      <button
                        onClick={() => void remove(test)}
                        className="ml-auto rounded-md px-2 py-1 text-[11px] text-inkMute hover:bg-white/5 hover:text-red-300"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div className="mt-4 flex items-center justify-between">
              <div className="text-[11px] text-inkFaint">
                {items.length} test{items.length === 1 ? '' : 's'}
              </div>
              <button
                onClick={startNew}
                className="flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-[12.5px] font-medium text-white hover:bg-accentSoft"
              >
                <PlusIcon /> New test
              </button>
            </div>
          </div>
        ) : view === 'results' ? (
          <div className="flex flex-col overflow-y-auto px-4 py-4">
            {sessionsError && (
              <div className="mb-3 rounded-md border border-red-400/30 bg-red-400/10 px-3 py-2 text-[11.5px] text-red-300">
                {sessionsError}
              </div>
            )}
            {sessionsLoading && sessions.length === 0 ? (
              <div className="py-8 text-center text-[12px] text-inkFaint">
                Loading sessions…
              </div>
            ) : sessions.length === 0 ? (
              <div className="rounded-md border border-dashed border-hairline bg-canvas/60 px-4 py-8 text-center">
                <div className="text-[12.5px] text-ink">No sessions yet</div>
                <div className="mt-1 text-[11.5px] text-inkMute">
                  Share the test link — completed runs show up here with the
                  recording, task results, and questionnaire answers.
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-2.5">
                <ResultsStats sessions={sessions} tasks={resultsTasks} />
                {sessions.map((s) => (
                  <SessionCard
                    key={s.id}
                    session={s}
                    tasks={resultsTasks}
                    questionnaire={resultsTest?.questionnaire ?? []}
                  />
                ))}
              </div>
            )}
            <div className="mt-4 flex items-center justify-between">
              <button
                onClick={() => setView('list')}
                className="rounded-md px-3 py-1.5 text-[12px] text-inkMute hover:bg-white/5 hover:text-ink"
              >
                Back
              </button>
              <button
                onClick={() => void refreshResults()}
                disabled={sessionsLoading}
                className="rounded-md border border-hairlineSoft px-3 py-1.5 text-[12px] text-ink hover:bg-white/5 disabled:opacity-50"
              >
                {sessionsLoading ? 'Refreshing…' : 'Refresh'}
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col overflow-y-auto px-4 py-4">
            <Field label="Test name">
              <input
                value={draft.name}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, name: e.target.value }))
                }
                placeholder="e.g. Pricing page — first impressions"
                className={inputClass}
              />
            </Field>

            <Field label="Delivery mode">
              <select
                value={draft.targetMode}
                onChange={(e) =>
                  setDraft((d) => ({
                    ...d,
                    targetMode: e.target.value as TestTargetMode,
                  }))
                }
                className={inputClass}
              >
                {(Object.keys(TARGET_MODE_LABELS) as TestTargetMode[]).map(
                  (m) => (
                    <option key={m} value={m}>
                      {TARGET_MODE_LABELS[m]}
                    </option>
                  ),
                )}
              </select>
            </Field>

            {draft.targetMode === 'dom_snapshot' ? (
              <div className="mb-3 rounded-md border border-hairlineSoft bg-canvas/70 px-3 py-2 text-[11.5px] leading-relaxed text-inkMute">
                DOM-snapshot mode serves a frozen capture of a local-only app.
                Capturing the snapshot is wired up in a later phase — for now
                this test can be drafted but not run.
              </div>
            ) : (
              <Field label="App URL to test">
                <input
                  value={draft.targetUrl}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, targetUrl: e.target.value }))
                  }
                  placeholder="https://your-app.vercel.app"
                  className={`${inputClass} font-mono`}
                />
              </Field>
            )}

            <Field label="Intro shown to the tester">
              <textarea
                value={draft.intro}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, intro: e.target.value }))
                }
                rows={2}
                placeholder="Thanks for helping out! You'll be asked to do a few short tasks…"
                className={`${inputClass} resize-none`}
              />
            </Field>

            <Field label="Recording modes the tester can pick">
              <div className="flex flex-wrap gap-2">
                {(Object.keys(RECORDING_MODE_LABELS) as RecordingMode[]).map(
                  (m) => {
                    const on = draft.recordingModes.includes(m);
                    return (
                      <button
                        key={m}
                        type="button"
                        onClick={() => toggleRecordingMode(m)}
                        className={
                          'rounded-md border px-2.5 py-1 text-[11.5px] ' +
                          (on
                            ? 'border-accent/50 bg-accent/15 text-ink'
                            : 'border-hairlineSoft text-inkMute hover:bg-white/5')
                        }
                      >
                        {RECORDING_MODE_LABELS[m]}
                      </button>
                    );
                  },
                )}
              </div>
            </Field>

            <Field label="Tasks">
              <div className="flex flex-col gap-2">
                {draft.tasks.map((task, i) => (
                  <div
                    key={i}
                    className="rounded-md border border-hairlineSoft bg-canvas/60 px-2.5 py-2"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] text-inkFaint">{i + 1}</span>
                      <input
                        value={task.title}
                        onChange={(e) =>
                          setDraft((d) => ({
                            ...d,
                            tasks: d.tasks.map((t, j) =>
                              j === i ? { ...t, title: e.target.value } : t,
                            ),
                          }))
                        }
                        placeholder="Task title"
                        className="flex-1 rounded-md border border-hairlineSoft bg-canvas px-2 py-1 text-[12px] text-ink focus:border-accent/60 focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          setDraft((d) => ({
                            ...d,
                            tasks: d.tasks.filter((_, j) => j !== i),
                          }))
                        }
                        className="flex h-6 w-6 items-center justify-center rounded-md text-inkMute hover:bg-white/5 hover:text-red-300"
                        title="Remove task"
                      >
                        <CloseGlyph />
                      </button>
                    </div>
                    <textarea
                      value={task.instruction}
                      onChange={(e) =>
                        setDraft((d) => ({
                          ...d,
                          tasks: d.tasks.map((t, j) =>
                            j === i
                              ? { ...t, instruction: e.target.value }
                              : t,
                          ),
                        }))
                      }
                      rows={2}
                      placeholder="What should the tester do? Shown in the task banner."
                      className="mt-1.5 w-full resize-none rounded-md border border-hairlineSoft bg-canvas px-2 py-1 text-[12px] text-ink focus:border-accent/60 focus:outline-none"
                    />
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() =>
                    setDraft((d) => ({
                      ...d,
                      tasks: [...d.tasks, { title: '', instruction: '' }],
                    }))
                  }
                  className="self-start rounded-md border border-hairlineSoft px-2.5 py-1 text-[11.5px] text-ink hover:bg-white/5"
                >
                  + Add task
                </button>
              </div>
            </Field>

            <Field label="Followup questions (optional)">
              <div className="flex flex-col gap-2">
                {draft.questions.map((q, i) => (
                  <div
                    key={q.id}
                    className="rounded-md border border-hairlineSoft bg-canvas/60 px-2.5 py-2"
                  >
                    <div className="flex items-center gap-2">
                      <select
                        value={q.kind}
                        onChange={(e) =>
                          setDraft((d) => ({
                            ...d,
                            questions: d.questions.map((x, j) =>
                              j === i
                                ? {
                                    ...x,
                                    kind: e.target.value as TestQuestionKind,
                                  }
                                : x,
                            ),
                          }))
                        }
                        className="rounded-md border border-hairlineSoft bg-canvas px-2 py-1 text-[11.5px] text-ink focus:border-accent/60 focus:outline-none"
                      >
                        {(
                          Object.keys(QUESTION_KIND_LABELS) as TestQuestionKind[]
                        ).map((k) => (
                          <option key={k} value={k}>
                            {QUESTION_KIND_LABELS[k]}
                          </option>
                        ))}
                      </select>
                      <label className="flex items-center gap-1 text-[11px] text-inkMute">
                        <input
                          type="checkbox"
                          checked={q.required}
                          onChange={(e) =>
                            setDraft((d) => ({
                              ...d,
                              questions: d.questions.map((x, j) =>
                                j === i
                                  ? { ...x, required: e.target.checked }
                                  : x,
                              ),
                            }))
                          }
                        />
                        Required
                      </label>
                      <button
                        type="button"
                        onClick={() =>
                          setDraft((d) => ({
                            ...d,
                            questions: d.questions.filter((_, j) => j !== i),
                          }))
                        }
                        className="ml-auto flex h-6 w-6 items-center justify-center rounded-md text-inkMute hover:bg-white/5 hover:text-red-300"
                        title="Remove question"
                      >
                        <CloseGlyph />
                      </button>
                    </div>
                    <input
                      value={q.prompt}
                      onChange={(e) =>
                        setDraft((d) => ({
                          ...d,
                          questions: d.questions.map((x, j) =>
                            j === i ? { ...x, prompt: e.target.value } : x,
                          ),
                        }))
                      }
                      placeholder="Question shown to the tester"
                      className="mt-1.5 w-full rounded-md border border-hairlineSoft bg-canvas px-2 py-1 text-[12px] text-ink focus:border-accent/60 focus:outline-none"
                    />
                    {isChoiceKind(q.kind) && (
                      <textarea
                        value={q.choices.join('\n')}
                        onChange={(e) =>
                          setDraft((d) => ({
                            ...d,
                            questions: d.questions.map((x, j) =>
                              j === i
                                ? { ...x, choices: e.target.value.split('\n') }
                                : x,
                            ),
                          }))
                        }
                        rows={3}
                        placeholder="One answer option per line"
                        className="mt-1.5 w-full resize-none rounded-md border border-hairlineSoft bg-canvas px-2 py-1 text-[12px] text-ink focus:border-accent/60 focus:outline-none"
                      />
                    )}
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() =>
                    setDraft((d) => ({
                      ...d,
                      questions: [
                        ...d.questions,
                        {
                          id: newQuestionId(),
                          kind: 'short_text',
                          prompt: '',
                          choices: [],
                          required: false,
                        },
                      ],
                    }))
                  }
                  className="self-start rounded-md border border-hairlineSoft px-2.5 py-1 text-[11.5px] text-ink hover:bg-white/5"
                >
                  + Add question
                </button>
              </div>
            </Field>

            <Field label="Response limit (optional)">
              <input
                value={draft.responseLimit}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, responseLimit: e.target.value }))
                }
                placeholder="Leave blank for unlimited"
                inputMode="numeric"
                className={`${inputClass} w-44`}
              />
            </Field>

            {saveError && (
              <div className="mb-2 rounded-md border border-red-400/30 bg-red-400/10 px-3 py-2 text-[11.5px] text-red-300">
                {saveError}
              </div>
            )}

            <div className="mt-2 flex items-center justify-between">
              <button
                onClick={() => setView('list')}
                className="rounded-md px-3 py-1.5 text-[12px] text-inkMute hover:bg-white/5 hover:text-ink"
              >
                Back
              </button>
              <button
                onClick={() => void save()}
                disabled={saving}
                className="rounded-md bg-accent px-3 py-1.5 text-[12.5px] font-medium text-white hover:bg-accentSoft disabled:opacity-50"
              >
                {saving
                  ? 'Saving…'
                  : editingTestId
                    ? 'Save changes'
                    : 'Create test'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function SessionCard({
  session,
  tasks,
  questionnaire,
}: {
  session: TestSession;
  tasks: TestTask[];
  questionnaire: TestQuestion[];
}) {
  const taskTitle = (taskId: string, idx: number) =>
    tasks.find((t) => t.id === taskId)?.title ?? `Task ${idx + 1}`;
  const recordingSrc = session.recordingUrl
    ? resolveApiUrl(session.recordingUrl)
    : null;
  const started = new Date(session.startedAt);

  return (
    <div className="rounded-lg border border-hairlineSoft bg-canvas/60 px-3 py-2.5">
      <div className="flex items-center gap-2">
        <span className="text-[12.5px] font-medium text-ink">
          {session.testerLabel}
        </span>
        <span className="rounded border border-hairlineSoft px-1.5 py-0.5 text-[10px] uppercase tracking-[0.08em] text-inkMute">
          {session.status}
        </span>
        <span className="ml-auto text-[11px] text-inkFaint">
          {started.toLocaleString()} · {formatDuration(session.recordingDurationMs)}
        </span>
      </div>

      {recordingSrc ? (
        <div className="mt-2">
          <WaveformPlayer
            src={recordingSrc}
            recordingMode={session.recordingMode}
            durationMs={session.recordingDurationMs}
          />
        </div>
      ) : (
        <div className="mt-2 rounded-md border border-hairlineSoft bg-canvas/80 px-2.5 py-2 text-[11px] text-inkFaint">
          No recording uploaded for this session.
        </div>
      )}

      {(session.taskResults?.length ?? 0) > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {session.taskResults!.map((r, i) => (
            <span
              key={r.taskId + i}
              className={
                'rounded-md border px-1.5 py-0.5 text-[10.5px] ' +
                (r.outcome === 'completed'
                  ? 'border-ok/40 bg-ok/10 text-ok'
                  : 'border-hairlineSoft text-inkMute')
              }
              title={`${formatDuration(r.durationMs)} · at ${formatDuration(r.recordingOffsetMs)}`}
            >
              {r.outcome === 'completed'
                ? '✓'
                : r.outcome === 'skipped'
                  ? '⤼'
                  : '✕'}{' '}
              {taskTitle(r.taskId, i)}
            </span>
          ))}
        </div>
      )}

      {(session.responses?.length ?? 0) > 0 && (
        <div className="mt-2 border-t border-hairlineSoft pt-2">
          {session.responses!.map((resp) => {
            const q = questionnaire.find((x) => x.id === resp.questionId);
            const value = Array.isArray(resp.value)
              ? resp.value.join(', ')
              : resp.value;
            return (
              <div key={resp.questionId} className="mb-1 last:mb-0">
                <div className="text-[11px] text-inkFaint">
                  {q?.prompt ?? resp.questionId}
                </div>
                <div className="text-[12px] text-ink">{value || '—'}</div>
              </div>
            );
          })}
        </div>
      )}

      <TranscriptBlock session={session} />
      <SynthesisBlock session={session} tasks={tasks} />
    </div>
  );
}

function TranscriptBlock({ session }: { session: TestSession }) {
  const cues = session.transcript ?? [];
  if (cues.length > 0) {
    return (
      <div className="mt-2 border-t border-hairlineSoft pt-2">
        <div className="mb-1 text-[11px] uppercase tracking-[0.08em] text-inkFaint">
          Transcript
          {session.transcriptStatus === 'processing' && ' · updating…'}
        </div>
        <div className="max-h-40 overflow-y-auto rounded-md border border-hairlineSoft bg-canvas/80 px-2 py-1.5">
          {cues.map((cue, i) => (
            <div
              key={`${cue.startMs}-${i}`}
              className="flex gap-2 py-0.5 text-[12px] leading-relaxed"
            >
              <span className="shrink-0 font-mono text-[10.5px] text-inkFaint">
                {formatDuration(cue.startMs)}
              </span>
              <span className="text-ink">{cue.text}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }
  if (session.transcriptStatus === 'processing') {
    return (
      <div className="mt-2 border-t border-hairlineSoft pt-2 text-[11px] text-inkMute">
        Transcribing…
      </div>
    );
  }
  if (session.transcriptStatus === 'failed') {
    return (
      <div className="mt-2 border-t border-hairlineSoft pt-2 text-[11px] text-inkFaint">
        Transcription failed.
      </div>
    );
  }
  // pending / skipped — stay quiet, nothing useful to show yet.
  return null;
}

const SEVERITY_DOT: Record<IssueSeverity, string> = {
  low: 'bg-inkMute',
  medium: 'bg-warn',
  high: 'bg-red-400',
};

function SynthesisBlock({
  session,
  tasks,
}: {
  session: TestSession;
  tasks: TestTask[];
}) {
  const synthesis = session.synthesis;
  if (!synthesis) return null;
  const taskTitle = (taskId?: string) =>
    taskId ? tasks.find((t) => t.id === taskId)?.title : undefined;
  return (
    <div className="mt-2 border-t border-hairlineSoft pt-2">
      <div className="mb-1 text-[11px] uppercase tracking-[0.08em] text-inkFaint">
        AI synthesis
      </div>
      {synthesis.summary && (
        <div className="text-[12px] leading-relaxed text-ink">
          {synthesis.summary}
        </div>
      )}
      {synthesis.issues.length > 0 && (
        <div className="mt-1.5 flex flex-col gap-1">
          {synthesis.issues.map((issue, i) => {
            const title = taskTitle(issue.taskId);
            return (
              <div key={i} className="flex items-start gap-2">
                <span
                  className={`mt-[5px] h-1.5 w-1.5 shrink-0 rounded-full ${SEVERITY_DOT[issue.severity]}`}
                  title={`${issue.severity} severity`}
                />
                <span className="text-[12px] leading-relaxed text-inkMute">
                  {issue.text}
                  {(title || issue.atMs !== undefined) && (
                    <span className="text-inkFaint">
                      {' '}
                      ·{title ? ` ${title}` : ''}
                      {issue.atMs !== undefined
                        ? ` ${formatDuration(issue.atMs)}`
                        : ''}
                    </span>
                  )}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ResultsStats({
  sessions,
  tasks,
}: {
  sessions: TestSession[];
  tasks: TestTask[];
}) {
  const total = sessions.length;
  const completed = sessions.filter((s) => s.status === 'completed').length;
  const completedSessions = sessions.filter((s) => s.status === 'completed');

  // Per-task tallies across completed sessions.
  const perTask = tasks.map((task, idx) => {
    let done = 0;
    let skipped = 0;
    let gaveUp = 0;
    for (const s of completedSessions) {
      for (const r of s.taskResults ?? []) {
        if (r.taskId !== task.id) continue;
        if (r.outcome === 'completed') done += 1;
        else if (r.outcome === 'skipped') skipped += 1;
        else gaveUp += 1;
      }
    }
    return { task, idx, done, skipped, gaveUp };
  });
  const hasTaskData = perTask.some(
    (t) => t.done + t.skipped + t.gaveUp > 0,
  );

  return (
    <div className="rounded-lg border border-hairlineSoft bg-canvas/40 px-3 py-2.5">
      <div className="flex items-center gap-4 text-[12px] text-inkMute">
        <span>
          <span className="text-[14px] font-medium text-ink">{total}</span>{' '}
          session{total === 1 ? '' : 's'}
        </span>
        <span>
          <span className="text-[14px] font-medium text-ok">{completed}</span>{' '}
          completed
        </span>
      </div>
      {completedSessions.length > 0 && hasTaskData && (
        <div className="mt-2 flex flex-col gap-1 border-t border-hairlineSoft pt-2">
          {perTask.map(({ task, idx, done, skipped, gaveUp }) => {
            const seen = done + skipped + gaveUp;
            return (
              <div
                key={task.id}
                className="flex items-center gap-2 text-[11.5px]"
              >
                <span className="min-w-0 flex-1 truncate text-ink">
                  {idx + 1}. {task.title}
                </span>
                <span className="shrink-0 text-inkMute">
                  <span className="text-ok">{done}✓</span>
                  {skipped > 0 && (
                    <span className="text-inkFaint"> · {skipped}⤼</span>
                  )}
                  {gaveUp > 0 && (
                    <span className="text-red-300"> · {gaveUp}✕</span>
                  )}
                  <span className="text-inkFaint"> / {seen}</span>
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

const inputClass =
  'w-full rounded-md border border-hairlineSoft bg-canvas px-2.5 py-1.5 text-[12px] text-ink focus:border-accent/60 focus:outline-none';

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-3">
      <label className="mb-1 block text-[11px] uppercase tracking-[0.1em] text-inkFaint">
        {label}
      </label>
      {children}
    </div>
  );
}

function StatusBadge({ status }: { status: TestStatus }) {
  const map: Record<TestStatus, { label: string; cls: string }> = {
    draft: { label: 'Draft', cls: 'border-hairlineSoft text-inkMute' },
    live: { label: 'Live', cls: 'border-ok/40 bg-ok/15 text-ok' },
    closed: { label: 'Closed', cls: 'border-hairlineSoft text-inkFaint' },
  };
  const { label, cls } = map[status];
  return (
    <span
      className={`rounded border px-1.5 py-0.5 text-[10px] uppercase tracking-[0.08em] ${cls}`}
    >
      {label}
    </span>
  );
}

function CloseGlyph() {
  return (
    <svg width="10" height="10" viewBox="0 0 16 16">
      <path
        d="M4 4l8 8M12 4l-8 8"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function TestsIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path
        d="M6 2.5h4M6.8 2.5v4.2L3.8 12a1 1 0 0 0 .9 1.5h6.6a1 1 0 0 0 .9-1.5L9.2 6.7V2.5"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M5.4 9.5h5.2"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 16 16">
      <path
        d="M8 3v10M3 8h10"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}
