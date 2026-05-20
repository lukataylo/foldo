// First-frame onboarding panel — shown when a board has hydrated but has zero
// frames. A brand-new board otherwise opens to a blank dotted grid with no
// guidance; this centred panel teaches the three ways to land a first frame.
//
// Render gate lives in App.tsx: only mount when `snap.hydrated === true` AND
// `frames.length === 0`, so it never flickers in during board hydration.

interface Props {
  /** Opens the CaptureModal (wired to the same handler as the TopBar button). */
  onCapture: () => void;
}

export function EmptyBoardState({ onCapture }: Props) {
  return (
    <div className="pointer-events-none absolute inset-0 z-40 flex items-center justify-center">
      <div
        className="pointer-events-auto w-[460px] rounded-2xl border border-hairline bg-panel p-6 shadow-panel fade-in"
        data-testid="empty-board-state"
      >
        <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-[0.12em] text-accent">
          <Sparkle /> New board
        </div>
        <h2 className="mt-2 text-[17px] font-medium leading-snug text-ink">
          Get your first frame onto the canvas
        </h2>
        <p className="mt-1 text-[12.5px] leading-relaxed text-inkMute">
          A frame is anything you want to review — a captured page, a screen
          pushed from your editor, or a quick sketch. Start one of these ways:
        </p>

        <div className="mt-4 flex flex-col gap-2">
          <button
            type="button"
            onClick={onCapture}
            data-testid="empty-board-capture"
            className="touch-target group flex items-start gap-3 rounded-xl border border-hairlineSoft bg-canvas/60 p-3 text-left transition-colors hover:border-accent/50 hover:bg-white/5"
          >
            <ActionGlyph>
              <GlobeIcon />
            </ActionGlyph>
            <span className="min-w-0 flex-1">
              <span className="block text-[12.5px] font-medium text-ink">
                Capture a URL
              </span>
              <span className="mt-0.5 block text-[11.5px] leading-relaxed text-inkMute">
                Point Foldo at any live page and freeze it as a reviewable
                frame.
              </span>
            </span>
            <ArrowGlyph />
          </button>

          <div
            className="flex items-start gap-3 rounded-xl border border-hairlineSoft bg-canvas/60 p-3"
            data-testid="empty-board-mcp"
          >
            <ActionGlyph>
              <TerminalIcon />
            </ActionGlyph>
            <span className="min-w-0 flex-1">
              <span className="block text-[12.5px] font-medium text-ink">
                Push from Claude Code
              </span>
              <span className="mt-0.5 block text-[11.5px] leading-relaxed text-inkMute">
                With the Foldo MCP connected, ask Claude Code to push a screen
                — it lands here live, no reload.
              </span>
            </span>
          </div>

          <div
            className="flex items-start gap-3 rounded-xl border border-hairlineSoft bg-canvas/60 p-3"
            data-testid="empty-board-sketch"
          >
            <ActionGlyph>
              <StickyIcon />
            </ActionGlyph>
            <span className="min-w-0 flex-1">
              <span className="block text-[12.5px] font-medium text-ink">
                Sketch a sticky or HTML block
              </span>
              <span className="mt-0.5 block text-[11.5px] leading-relaxed text-inkMute">
                Grab the{' '}
                <span className="rounded bg-accent/15 px-1 py-px font-medium text-accent">
                  Sticky
                </span>{' '}
                or{' '}
                <span className="rounded bg-accent/15 px-1 py-px font-medium text-accent">
                  HTML block
                </span>{' '}
                tool from the rail, then click the canvas to drop one.
              </span>
            </span>
          </div>
        </div>

        <p className="mt-4 text-[11px] text-inkFaint">
          Scroll to pan · ⌘+scroll to zoom · this panel disappears once your
          first frame exists.
        </p>
      </div>
    </div>
  );
}

function ActionGlyph({ children }: { children: React.ReactNode }) {
  return (
    <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-hairlineSoft bg-panel text-accent">
      {children}
    </span>
  );
}

function ArrowGlyph() {
  return (
    <span className="mt-1.5 shrink-0 text-inkFaint transition-colors group-hover:text-accent">
      <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
        <path
          d="M6 4l4 4-4 4"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}

function Sparkle() {
  return (
    <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor">
      <path d="M8 2.5l1 3 3 1-3 1-1 3-1-3-3-1 3-1z" />
    </svg>
  );
}

function GlobeIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.3" />
      <path
        d="M2 8h12M8 2c2 2 2 10 0 12M8 2c-2 2-2 10 0 12"
        stroke="currentColor"
        strokeWidth="1.3"
      />
    </svg>
  );
}

function TerminalIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
      <rect
        x="2"
        y="3"
        width="12"
        height="10"
        rx="1.4"
        stroke="currentColor"
        strokeWidth="1.3"
      />
      <path
        d="M5 7l2 1.5L5 10M8.5 10.5h3"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function StickyIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
      <path
        d="M3 2.5h10v7l-3.5 3.5H3v-10.5z"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
      <path
        d="M13 9.5H9.5V13"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
    </svg>
  );
}
