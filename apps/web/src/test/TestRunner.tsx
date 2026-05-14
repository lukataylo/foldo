import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  AbandonTestSessionRequest,
  PublicTestResponse,
  RecordingMode,
  TestQuestion,
  TestResponseAnswer,
  TestTaskResult,
} from '@foldo/protocol';
import {
  abandonTestSessionUrl,
  completeTestSession,
  getPublicTest,
  startTestSession,
  uploadTestRecording,
} from '../api/tests';
import { acquireMedia, startRecorder, type RecorderHandle } from './recorder';
import { Waveform } from './Waveform';
import {
  FoldoMark,
  INK,
  MarketingStyles,
  PAPER,
  PILLOW,
  SOFT_GREY,
  YELLOW,
  useMarketingTheme,
} from '../marketing/shared';

// Public tester-facing page for `/t/:token`. Walks a tester through a test:
// intro → pick recording mode + consent → grant mic/screen permission →
// task-by-task with the target app on screen and a live recording → upload
// the recording + task results → thank-you.

type Phase =
  | 'loading'
  | 'error'
  | 'intro'
  | 'setup'
  | 'running'
  | 'questions'
  | 'uploading'
  | 'done';
type Outcome = 'completed' | 'skipped';
type ResponseMap = Record<string, string | string[]>;

const MODE_INFO: Record<RecordingMode, { label: string; blurb: string }> = {
  screen_voice: {
    label: 'Screen + voice',
    blurb:
      'Records your screen and your microphone. Your browser will ask which screen or tab to share.',
  },
  voice_only: {
    label: 'Voice only',
    blurb: 'Records your microphone only — no screen capture.',
  },
  screen_only: {
    label: 'Screen only',
    blurb: 'Records your screen only — no microphone.',
  },
};

