// Test session frame — one completed unmoderated-test session, rendered on the
// canvas. Shows the recording (WaveformPlayer), per-task outcome chips,
// questionnaire answers, the transcript, and the AI synthesis. Each synthesis
// issue exposes a "Make this an edit" action that drops a comment on the frame
// (wired through App.tsx so it shares the online/offline comment-create path).

import type { HTMLAttributes } from 'react';
import type {
  Branch,
  Frame,
  TestSessionFrameContent,
  TestSessionIssue,
  TestTaskOutcome,
  TestTaskResult,
  TestResponseAnswer,
  TranscriptCue,
  TranscriptStatus,
} from '@foldo/protocol';
import { FrameShell } from './FrameShell';
import { frameStyleToCss } from '../plugins/frameStyle';
import { API_BASE } from '../api/client';
import { WaveformPlayer } from '../test/WaveformPlayer';

interface Props {
  frame: Frame;
  branch: Branch;
  /** Drop a comment on this frame from a synthesis issue ("Make this an edit"). */
  onMakeEditFromIssue: (frame: Frame, issue: TestSessionIssue) => void;
  wrapperProps?: HTMLAttributes<HTMLDivElement>;
}

const OUTCOME_STYLE: Record<
  TestTaskOutcome,
  { label: string; cls: string; dot: string }
> = {
  completed: {
    label: 'done',
    cls: 'border-ok/40 bg-ok/15 text-ok',
    dot: 'bg-ok',
  },
  skipped: {
    label: 'skipped',
    cls: 'border-warn/40 bg-warn/15 text-warn',
    dot: 'bg-warn',
  },
  gave_up: {
    label: 'gave up',
    cls: 'border-red-400/40 bg-red-400/15 text-red-300',
    dot: 'bg-red-400/80',
  },
};

const SEVERITY_DOT: Record<TestSessionIssue['severity'], string> = {
  low: 'bg-inkMute',
  medium: 'bg-warn',
  high: 'bg-red-400',
};

const TRANSCRIPT_LABEL: Record<TranscriptStatus, string> = {
  pending: 'Transcript queued…',
  processing: 'Transcribing…',
  done: 'Transcript',
  failed: 'Transcription failed',
  skipped: 'Transcript skipped',
};

export function TestSessionFrame({
  frame,
  branch,
  onMakeEditFromIssue,
  wrapperProps,
}: Props) {
  const content = frame.content as TestSessionFrameContent;
  const recordingSrc = content.recordingUrl
    ? absoluteUrl(content.recordingUrl)
    : null;

  return (
    <FrameShell frame={frame} branch={branch} wrapperProps={wrapperProps}>
      <div
        className="flex h-full w-full flex-col overflow-hidden rounded-md border border-hairlineSoft bg-panel frame-shadow"
        style={{ pointerEvents: 'auto', ...frameStyleToCss(frame.style) }}
      >
        {/* Header — tester label + recording meta */}
        <div className="flex items-center justify-between gap-3 border-b border-hairlineSoft bg-panelMute px-4 py-3">
          <div className="flex min-w-0 items-center gap-2">
            <SessionIcon />
            <span className="truncate text-[13px] font-semibold text-ink">
              {content.testerLabel}
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-2 text-[10.5px] text-inkFaint">
            <span className="rounded-full border border-hairline bg-white/5 px-2 py-0.5 uppercase tracking-[0.05em]">
              {recordingModeLabel(content.recordingMode)}
            </span>
            {content.recordingDurationMs != null && (
              <span className="font-mono text-inkMute">
                {formatClock(content.recordingDurationMs)}
              </span>
            )}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto" data-canvas-scroll="true">
          {/* Recording */}
          <Section>
            {recordingSrc ? (
              <WaveformPlayer
                src={recordingSrc}
                recordingMode={content.recordingMode}
                durationMs={content.recordingDurationMs}
              />
            ) : (
              <div className="rounded border border-dashed border-hairlineSoft px-3 py-4 text-center text-[11.5px] text-inkFaint">
                Recording not available yet.
              </div>
            )}
          </Section>

          {/* Task results */}
          {content.taskResults.length > 0 && (
            <Section title="Tasks">
              <div className="flex flex-wrap gap-1.5">
                {content.taskResults.map((r) => (
                  <TaskChip key={r.taskId} result={r} />
                ))}
              </div>
            </Section>
          )}

          {/* Questionnaire responses */}
          {content.responses && content.responses.length > 0 && (
            <Section title="Responses">
              <ul className="flex flex-col gap-2">
                {content.responses.map((ans) => (
                  <ResponseRow key={ans.questionId} answer={ans} />
                ))}
              </ul>
            </Section>
          )}

          {/* Transcript */}
          {(content.transcript?.length || content.transcriptStatus !== 'done') && (
            <Section title={TRANSCRIPT_LABEL[content.transcriptStatus]}>
              {content.transcript && content.transcript.length > 0 ? (
                <ul className="flex flex-col gap-1">
                  {content.transcript.map((cue, i) => (
                    <TranscriptRow key={i} cue={cue} />
                  ))}
                </ul>
              ) : (
                <div className="text-[11.5px] text-inkFaint">
                  {content.transcriptStatus === 'processing' ||
                  content.transcriptStatus === 'pending'
                    ? 'The transcript will appear here once processing finishes.'
                    : content.transcriptStatus === 'failed'
                      ? 'We could not transcribe this recording.'
                      : 'No transcript for this session.'}
                </div>
              )}
            </Section>
          )}

          {/* AI synthesis */}
          {content.synthesis && (
            <Section
              title="AI synthesis"
              badge={content.synthesis.generatedBy}
            >
              <p className="text-[12px] leading-[1.55] text-ink">
                {content.synthesis.summary}
              </p>
              {content.synthesis.issues.length > 0 && (
                <ul className="mt-3 flex flex-col gap-2">
                  {content.synthesis.issues.map((issue, i) => (
                    <IssueRow
                      key={i}
                      issue={issue}
                      onMakeEdit={() => onMakeEditFromIssue(frame, issue)}
                    />
                  ))}
                </ul>
              )}
            </Section>
          )}
        </div>
      </div>
    </FrameShell>
  );
}

