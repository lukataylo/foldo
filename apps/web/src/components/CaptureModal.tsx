import { useEffect, useState } from 'react';
import type { Frame } from '@foldo/protocol';
import { createCapture } from '../api/captures';

interface Props {
  open: boolean;
  boardId: string | null;
  meUserId: string | null;
  onClose: () => void;
  /** Called with the server-returned frame on success. */
  onComplete: (frame: Frame) => void;
}

type Phase =
  | 'idle'
  | 'connecting'
  | 'injecting'
  | 'recording'
  | 'freezing'
  | 'done'
  | 'error';

export function CaptureModal({
  open,
  boardId,
  meUserId,
  onClose,
  onComplete,
}: Props) {
  const [url, setUrl] = useState('https://stripe.com/pricing');
  const [width, setWidth] = useState(1280);
  const [height, setHeight] = useState(900);
  const [phase, setPhase] = useState<Phase>('idle');
  const [phaseLog, setPhaseLog] = useState<string[]>([]);
  const [errMsg, setErrMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setPhase('idle');
      setPhaseLog([]);
      setErrMsg(null);
    }
  }, [open]);

  if (!open) return null;

  const run = async () => {
    if (!boardId || !meUserId) return;
    // Front-load URL validation so a typo doesn't waste the simulated pipeline.
    let pathname = '/';
    try {
      const u = new URL(url);
      pathname = u.pathname || '/';
    } catch {
      setPhase('error');
      setErrMsg('Enter a full URL including https://');
      return;
    }
    const log = (m: string) => setPhaseLog((l) => [...l, m]);
    setPhase('connecting');
    log('Connecting to Foldo Chrome extension…');
    await sleep(300);
    setPhase('injecting');
    log('Extension active. Injecting capture script into tab.');
    await sleep(400);
    setPhase('recording');
    log('Recording DOM snapshot + computed styles.');
    await sleep(500);
    setPhase('freezing');
    log('Freezing state. Uploading to Foldo cloud…');
    try {
      const { frame } = await createCapture({
        url,
        viewport: { width, height },
        title: `Captured · ${pathname}`,
        capturedByUserId: meUserId,
        boardId,
      });
      setPhase('done');
      log('Done. Frame added to canvas.');
      await sleep(400);
      onComplete(frame);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setPhase('error');
      setErrMsg(msg);
      log(`Failed: ${msg}`);
    }
  };

  return (
    <div className="pointer-events-auto absolute inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="w-[520px] overflow-hidden rounded-xl border border-hairline bg-panel shadow-panel">
        <div className="flex items-center justify-between border-b border-hairlineSoft px-4 py-3">
          <div className="flex items-center gap-2 text-ink">
            <ExtensionIcon />
            <div>
              <div className="text-[13px] font-medium">Capture from URL</div>
              <div className="text-[11px] text-inkFaint">
                Chrome extension · no local repo required
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

        {phase === 'idle' ? (
          <div className="px-4 py-4">
            <label className="block text-[11px] uppercase tracking-[0.1em] text-inkFaint">
              URL
            </label>
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              className="mt-1 w-full rounded-md border border-hairlineSoft bg-canvas px-2.5 py-1.5 font-mono text-[12px] text-ink focus:border-accent/60 focus:outline-none"
            />
            <div className="mt-3 grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] uppercase tracking-[0.1em] text-inkFaint">
                  Viewport width
                </label>
                <input
                  type="number"
                  value={width}
                  onChange={(e) => setWidth(parseInt(e.target.value) || 0)}
                  className="mt-1 w-full rounded-md border border-hairlineSoft bg-canvas px-2.5 py-1.5 font-mono text-[12px] text-ink focus:border-accent/60 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-[11px] uppercase tracking-[0.1em] text-inkFaint">
                  Viewport height
                </label>
                <input
                  type="number"
                  value={height}
                  onChange={(e) => setHeight(parseInt(e.target.value) || 0)}
                  className="mt-1 w-full rounded-md border border-hairlineSoft bg-canvas px-2.5 py-1.5 font-mono text-[12px] text-ink focus:border-accent/60 focus:outline-none"
                />
              </div>
            </div>
            <div className="mt-3 rounded-md border border-hairlineSoft bg-canvas/70 px-3 py-2 text-[11.5px] leading-relaxed text-inkMute">
              The extension will open this URL in a hidden tab, navigate to the
              given state, and freeze it as a new frame on the canvas.
            </div>
            <div className="mt-4 flex items-center justify-between">
              <button
                onClick={onClose}
                className="rounded-md px-3 py-1.5 text-[12px] text-inkMute hover:bg-white/5 hover:text-ink"
              >
                Cancel
              </button>
              <button
                onClick={run}
                disabled={!boardId || !meUserId}
                className="flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-[12.5px] font-medium text-white hover:bg-accentSoft disabled:opacity-50"
              >
                <span>Freeze this</span>
                <ArrowIcon />
              </button>
            </div>
          </div>
        ) : (
          <div className="px-4 py-4">
            <div className="rounded-md border border-hairlineSoft bg-canvas/70 px-3 py-3">
              <div className="mb-2 flex items-center justify-between">
                <div className="flex items-center gap-2 text-[12px] text-ink">
                  {phase === 'done' ? (
                    <DoneIcon />
                  ) : phase === 'error' ? (
                    <ErrorIcon />
                  ) : (
                    <Spinner />
                  )}
                  <span>{phaseTitle(phase)}</span>
                </div>
                <div className="font-mono text-[11px] text-inkFaint">
                  {url.length > 38 ? url.slice(0, 36) + '…' : url}
                </div>
              </div>
              <div className="h-[2px] w-full overflow-hidden rounded-full bg-hairlineSoft">
                <div
                  className={
                    phase === 'done'
                      ? 'h-full bg-ok'
                      : phase === 'error'
                        ? 'h-full bg-red-400'
                        : 'h-full shimmer'
                  }
                  style={{ width: '100%' }}
                />
              </div>
            </div>
            <div className="mt-3 max-h-32 overflow-y-auto rounded-md bg-canvas/70 p-2.5 font-mono text-[11px] leading-relaxed text-inkMute">
              {phaseLog.map((l, i) => (
                <div key={i}>
                  <span className="text-inkFaint">{`›`}</span> {l}
                </div>
              ))}
            </div>
            {phase === 'error' && (
              <div className="mt-3 flex items-center justify-between">
                <div className="text-[11.5px] text-red-300">{errMsg}</div>
                <button
                  onClick={onClose}
                  className="rounded-md px-3 py-1 text-[12px] text-inkMute hover:bg-white/5 hover:text-ink"
                >
                  Close
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function phaseTitle(p: Phase): string {
  switch (p) {
    case 'connecting':
      return 'Connecting to extension';
    case 'injecting':
      return 'Injecting capture script';
    case 'recording':
      return 'Recording DOM state';
    case 'freezing':
      return 'Uploading freeze';
    case 'done':
      return 'Done';
    case 'error':
      return 'Failed';
    default:
      return '';
  }
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function ExtensionIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path
        d="M3 6.5V11a1.5 1.5 0 0 0 1.5 1.5h6A1.5 1.5 0 0 0 12 11V6.5M3 6.5h9M3 6.5V5a1.5 1.5 0 0 1 1.5-1.5h1.25a1 1 0 0 0 1-.6c.1-.2.3-.4.6-.4h1.3c.3 0 .5.2.6.4.1.4.5.6 1 .6h1.25A1.5 1.5 0 0 1 12 5v1.5"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
    </svg>
  );
}
function ArrowIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
      <path
        d="M3 8h9.5M8 4l4.5 4-4.5 4"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}
function DoneIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" className="text-ok">
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
function ErrorIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
      className="text-red-300"
    >
      <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.4" />
      <path
        d="M5.5 5.5l5 5M10.5 5.5l-5 5"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}
function Spinner() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className="animate-spin">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.2" strokeWidth="2.5" />
      <path
        d="M21 12a9 9 0 0 0-9-9"
        stroke="#ff7849"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
    </svg>
  );
}
