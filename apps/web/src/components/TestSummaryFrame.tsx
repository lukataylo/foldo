// Test summary frame — the hub frame for an unmoderated user test on the
// canvas. Read-only: aggregate session counts + per-task completion stats.
// Session frames cluster beneath it (connector-lined via parentFrameId).

import type {
  Branch,
  Frame,
  TestStatus,
  TestSummaryFrameContent,
  TestTaskStat,
} from '@foldo/protocol';
import { FrameMeta } from './FrameMeta';

interface Props {
  frame: Frame;
  branch: Branch;
  zoom?: number;
}

const STATUS_STYLE: Record<TestStatus, { label: string; cls: string }> = {
  draft: {
    label: 'Draft',
    cls: 'border-hairline bg-white/5 text-inkMute',
  },
  live: {
    label: '● Live',
    cls: 'border-ok/40 bg-ok/15 text-ok',
  },
  closed: {
    label: 'Closed',
    cls: 'border-warn/40 bg-warn/15 text-warn',
  },
};

export function TestSummaryFrame({ frame, branch, zoom = 1 }: Props) {
  const content = frame.content as TestSummaryFrameContent;
  const status = STATUS_STYLE[content.status] ?? STATUS_STYLE.draft;

  return (
    <div
      className="absolute"
      style={{
        left: frame.position.x,
        top: frame.position.y,
        width: frame.size.width,
        height: frame.size.height,
      }}
    >
      <FrameMeta frame={frame} branch={branch} zoom={zoom} />
      <div
        className="flex h-full w-full flex-col overflow-hidden rounded-md border border-hairlineSoft bg-panel frame-shadow"
        style={{ pointerEvents: 'auto' }}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-hairlineSoft bg-panelMute px-4 py-3">
          <div className="flex min-w-0 items-center gap-2">
            <TestIcon />
            <div className="min-w-0">
              <div className="truncate text-[13px] font-semibold text-ink">
                {content.testName}
              </div>
              <div className="mt-0.5 truncate font-mono text-[10.5px] text-inkFaint">
                foldo.dev/t/{content.shareToken}
              </div>
            </div>
          </div>
          <span
            className={
              'shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.06em] ' +
              status.cls
            }
          >
            {status.label}
          </span>
        </div>

        {/* Session counts */}
        <div className="flex items-stretch gap-2 px-4 py-3">
          <Stat
            value={content.completedSessions}
            label="completed"
            accent
          />
          <div className="w-px self-stretch bg-hairlineSoft" />
          <Stat value={content.totalSessions} label="sessions" />
        </div>

        {/* Per-task stats */}
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
          <div className="mb-2 text-[10px] font-medium uppercase tracking-[0.08em] text-inkFaint">
            Tasks
          </div>
          {content.taskStats.length === 0 ? (
            <div className="rounded border border-dashed border-hairlineSoft px-3 py-4 text-center text-[11.5px] text-inkFaint">
              No task data yet — results stream in as testers finish.
            </div>
          ) : (
            <ul className="flex flex-col gap-2.5">
              {content.taskStats.map((stat) => (
                <TaskStatRow key={stat.taskId} stat={stat} />
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

function Stat({
  value,
  label,
  accent = false,
}: {
  value: number;
  label: string;
  accent?: boolean;
}) {
  return (
    <div className="flex flex-1 flex-col">
      <span
        className={
          'text-[20px] font-semibold leading-none ' +
          (accent ? 'text-accent' : 'text-ink')
        }
      >
        {value}
      </span>
      <span className="mt-1 text-[10.5px] uppercase tracking-[0.06em] text-inkFaint">
        {label}
      </span>
    </div>
  );
}

function TaskStatRow({ stat }: { stat: TestTaskStat }) {
  const total = stat.completed + stat.skipped + stat.gaveUp;
  const pct = (n: number) => (total > 0 ? (n / total) * 100 : 0);

  return (
    <li className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="truncate text-[11.5px] text-ink">{stat.title}</span>
        <span className="shrink-0 font-mono text-[10.5px] text-inkFaint">
          {total > 0 ? `${Math.round(pct(stat.completed))}%` : '—'}
          {stat.medianDurationMs > 0 && (
            <span className="ml-1.5 text-inkFaint">
              · {formatDuration(stat.medianDurationMs)}
            </span>
          )}
        </span>
      </div>
      {/* Stacked bar: completed / skipped / gave-up */}
      <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-white/5">
        {total > 0 ? (
          <>
            <span
              className="bg-ok"
              style={{ width: `${pct(stat.completed)}%` }}
            />
            <span
              className="bg-warn"
              style={{ width: `${pct(stat.skipped)}%` }}
            />
            <span
              className="bg-red-400/80"
              style={{ width: `${pct(stat.gaveUp)}%` }}
            />
          </>
        ) : null}
      </div>
      <div className="flex items-center gap-3 text-[10px] text-inkFaint">
        <Legend dot="bg-ok" label={`${stat.completed} done`} />
        <Legend dot="bg-warn" label={`${stat.skipped} skipped`} />
        <Legend dot="bg-red-400/80" label={`${stat.gaveUp} gave up`} />
      </div>
    </li>
  );
}

function Legend({ dot, label }: { dot: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className={'inline-block h-1.5 w-1.5 rounded-full ' + dot} />
      {label}
    </span>
  );
}

function formatDuration(ms: number): string {
  const totalSec = Math.round(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  if (m === 0) return `${s}s`;
  return `${m}m ${s.toString().padStart(2, '0')}s`;
}

function TestIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <rect
        x="2.5"
        y="2.5"
        width="11"
        height="11"
        rx="2.5"
        stroke="currentColor"
        strokeWidth="1.3"
        className="text-accent"
      />
      <path
        d="M5.5 8.2l1.6 1.6 3.4-3.6"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="text-accent"
      />
    </svg>
  );
}
