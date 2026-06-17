import { useEffect, useRef, useState } from 'react';
import type {
  Branch,
  Dispatch,
  DispatchStatus,
  Frame,
} from '@foldo/protocol';
import type { SelectedElement } from '../types';
import { useBoardSelector } from '../state/useBoardStore';

interface Props {
  frame: Frame;
  branch: Branch;
  selectedElement: SelectedElement;
  initialIntent?: string;
  onSend: (intent: string) => void;
  onClose: () => void;
  dispatch?: Dispatch;
  onJumpToResult?: () => void;
}

export function EditPanel({
  frame,
  branch,
  selectedElement,
  initialIntent,
  onSend,
  onClose,
  dispatch,
  onJumpToResult,
}: Props) {
  const [intent, setIntent] = useState(initialIntent ?? '');
  const mcpConnected = useBoardSelector((s) => s.mcpConnected);
  const isAppFrame = frame.kind === 'app';
  const recipeSteps =
    isAppFrame && frame.content.kind === 'app' ? (frame.content.recipe ?? []) : [];

  useEffect(() => {
    setIntent(initialIntent ?? '');
  }, [selectedElement.frameId, selectedElement.label, initialIntent]);

  // Auto-scroll the streaming events panel to its tail.
  const logRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [dispatch?.events.length]);

  const dispatchStatus: DispatchStatus | 'idle' = dispatch?.status ?? 'idle';
  const sending =
    dispatchStatus !== 'idle' &&
    dispatchStatus !== 'done' &&
    dispatchStatus !== 'error' &&
    dispatchStatus !== 'cancelled';
  const inputDisabled = sending;

  return (
    <div className="fade-in pointer-events-auto absolute right-3 top-16 bottom-16 z-50 flex w-[420px] flex-col rounded-xl border border-hairline bg-panel shadow-panel">
      <Header
        branch={branch}
        label={selectedElement.label}
        status={dispatchStatus}
        onClose={onClose}
      />

      <div className="flex-1 overflow-y-auto px-4 py-3">
        <Section title="Target">
          <KV k="branch" v={branch.name} mono />
          <KV k="commit" v={frame.commitSha.slice(0, 7)} mono />
          <KV k="file" v={`${selectedElement.file}:${selectedElement.line}`} mono />
          <KV k="element" v={selectedElement.label} mono />
        </Section>

        <Section title="Selected source">
          <pre className="overflow-x-auto rounded-md border border-hairlineSoft bg-canvas px-2.5 py-2 font-mono text-[11px] leading-relaxed text-inkMute">
            {selectedElement.currentSource}
          </pre>
        </Section>

        {isAppFrame && (
          <Section title="State recipe">
            {recipeSteps.length === 0 ? (
              <div className="text-[11.5px] text-inkFaint">
                Default state. No replay needed.
              </div>
            ) : (
              <ol className="space-y-0.5">
                {recipeSteps.map((s, i) => (
                  <li
                    key={i}
                    className="flex gap-2 font-mono text-[11px] text-inkMute"
                  >
                    <span className="w-4 text-right text-inkFaint">{i + 1}</span>
                    <span className="text-accent/80">{s.action}</span>
                    {s.target && <span className="text-inkMute">{s.target}</span>}
                    {s.value && <span className="text-inkFaint">"{s.value}"</span>}
                  </li>
                ))}
              </ol>
            )}
          </Section>
        )}

        <Section title="Your intent">
          <textarea
            disabled={inputDisabled}
            value={intent}
            onChange={(e) => setIntent(e.target.value)}
            rows={3}
            placeholder={
              isAppFrame
                ? 'Describe the change. e.g. "Add the trial duration to the button: Start your 14-day free trial. Also add a no-credit-card line under it."'
                : 'Describe the doc change.'
            }
            className="w-full resize-none rounded-md border border-hairlineSoft bg-canvas px-2.5 py-2 text-[12.5px] text-ink placeholder:text-inkFaint focus:border-accent/60 focus:outline-none"
          />
        </Section>

        {dispatch && dispatch.events.length > 0 && (
          <Section title="Run log">
            <div
              ref={logRef}
              className="max-h-44 overflow-y-auto rounded-md border border-hairlineSoft bg-canvas p-2 font-mono text-[10.5px] leading-relaxed"
            >
              {dispatch.events.map((ev, i) => (
                <div
                  key={i}
                  className={
                    ev.level === 'error'
                      ? 'text-red-300'
                      : ev.level === 'warn'
                        ? 'text-warn'
                        : 'text-inkMute'
                  }
                >
                  <span className="text-inkFaint">
                    {new Date(ev.ts).toLocaleTimeString()}
                  </span>{' '}
                  {ev.message}
                </div>
              ))}
            </div>
          </Section>
        )}
      </div>

      <Footer
        status={dispatchStatus}
        canSend={intent.trim().length > 0 && dispatchStatus === 'idle'}
        mcpConnected={mcpConnected}
        onSend={() => onSend(intent)}
        onJumpToResult={onJumpToResult}
        errorMessage={dispatch?.errorMessage}
      />
    </div>
  );
}