function getTokenFromPath(): string | null {
  if (typeof location === 'undefined') return null;
  const m = /^\/t\/([^/?#]+)/.exec(location.pathname);
  return m ? decodeURIComponent(m[1]) : null;
}

function formatMs(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export default function TestRunner() {
  useMarketingTheme('Foldo · User test');
  const token = useMemo(getTokenFromPath, []);

  const [phase, setPhase] = useState<Phase>('loading');
  const [test, setTest] = useState<PublicTestResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [taskIndex, setTaskIndex] = useState(0);

  // setup
  const [recordingMode, setRecordingMode] = useState<RecordingMode | null>(null);
  const [consented, setConsented] = useState(false);
  const [acquiring, setAcquiring] = useState(false);
  const [setupError, setSetupError] = useState<string | null>(null);

  // running
  const [elapsedMs, setElapsedMs] = useState(0);

  // questionnaire
  const [responses, setResponses] = useState<ResponseMap>({});
  const [questionsError, setQuestionsError] = useState<string | null>(null);

  // uploading / done
  const [uploadStatus, setUploadStatus] = useState('');
  const [uploadWarning, setUploadWarning] = useState<string | null>(null);
  const [outcomes, setOutcomes] = useState<Outcome[]>([]);

  const recorderRef = useRef<RecorderHandle | null>(null);
  const sessionRef = useRef<{ id: string; token: string } | null>(null);
  const recordingStartRef = useRef(0);
  const taskStartRef = useRef(0);
  const taskResultsRef = useRef<TestTaskResult[]>([]);
  const responsesRef = useRef<ResponseMap>({});
  const finishingRef = useRef(false);

  // Load the test definition.
  useEffect(() => {
    if (!token) {
      setPhase('error');
      setError('This test link looks malformed.');
      return;
    }
    let cancelled = false;
    getPublicTest(token)
      .then((t) => {
        if (cancelled) return;
        setTest(t);
        setRecordingMode(t.recordingModes[0] ?? null);
        setPhase('intro');
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        const status = (e as { status?: number }).status;
        setPhase('error');
        setError(
          status === 404
            ? "This test isn't available — the link may be wrong, or it hasn't been published yet."
            : status === 410
              ? 'This test has reached its response limit. Thanks anyway!'
              : e instanceof Error
                ? e.message
                : 'Could not load this test.',
        );
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  // Live REC timer while running.
  useEffect(() => {
    if (phase !== 'running') return;
    const id = setInterval(() => {
      setElapsedMs(recorderRef.current?.elapsedMs() ?? 0);
    }, 500);
    return () => clearInterval(id);
  }, [phase]);

  // Release the camera/screen/mic if the tester closes the tab mid-session.
  useEffect(() => {
    return () => recorderRef.current?.cancel();
  }, []);

  // Tab-close recovery: while a session is live (recording → questions →
  // uploading, but not yet done), beacon the server so it can mark the session
  // `abandoned` instead of leaving it dangling forever. sendBeacon survives the
  // page unload that a normal fetch wouldn't.
  useEffect(() => {
    const sessionLive =
      token != null &&
      (phase === 'running' || phase === 'questions' || phase === 'uploading');
    if (!sessionLive) return;

    const beacon = () => {
      const session = sessionRef.current;
      if (!session || typeof navigator.sendBeacon !== 'function') return;
      const body: AbandonTestSessionRequest = {
        sessionToken: session.token,
        recordingDurationMs: recorderRef.current?.elapsedMs(),
      };
      const blob = new Blob([JSON.stringify(body)], {
        type: 'application/json',
      });
      try {
        navigator.sendBeacon(abandonTestSessionUrl(token, session.id), blob);
      } catch {
        /* nothing more we can do as the tab is going away */
      }
    };

    window.addEventListener('pagehide', beacon);
    window.addEventListener('beforeunload', beacon);
    return () => {
      window.removeEventListener('pagehide', beacon);
      window.removeEventListener('beforeunload', beacon);
    };
  }, [phase, token]);

  const tasks = test?.tasks ?? [];

  const finish = useCallback(async () => {
    if (finishingRef.current) return;
    finishingRef.current = true;
    setPhase('uploading');
    setUploadWarning(null);

    const recorder = recorderRef.current;
    const session = sessionRef.current;
    if (!recorder || !session || !token) {
      setPhase('done');
      return;
    }

    let blob = new Blob();
    let durationMs = recorder.elapsedMs();
    try {
      setUploadStatus('Finishing the recording…');
      const res = await recorder.stop();
      blob = res.blob;
      durationMs = res.durationMs;
    } catch {
      /* fall through — we still try to save the session */
    }
    recorderRef.current = null;

    if (blob.size > 0) {
      try {
        setUploadStatus('Uploading your recording…');
        await uploadTestRecording(
          token,
          session.id,
          session.token,
          blob,
          durationMs,
        );
      } catch (e) {
        setUploadWarning(
          e instanceof Error
            ? `Your recording didn't upload (${e.message}), but your answers were saved.`
            : "Your recording didn't upload, but your answers were saved.",
        );
      }
    }

    const answers: TestResponseAnswer[] = Object.entries(responsesRef.current)
      .filter(([, v]) => (Array.isArray(v) ? v.length > 0 : v !== ''))
      .map(([questionId, value]) => ({ questionId, value }));

    try {
      setUploadStatus('Saving your answers…');
      await completeTestSession(token, session.id, session.token, {
        taskResults: taskResultsRef.current,
        responses: answers,
        recordingDurationMs: durationMs,
      });
    } catch (e) {
      setUploadWarning(
        e instanceof Error
          ? `We couldn't fully save this session: ${e.message}`
          : "We couldn't fully save this session.",
      );
    }
    setPhase('done');
  }, [token]);

  const beginSession = useCallback(async () => {
    if (!test || !recordingMode || !token) return;
    setSetupError(null);
    setAcquiring(true);

    let stream: MediaStream;
    try {
      stream = await acquireMedia(recordingMode);
    } catch (e) {
      setAcquiring(false);
      setSetupError(
        e instanceof Error ? e.message : 'Could not start recording.',
      );
      return;
    }

    try {
      const session = await startTestSession(token, {
        recordingMode,
        testerMeta: {
          userAgent: navigator.userAgent,
          language: navigator.language,
          viewport: { width: window.innerWidth, height: window.innerHeight },
        },
      });
      sessionRef.current = { id: session.sessionId, token: session.sessionToken };
    } catch (e) {
      stream.getTracks().forEach((t) => t.stop());
      setAcquiring(false);
      setSetupError(
        e instanceof Error ? e.message : 'Could not start the session.',
      );
      return;
    }

    const handle = startRecorder(stream);
    handle.onEnded(() => void finish());
    recorderRef.current = handle;
    recordingStartRef.current = Date.now();
    taskStartRef.current = Date.now();
    taskResultsRef.current = [];
    finishingRef.current = false;
    setOutcomes([]);
    setTaskIndex(0);
    setElapsedMs(0);
    setAcquiring(false);

    if (tasks.length === 0) {
      void finish();
    } else {
      setPhase('running');
    }
  }, [test, recordingMode, token, tasks.length, finish]);

  const advance = useCallback(
    (outcome: Outcome) => {
      if (!test) return;
      const now = Date.now();
      const task = test.tasks[taskIndex];
      taskResultsRef.current.push({
        taskId: task.id,
        outcome,
        durationMs: now - taskStartRef.current,
        recordingOffsetMs: taskStartRef.current - recordingStartRef.current,
      });
      setOutcomes((o) => [...o, outcome]);
      if (taskIndex + 1 >= test.tasks.length) {
        if ((test.questionnaire?.length ?? 0) > 0) {
          setQuestionsError(null);
          setPhase('questions');
        } else {
          void finish();
        }
      } else {
        taskStartRef.current = now;
        setTaskIndex((i) => i + 1);
      }
    },
    [test, taskIndex, finish],
  );

  const setResponse = useCallback(
    (questionId: string, value: string | string[]) => {
      responsesRef.current = { ...responsesRef.current, [questionId]: value };
      setResponses({ ...responsesRef.current });
    },
    [],
  );

  const submitQuestionnaire = useCallback(() => {
    if (!test) return;
    for (const q of test.questionnaire ?? []) {
      if (!q.required) continue;
      const v = responsesRef.current[q.id];
      const empty =
        v === undefined || (Array.isArray(v) ? v.length === 0 : v === '');
      if (empty) {
        setQuestionsError(`“${q.prompt}” is required.`);
        return;
      }
    }
    setQuestionsError(null);
    void finish();
  }, [test, finish]);

  // ---------- render ----------

  if (phase === 'loading') {
    return (
      <Shell>
        <Centered>
          <p className="body-font" style={{ color: '#7a756c', fontSize: 15 }}>
            Loading test…
          </p>
        </Centered>
      </Shell>
    );
  }

  if (phase === 'error' || !test || !recordingMode) {
    return (
      <Shell>
        <Centered>
          <Card>
            <Mark />
            <h1
              className="display"
              style={{ fontSize: 30, margin: '18px 0 8px', color: INK }}
            >
              Hmm.
            </h1>
            <p
              className="body-font"
              style={{ fontSize: 15, lineHeight: 1.6, color: '#5c574f' }}
            >
              {error ?? 'Could not load this test.'}
            </p>
          </Card>
        </Centered>
      </Shell>
    );
  }

  if (phase === 'intro') {
    return (
      <Shell>
        <Centered>
          <Card>
            <Mark />
            <div
              className="body-font"
              style={{
                fontSize: 12,
                letterSpacing: '0.14em',
                textTransform: 'uppercase',
                color: '#9b948a',
                margin: '20px 0 6px',
              }}
            >
              User test
            </div>
            <h1
              className="display"
              style={{ fontSize: 34, lineHeight: 1.1, color: INK, margin: 0 }}
            >
              {test.name}
            </h1>
            {test.intro && (
              <p
                className="body-font"
                style={{
                  fontSize: 15,
                  lineHeight: 1.65,
                  color: '#5c574f',
                  margin: '14px 0 0',
                }}
              >
                {test.intro}
              </p>
            )}
            <div
              className="body-font"
              style={{
                display: 'flex',
                justifyContent: 'center',
                gap: 18,
                margin: '20px 0 22px',
                fontSize: 13.5,
                color: '#7a756c',
              }}
            >
              <span>
                <strong style={{ color: INK }}>{tasks.length}</strong>{' '}
                {tasks.length === 1 ? 'task' : 'tasks'}
              </span>
              <span>·</span>
              <span>a few minutes</span>
            </div>
            <button onClick={() => setPhase('setup')} style={primaryBtn}>
              Continue
            </button>
          </Card>
        </Centered>
      </Shell>
    );
  }

  if (phase === 'setup') {
    return (
      <Shell>
        <Centered>
          <Card>
            <h1
              className="display"
              style={{ fontSize: 26, color: INK, margin: '0 0 6px' }}
            >
              Before you start
            </h1>
            <p
              className="body-font"
              style={{
                fontSize: 14,
                lineHeight: 1.6,
                color: '#5c574f',
                margin: '0 0 18px',
              }}
            >
              We’ll record this session so the team can watch it back. Pick how
              you’d like to be recorded.
            </p>

            <div style={{ textAlign: 'left', marginBottom: 16 }}>
              {test.recordingModes.map((m) => {
                const on = recordingMode === m;
                return (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setRecordingMode(m)}
                    style={{
                      display: 'block',
                      width: '100%',
                      textAlign: 'left',
                      background: on ? '#FFF8E6' : '#fff',
                      border: `1.5px solid ${on ? PILLOW : SOFT_GREY}`,
                      borderRadius: 12,
                      padding: '11px 13px',
                      marginBottom: 8,
                      cursor: 'pointer',
                      fontFamily: '"Inter", ui-sans-serif, system-ui, sans-serif',
                    }}
                  >
                    <div
                      style={{ fontSize: 14, fontWeight: 600, color: INK }}
                    >
                      {MODE_INFO[m].label}
                    </div>
                    <div
                      style={{
                        fontSize: 12.5,
                        lineHeight: 1.5,
                        color: '#7a756c',
                        marginTop: 2,
                      }}
                    >
                      {MODE_INFO[m].blurb}
                    </div>
                  </button>
                );
              })}
            </div>

            <label
              className="body-font"
              style={{
                display: 'flex',
                gap: 9,
                alignItems: 'flex-start',
                textAlign: 'left',
                fontSize: 13,
                lineHeight: 1.5,
                color: '#5c574f',
                marginBottom: 16,
                cursor: 'pointer',
              }}
            >
              <input
                type="checkbox"
                checked={consented}
                onChange={(e) => setConsented(e.target.checked)}
                style={{ marginTop: 2, accentColor: PILLOW }}
              />
              <span>
                I understand this session will be recorded
                {recordingMode === 'voice_only'
                  ? ' (microphone)'
                  : recordingMode === 'screen_only'
                    ? ' (screen)'
                    : ' (screen and microphone)'}{' '}
                and shared with the team running this test.
              </span>
            </label>

            {setupError && (
              <div
                className="body-font"
                style={{
                  background: '#FDECEA',
                  border: '1px solid #F3C9C4',
                  color: '#9B271B',
                  borderRadius: 10,
                  padding: '9px 12px',
                  fontSize: 12.5,
                  lineHeight: 1.5,
                  marginBottom: 14,
                  textAlign: 'left',
                }}
              >
                {setupError}
              </div>
            )}

            <button
              onClick={() => void beginSession()}
              disabled={!consented || acquiring}
              style={{
                ...primaryBtn,
                opacity: !consented || acquiring ? 0.5 : 1,
                cursor: !consented || acquiring ? 'default' : 'pointer',
              }}
            >
              {acquiring ? 'Waiting for permission…' : 'Start the test'}
            </button>
            <p
              className="body-font"
              style={{
                fontSize: 11.5,
                color: '#9b948a',
                margin: '14px 0 0',
                lineHeight: 1.5,
              }}
            >
              Your browser will ask for{' '}
              {recordingMode === 'voice_only'
                ? 'microphone access'
                : recordingMode === 'screen_only'
                  ? 'screen-sharing access'
                  : 'screen-sharing and microphone access'}
              .
            </p>
          </Card>
        </Centered>
      </Shell>
    );
  }

  if (phase === 'uploading') {
    return (
      <Shell>
        <Centered>
          <Card>
            <Mark />
            <h1
              className="display"
              style={{ fontSize: 28, margin: '18px 0 8px', color: INK }}
            >
              Wrapping up…
            </h1>
            <p
              className="body-font"
              style={{ fontSize: 14, lineHeight: 1.6, color: '#5c574f' }}
            >
              {uploadStatus || 'Saving your session…'}
            </p>
            <p
              className="body-font"
              style={{ fontSize: 12, color: '#9b948a', margin: '12px 0 0' }}
            >
              Please keep this tab open for a moment.
            </p>
          </Card>
        </Centered>
      </Shell>
    );
  }

  if (phase === 'done') {
    const completed = outcomes.filter((o) => o === 'completed').length;
    const skipped = outcomes.filter((o) => o === 'skipped').length;
    return (
      <Shell>
        <Centered>
          <Card>
            <Mark />
            <h1
              className="display"
              style={{ fontSize: 34, margin: '18px 0 8px', color: INK }}
            >
              Thanks!
            </h1>
            <p
              className="body-font"
              style={{ fontSize: 15, lineHeight: 1.65, color: '#5c574f' }}
            >
              You finished “{test.name}”. Your session has been sent to the
              team — you can close this tab now.
            </p>
            {outcomes.length > 0 && (
              <div
                className="body-font"
                style={{
                  display: 'flex',
                  gap: 16,
                  justifyContent: 'center',
                  margin: '18px 0 0',
                  fontSize: 13.5,
                  color: '#7a756c',
                }}
              >
                <span>
                  <strong style={{ color: INK }}>{completed}</strong> completed
                </span>
                {skipped > 0 && (
                  <span>
                    <strong style={{ color: INK }}>{skipped}</strong> skipped
                  </span>
                )}
              </div>
            )}
            {uploadWarning && (
              <p
                className="body-font"
                style={{
                  fontSize: 12,
                  color: '#9B6A1B',
                  background: '#FFF6E0',
                  border: '1px solid #F0DCA8',
                  borderRadius: 10,
                  padding: '9px 12px',
                  margin: '16px 0 0',
                  lineHeight: 1.5,
                }}
              >
                {uploadWarning}
              </p>
            )}
          </Card>
        </Centered>
      </Shell>
    );
  }

  if (phase === 'questions') {
    const questions = test.questionnaire ?? [];
    return (
      <Shell>
        <Centered>
          <Card>
            <h1
              className="display"
              style={{ fontSize: 26, color: INK, margin: '0 0 6px' }}
            >
              A few last questions
            </h1>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                margin: '0 0 18px',
              }}
            >
              <span
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: 999,
                  background: '#FF5A5A',
                  boxShadow: '0 0 6px #FF5A5A',
                  animation: 'foldoRecBlink 1.4s ease-in-out infinite',
                }}
              />
              <span
                className="body-font"
                style={{ fontSize: 13.5, color: '#5c574f' }}
              >
                Still recording — just a couple of questions to go.
              </span>
            </div>
            <div style={{ textAlign: 'left' }}>
              {questions.map((q) => (
                <QuestionField
                  key={q.id}
                  question={q}
                  value={responses[q.id]}
                  onChange={(v) => setResponse(q.id, v)}
                />
              ))}
            </div>
            {questionsError && (
              <div
                className="body-font"
                style={{
                  background: '#FDECEA',
                  border: '1px solid #F3C9C4',
                  color: '#9B271B',
                  borderRadius: 10,
                  padding: '9px 12px',
                  fontSize: 12.5,
                  lineHeight: 1.5,
                  margin: '4px 0 14px',
                  textAlign: 'left',
                }}
              >
                {questionsError}
              </div>
            )}
            <button onClick={submitQuestionnaire} style={primaryBtn}>
              Finish
            </button>
          </Card>
        </Centered>
      </Shell>
    );
  }

  // phase === 'running'
  const task = tasks[taskIndex];
  const targetUrl = task.startUrl ?? test.targetUrl ?? '';

  return (
    <Shell>
      <div
        style={{
          position: 'fixed',
          inset: 0,
          display: 'flex',
          flexDirection: 'column',
          background: PAPER,
        }}
      >
        {/* task banner */}
        <div
          style={{
            background: INK,
            color: PAPER,
            padding: '11px 18px',
            display: 'flex',
            alignItems: 'center',
            gap: 16,
            flexShrink: 0,
          }}
        >
          <RecPill elapsedMs={elapsedMs} />
          <div
            style={{
              flexShrink: 0,
              padding: '4px 8px',
              borderRadius: 8,
              background: 'rgba(253,247,239,0.08)',
            }}
          >
            <Waveform
              stream={recorderRef.current?.stream ?? null}
              color={PAPER}
            />
          </div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div
              className="body-font"
              style={{
                fontSize: 11,
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                color: YELLOW,
                marginBottom: 2,
              }}
            >
              Task {taskIndex + 1} of {tasks.length} · {task.title}
            </div>
            <div
              className="body-font"
              style={{ fontSize: 14.5, lineHeight: 1.45 }}
            >
              {task.instruction}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
            <button onClick={() => advance('skipped')} style={ghostBtnDark}>
              Skip
            </button>
            <button onClick={() => advance('completed')} style={primaryBtn}>
              {taskIndex + 1 >= tasks.length ? 'Finish' : 'I did it'}
            </button>
          </div>
        </div>

        {/* target */}
        <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
          {test.deliveryMode === 'iframe' && targetUrl ? (
            <iframe
              key={targetUrl}
              src={targetUrl}
              title="App under test"
              style={{ width: '100%', height: '100%', border: 'none' }}
            />
          ) : test.deliveryMode === 'handoff' ? (
            <Centered>
              <Card>
                <h2
                  className="display"
                  style={{ fontSize: 24, color: INK, margin: '0 0 8px' }}
                >
                  Open the app in a new tab
                </h2>
                <p
                  className="body-font"
                  style={{
                    fontSize: 14,
                    lineHeight: 1.6,
                    color: '#5c574f',
                    margin: '0 0 18px',
                  }}
                >
                  Keep this tab open — your task is up top here, and the
                  recording is still running. Do the task in the app, then come
                  back and pick an option above.
                </p>
                {targetUrl && (
                  <button
                    onClick={() =>
                      window.open(targetUrl, '_blank', 'noopener,noreferrer')
                    }
                    style={primaryBtn}
                  >
                    Open the app ↗
                  </button>
                )}
              </Card>
            </Centered>
          ) : (
            <Centered>
              <Card>
                <p
                  className="body-font"
                  style={{ fontSize: 14, lineHeight: 1.6, color: '#5c574f' }}
                >
                  This test uses DOM-snapshot mode, which isn’t available in
                  this preview yet. You can still step through the tasks using
                  the banner above.
                </p>
              </Card>
            </Centered>
          )}
        </div>
      </div>
    </Shell>
  );
}

// ---------- pieces ----------

function RecPill({ elapsedMs }: { elapsedMs: number }) {
  return (
    <div
      className="body-font"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        flexShrink: 0,
        fontSize: 12,
        fontWeight: 600,
        letterSpacing: '0.04em',
      }}
    >
      <span
        style={{
          width: 8,
          height: 8,
          borderRadius: 999,
          background: '#FF5A5A',
          boxShadow: '0 0 6px #FF5A5A',
          animation: 'foldoRecBlink 1.4s ease-in-out infinite',
        }}
      />
      <span>{formatMs(elapsedMs)}</span>
    </div>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        background: PAPER,
        color: INK,
        minHeight: '100vh',
        fontFamily: '"Inter", ui-sans-serif, system-ui, sans-serif',
      }}
    >
      <MarketingStyles />
      <style>{`@keyframes foldoRecBlink{0%,100%{opacity:1}50%{opacity:0.25}}`}</style>
      {children}
    </div>
  );
}