function Section({
  title,
  badge,
  children,
}: {
  title?: string;
  badge?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="border-b border-hairlineSoft px-4 py-3 last:border-b-0">
      {title && (
        <div className="mb-2 flex items-center gap-2">
          <span className="text-[10px] font-medium uppercase tracking-[0.08em] text-inkFaint">
            {title}
          </span>
          {badge && (
            <span className="rounded-full border border-hairline bg-white/5 px-1.5 py-[1px] font-mono text-[9px] text-inkFaint">
              {badge}
            </span>
          )}
        </div>
      )}
      {children}
    </div>
  );
}

function TaskChip({ result }: { result: TestTaskResult }) {
  const style = OUTCOME_STYLE[result.outcome] ?? OUTCOME_STYLE.skipped;
  return (
    <span
      className={
        'inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10.5px] font-medium ' +
        style.cls
      }
      title={`${style.label} · ${formatDuration(result.durationMs)}`}
    >
      <span className={'inline-block h-1.5 w-1.5 rounded-full ' + style.dot} />
      {style.label}
      <span className="font-mono text-[9.5px] opacity-70">
        {formatDuration(result.durationMs)}
      </span>
    </span>
  );
}

function ResponseRow({ answer }: { answer: TestResponseAnswer }) {
  const value = Array.isArray(answer.value)
    ? answer.value.join(', ')
    : answer.value;
  return (
    <li className="flex flex-col gap-0.5">
      <span className="font-mono text-[10px] text-inkFaint">
        {answer.questionId}
      </span>
      <span className="text-[11.5px] text-ink">{value || '—'}</span>
    </li>
  );
}

function TranscriptRow({ cue }: { cue: TranscriptCue }) {
  return (
    <li className="flex gap-2 text-[11.5px] leading-[1.5]">
      <span className="shrink-0 font-mono text-[10px] text-inkFaint">
        {formatClock(cue.startMs)}
      </span>
      <span className="text-inkMute">{cue.text}</span>
    </li>
  );
}

function IssueRow({
  issue,
  onMakeEdit,
}: {
  issue: TestSessionIssue;
  onMakeEdit: () => void;
}) {
  return (
    <li className="flex items-start gap-2 rounded border border-hairlineSoft bg-panelMute px-2.5 py-2">
      <span
        className={
          'mt-[3px] inline-block h-2 w-2 shrink-0 rounded-full ' +
          SEVERITY_DOT[issue.severity]
        }
        title={`${issue.severity} severity`}
      />
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <span className="text-[11.5px] leading-[1.5] text-ink">
          {issue.text}
        </span>
        <div className="flex items-center gap-2">
          {issue.atMs != null && (
            <span className="font-mono text-[10px] text-inkFaint">
              @ {formatClock(issue.atMs)}
            </span>
          )}
          <button
            type="button"
            data-no-drag
            onClick={(e) => {
              e.stopPropagation();
              onMakeEdit();
            }}
            className="rounded-md border border-accent/40 bg-accent/10 px-2 py-0.5 text-[10.5px] font-medium text-accent transition-colors hover:bg-accent/20"
          >
            Make this an edit
          </button>
        </div>
      </div>
    </li>
  );
}

function absoluteUrl(serverRelative: string): string {
  if (/^https?:\/\//i.test(serverRelative)) return serverRelative;
  return `${API_BASE}${
    serverRelative.startsWith('/') ? '' : '/'
  }${serverRelative}`;
}

function recordingModeLabel(mode: TestSessionFrameContent['recordingMode']): string {
  switch (mode) {
    case 'screen_voice':
      return 'screen + voice';
    case 'voice_only':
      return 'voice only';
    case 'screen_only':
      return 'screen only';
    default:
      return mode;
  }
}

function formatClock(ms: number): string {
  const totalSec = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function formatDuration(ms: number): string {
  const totalSec = Math.round(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  if (m === 0) return `${s}s`;
  return `${m}m ${s.toString().padStart(2, '0')}s`;
}

function SessionIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle
        cx="8"
        cy="8"
        r="5.5"
        stroke="currentColor"
        strokeWidth="1.3"
        className="text-accent"
      />
      <path
        d="M6.7 5.6l3.2 2.4-3.2 2.4z"
        fill="currentColor"
        className="text-accent"
      />
    </svg>
  );
}