function Header({
  branch,
  label,
  status,
  onClose,
}: {
  branch: Branch;
  label: string;
  status: DispatchStatus | 'idle';
  onClose: () => void;
}) {
  return (
    <div className="flex items-center justify-between border-b border-hairlineSoft px-4 py-3">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-[0.1em] text-inkFaint">
          <Sparkle />
          <span>AI Edit</span>
          <span className="text-inkFaint">·</span>
          <span style={{ color: branch.color }}>{branch.name}</span>
          {status !== 'idle' && (
            <>
              <span className="text-inkFaint">·</span>
              <span className="font-medium text-accent">{statusLabel(status)}</span>
            </>
          )}
        </div>
        <div className="mt-1 truncate font-mono text-[12px] text-ink">{label}</div>
      </div>
      <button
        onClick={onClose}
        className="ml-2 flex h-6 w-6 items-center justify-center rounded-md text-inkMute hover:bg-white/5 hover:text-ink"
        aria-label="Close edit panel"
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
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-4">
      <div className="mb-1.5 text-[10.5px] uppercase tracking-[0.1em] text-inkFaint">
        {title}
      </div>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

function KV({ k, v, mono }: { k: string; v: string; mono?: boolean }) {
  return (
    <div className="flex items-baseline gap-2 text-[12px]">
      <span className="w-16 shrink-0 text-inkFaint">{k}</span>
      <span className={mono ? 'font-mono text-[11.5px] text-ink' : 'text-ink'}>
        {v}
      </span>
    </div>
  );
}

function Footer({
  status,
  canSend,
  mcpConnected,
  onSend,
  onJumpToResult,
  errorMessage,
}: {
  status: DispatchStatus | 'idle';
  canSend: boolean;
  mcpConnected: boolean;
  onSend: () => void;
  onJumpToResult?: () => void;
  errorMessage?: string;
}) {
  if (status === 'done') {
    return (
      <div className="flex items-center justify-between border-t border-hairlineSoft bg-ok/5 px-4 py-3">
        <div className="flex items-center gap-2 text-[12.5px] text-ok">
          <DoneIcon />
          <span>Done. New frame added to canvas.</span>
        </div>
        <button
          onClick={onJumpToResult}
          className="rounded-md border border-ok/40 bg-ok/15 px-2.5 py-1 text-[11.5px] font-medium text-ok hover:bg-ok/20"
        >
          Jump to it →
        </button>
      </div>
    );
  }
  if (status === 'error' || status === 'cancelled') {
    return (
      <div className="flex items-center justify-between border-t border-hairlineSoft bg-red-500/5 px-4 py-3">
        <div className="min-w-0 flex-1 truncate text-[12.5px] text-red-300">
          {status === 'cancelled' ? 'Cancelled.' : (errorMessage ?? 'Failed.')}
        </div>
        <button
          onClick={onSend}
          className="ml-2 rounded-md border border-red-300/30 bg-red-500/10 px-2.5 py-1 text-[11.5px] font-medium text-red-300 hover:bg-red-500/15"
        >
          Retry
        </button>
      </div>
    );
  }
  if (status === 'running' || status === 'sending' || status === 'queued') {
    return (
      <div className="border-t border-hairlineSoft px-4 py-3">
        <div className="mb-2 flex items-center gap-2 text-[12px] text-ink">
          <Spinner />
          <span>{statusDetail(status)}</span>
        </div>
        <div className="h-[2px] w-full overflow-hidden rounded-full bg-hairlineSoft">
          <div className="h-full shimmer" style={{ width: '100%' }} />
        </div>
      </div>
    );
  }
  return (
    <div className="flex items-center justify-between border-t border-hairlineSoft px-4 py-3">
      <div className="text-[11px] text-inkFaint">
        {mcpConnected
          ? 'Sends via the local MCP server to Claude Code.'
          : 'Connect the MCP server to apply this as a real Claude Code edit.'}
      </div>
      <button
        disabled={!canSend}
        onClick={onSend}
        className={
          'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12.5px] font-medium transition-colors ' +
          (canSend
            ? 'bg-accent text-white hover:bg-accentSoft'
            : 'cursor-not-allowed bg-hairlineSoft text-inkFaint')
        }
      >
        <span>Send to Claude Code</span>
        <SendIcon />
      </button>
    </div>
  );
}

function statusLabel(s: DispatchStatus | 'idle') {
  switch (s) {
    case 'queued':
      return 'queued…';
    case 'sending':
      return 'sending…';
    case 'running':
      return 'running…';
    case 'done':
      return 'done';
    case 'error':
      return 'failed';
    case 'cancelled':
      return 'cancelled';
    default:
      return '';
  }
}
function statusDetail(s: DispatchStatus | 'idle') {
  switch (s) {
    case 'queued':
      return 'Queued · waiting for a runner…';
    case 'sending':
      return 'Routing to MCP (or simulator if no MCP connected)…';
    case 'running':
      return 'Replaying recipe and applying the edit…';
    default:
      return '';
  }
}

function Sparkle() {
  return (
    <svg width="11" height="11" viewBox="0 0 16 16" fill="currentColor">
      <path d="M8 2.5l1 3 3 1-3 1-1 3-1-3-3-1 3-1z" />
    </svg>
  );
}
function SendIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
      <path
        d="M3 8h9.5M8 4l4.5 4-4.5 4"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
function Spinner() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      className="animate-spin"
    >
      <circle
        cx="12"
        cy="12"
        r="9"
        stroke="currentColor"
        strokeOpacity="0.2"
        strokeWidth="2.5"
      />
      <path
        d="M21 12a9 9 0 0 0-9-9"
        stroke="#ff7849"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
    </svg>
  );
}
function DoneIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.4" />
      <path
        d="M5 8.5l2 2 4-4"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