// FoldoMark renders as a `display: block` <img>, so it ignores the card's
// text-align: center — wrap it so it sits centred like everything else.
function Mark() {
  return (
    <div style={{ display: 'flex', justifyContent: 'center' }}>
      <FoldoMark size={34} />
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
      }}
    >
      {children}
    </div>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        background: '#fff',
        border: `1px solid ${SOFT_GREY}`,
        borderRadius: 20,
        padding: '32px 30px',
        maxWidth: 460,
        width: '100%',
        textAlign: 'center',
        boxShadow: '0 1px 0 rgba(0,0,0,0.02)',
      }}
    >
      {children}
    </div>
  );
}

const qInput: React.CSSProperties = {
  width: '100%',
  border: `1px solid ${SOFT_GREY}`,
  borderRadius: 10,
  padding: '8px 10px',
  fontSize: 13,
  color: INK,
  background: '#fff',
  fontFamily: '"Inter", ui-sans-serif, system-ui, sans-serif',
};

function QuestionField({
  question,
  value,
  onChange,
}: {
  question: TestQuestion;
  value: string | string[] | undefined;
  onChange: (v: string | string[]) => void;
}) {
  let control: React.ReactNode;

  if (question.kind === 'short_text') {
    control = (
      <input
        value={typeof value === 'string' ? value : ''}
        onChange={(e) => onChange(e.target.value)}
        style={qInput}
      />
    );
  } else if (question.kind === 'long_text') {
    control = (
      <textarea
        rows={3}
        value={typeof value === 'string' ? value : ''}
        onChange={(e) => onChange(e.target.value)}
        style={{ ...qInput, resize: 'vertical' }}
      />
    );
  } else if (question.kind === 'rating') {
    control = (
      <div style={{ display: 'flex', gap: 8 }}>
        {[1, 2, 3, 4, 5].map((n) => {
          const on = value === String(n);
          return (
            <button
              key={n}
              type="button"
              onClick={() => onChange(String(n))}
              style={{
                width: 38,
                height: 38,
                borderRadius: 10,
                cursor: 'pointer',
                border: `1.5px solid ${on ? PILLOW : SOFT_GREY}`,
                background: on ? '#FFF8E6' : '#fff',
                color: INK,
                fontWeight: 600,
                fontSize: 14,
                fontFamily: '"Inter", ui-sans-serif, system-ui, sans-serif',
              }}
            >
              {n}
            </button>
          );
        })}
      </div>
    );
  } else {
    const choices = question.choices ?? [];
    const multi = question.kind === 'multi_choice';
    const selected = Array.isArray(value)
      ? value
      : typeof value === 'string' && value
        ? [value]
        : [];
    control = (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {choices.map((c) => {
          const on = selected.includes(c);
          return (
            <label
              key={c}
              className="body-font"
              style={{
                display: 'flex',
                gap: 8,
                alignItems: 'center',
                fontSize: 13,
                color: '#3f3a33',
                cursor: 'pointer',
              }}
            >
              <input
                type={multi ? 'checkbox' : 'radio'}
                checked={on}
                onChange={() =>
                  onChange(
                    multi
                      ? on
                        ? selected.filter((x) => x !== c)
                        : [...selected, c]
                      : c,
                  )
                }
                style={{ accentColor: PILLOW }}
              />
              {c}
            </label>
          );
        })}
      </div>
    );
  }

  return (
    <div style={{ marginBottom: 16 }}>
      <div
        className="body-font"
        style={{
          fontSize: 13,
          fontWeight: 600,
          color: INK,
          marginBottom: 6,
        }}
      >
        {question.prompt}
        {question.required && <span style={{ color: '#C0392B' }}> *</span>}
      </div>
      {control}
    </div>
  );
}

const primaryBtn: React.CSSProperties = {
  background: YELLOW,
  color: INK,
  border: 'none',
  borderRadius: 999,
  padding: '10px 22px',
  fontSize: 14,
  fontWeight: 600,
  cursor: 'pointer',
  fontFamily: '"Inter", ui-sans-serif, system-ui, sans-serif',
  boxShadow: `0 2px 0 ${PILLOW}`,
};

const ghostBtnDark: React.CSSProperties = {
  background: 'transparent',
  color: PAPER,
  border: '1px solid rgba(253,247,239,0.3)',
  borderRadius: 999,
  padding: '10px 18px',
  fontSize: 14,
  fontWeight: 500,
  cursor: 'pointer',
  fontFamily: '"Inter", ui-sans-serif, system-ui, sans-serif',
};
