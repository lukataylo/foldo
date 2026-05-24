// Boot-time overlays + the first-run hint. Three tiny presentational
// components App.tsx renders behind the main canvas tree, hoisted into
// their own file so App.tsx doesn't carry ~100 lines of decoration. None
// of them subscribe to the store; they're pure props in / JSX out.
//
//   - BootLoadingOverlay   — visible while useCanvasBoot is in `loading`
//   - UnreachableOverlay   — visible while useCanvasBoot is in `unreachable`;
//                            "Use offline demo" button calls back to App
//   - FirstRunHint         — corner hint shown once on first paint of a
//                            hydrated board; dismissible

import { useState } from 'react';

export function BootLoadingOverlay(): JSX.Element {
  return (
    <div className="pointer-events-auto absolute inset-0 z-[80] flex items-center justify-center bg-canvas/80 backdrop-blur-sm">
      <div className="rounded-xl border border-hairlineSoft bg-panel px-6 py-4 text-[13px] text-inkMute shadow-panel">
        Loading board…
      </div>
    </div>
  );
}

export function UnreachableOverlay({
  error,
  onOffline,
}: {
  error: string;
  onOffline: () => void;
}): JSX.Element {
  return (
    <div className="pointer-events-auto absolute inset-0 z-[80] flex items-center justify-center bg-canvas/85 backdrop-blur-sm">
      <div className="w-[420px] rounded-xl border border-hairline bg-panel p-5 shadow-panel">
        <div className="flex items-center gap-2 text-[12.5px] font-medium text-ink">
          <span
            className="inline-block h-2 w-2 rounded-full"
            style={{ background: '#ef6f6f' }}
          />
          Cloud unreachable
        </div>
        <div className="mt-2 text-[12.5px] leading-relaxed text-inkMute">
          Couldn't reach the Foldo server on <code>localhost:4000</code>. Start
          it with{' '}
          <code className="rounded bg-canvas/80 px-1 py-px font-mono text-[11.5px] text-ink">
            npm run dev
          </code>
          .
        </div>
        <div className="mt-2 font-mono text-[10.5px] text-inkFaint">{error}</div>
        <div className="mt-4 flex items-center justify-end gap-2">
          <button
            onClick={() => location.reload()}
            className="rounded-md border border-hairlineSoft bg-canvas px-3 py-1.5 text-[12px] text-ink hover:bg-white/5"
          >
            Retry
          </button>
          <button
            onClick={onOffline}
            className="rounded-md bg-accent px-3 py-1.5 text-[12.5px] font-medium text-white hover:bg-accentSoft"
          >
            Use offline demo
          </button>
        </div>
      </div>
    </div>
  );
}

export function FirstRunHint({ count }: { count: number }): JSX.Element | null {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;
  return (
    <div className="pointer-events-auto absolute bottom-4 right-4 z-40 w-[300px] rounded-xl border border-hairline bg-panel p-3.5 shadow-panel fade-in">
      <div className="mb-1 flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-[0.12em] text-accent">
          <Sparkle /> Try this
        </div>
        <button
          onClick={() => setDismissed(true)}
          className="text-inkFaint hover:text-ink"
          aria-label="Dismiss"
        >
          <svg width="10" height="10" viewBox="0 0 16 16">
            <path
              d="M4 4l8 8M12 4l-8 8"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </div>
      <div className="text-[12.5px] leading-relaxed text-ink">
        Click an orange comment pin, hit{' '}
        <span className="rounded bg-accent/15 px-1 py-px font-medium text-accent">
          Make this an edit
        </span>
        , then{' '}
        <span className="rounded bg-accent/15 px-1 py-px font-medium text-accent">
          Send to Claude Code
        </span>{' '}
        . A new frame appears connected to its parent.
      </div>
      <div className="mt-2 text-[11px] text-inkFaint">
        {count} frames · scroll to pan · ⌘+scroll to zoom
      </div>
    </div>
  );
}

function Sparkle(): JSX.Element {
  return (
    <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor">
      <path d="M8 2.5l1 3 3 1-3 1-1 3-1-3-3-1 3-1z" />
    </svg>
  );
}
