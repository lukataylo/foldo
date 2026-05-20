// Popup UI, a single button to freeze the current tab, plus a gear icon that
// reveals cloud URL / token / board id settings.
//
// State machine:
//   idle → reading-tab → injecting → snapping → uploading → done | error
// Each phase shows a one-line label and a thin animated progress bar matching
// the canvas's capture modal (dark #2c2c2c panel, #ff7849 accent).
//
// When no bearer token is stored the popup shows a "not connected" banner
// and disables the capture button — preventing silent demo-user captures.

import { useEffect, useMemo, useRef, useState } from 'react';
import type { Frame } from '@foldo/protocol';
import { DEFAULTS } from '../config.ts';
import type {
  CaptureEvent,
  Phase,
  Settings,
} from '../shared/types.ts';

const PHASE_LABEL: Record<Phase, string> = {
  idle: 'Ready to capture',
  'reading-tab': 'Reading active tab…',
  injecting: 'Snapshotting the page…',
  snapping: 'Taking screenshot…',
  uploading: 'Sending to Foldo cloud…',
  done: 'Captured',
  error: 'Capture failed',
};

interface SuccessState {
  frame: Frame;
  viewUrl: string;
}

export function Popup() {
  const [phase, setPhase] = useState<Phase>('idle');
  const [detail, setDetail] = useState<string | undefined>(undefined);
  const [error, setError] = useState<string | undefined>(undefined);
  const [success, setSuccess] = useState<SuccessState | undefined>(undefined);
  const [showSettings, setShowSettings] = useState(false);
  const [settings, setSettings] = useState<Settings>({
    cloudUrl: DEFAULTS.cloudUrl,
    webUrl: DEFAULTS.webUrl,
    bearerToken: DEFAULTS.bearerToken, // empty string until user connects
    boardId: DEFAULTS.boardId,
  });

  // True when the user has not yet pasted a session token.
  const isConnected = settings.bearerToken.trim().length > 0;

  const portRef = useRef<chrome.runtime.Port | null>(null);

  // Open a long-lived port to the service worker. The SW owns the
  // capture pipeline and streams progress events back here.
  useEffect(() => {
    const port = chrome.runtime.connect({ name: 'foldo-popup' });
    portRef.current = port;
    port.onMessage.addListener((msg: CaptureEvent | { type: 'settings/value'; settings: Settings }) => {
      if (msg.type === 'capture/progress') {
        setPhase(msg.phase);
        setDetail(msg.detail);
        setError(undefined);
      } else if (msg.type === 'capture/success') {
        setPhase('done');
        setDetail(undefined);
        setError(undefined);
        setSuccess({ frame: msg.frame, viewUrl: msg.viewUrl });
      } else if (msg.type === 'capture/failure') {
        setPhase('error');
        setDetail(undefined);
        setError(msg.message);
      } else if (msg.type === 'settings/value') {
        setSettings(msg.settings);
      }
    });
    port.postMessage({ type: 'settings/read' });
    return () => {
      port.disconnect();
      portRef.current = null;
    };
  }, []);

  const runCapture = () => {
    setSuccess(undefined);
    setError(undefined);
    setPhase('reading-tab');
    portRef.current?.postMessage({ type: 'capture/run' });
  };

  const saveSettings = (next: Partial<Settings>) => {
    portRef.current?.postMessage({ type: 'settings/write', settings: next });
  };

  const isWorking = useMemo(
    () =>
      phase === 'reading-tab' ||
      phase === 'injecting' ||
      phase === 'snapping' ||
      phase === 'uploading',
    [phase],
  );

  const openOptions = () => {
    chrome.runtime.openOptionsPage();
  };

  return (
    <div className="bg-canvas text-ink">
      <Header
        onToggleSettings={() => setShowSettings((v) => !v)}
        settingsOpen={showSettings}
      />

      {!isConnected && !showSettings && (
        <div className="mx-4 mt-3 rounded-lg border border-err/40 bg-panel px-3 py-2.5">
          <div className="text-[11px] uppercase tracking-wider text-err mb-1">
            Not connected
          </div>
          <div className="text-[12px] text-ink">
            Paste your Foldo session token to start capturing.
          </div>
          <button
            type="button"
            onClick={openOptions}
            className="mt-2 text-[11px] text-accent hover:text-accentSoft underline"
          >
            Open settings →
          </button>
        </div>
      )}

      <div className="px-4 pb-4 pt-3">
        {!showSettings ? (
          <MainPanel
            phase={phase}
            detail={detail}
            error={error}
            success={success}
            isWorking={isWorking}
            isConnected={isConnected}
            onCapture={runCapture}
          />
        ) : (
          <SettingsPanel
            settings={settings}
            onChange={(next) => {
              setSettings({ ...settings, ...next });
              saveSettings(next);
            }}
          />
        )}
      </div>

      <footer className="px-4 py-2 border-t border-hairlineSoft text-[10px] text-inkFaint flex items-center justify-between">
        <span>Foldo · Capture</span>
        <span className="font-mono">v0.0.1</span>
      </footer>
    </div>
  );
}

interface HeaderProps {
  onToggleSettings: () => void;
  settingsOpen: boolean;
}

function Header({ onToggleSettings, settingsOpen }: HeaderProps) {
  return (
    <header className="flex items-center justify-between px-4 pt-3 pb-2 border-b border-hairlineSoft">
      <div className="flex items-center gap-2">
        <img
          src={chrome.runtime.getURL('public/logo.png')}
          alt=""
          className="w-6 h-6 rounded-md"
        />
        <div className="leading-tight">
          <div className="text-[13px] font-semibold">Foldo</div>
          <div className="text-[10px] text-inkFaint -mt-0.5">
            Capture from URL
          </div>
        </div>
      </div>
      <button
        type="button"
        aria-label={settingsOpen ? 'Close settings' : 'Open settings'}
        onClick={onToggleSettings}
        className={`p-1.5 rounded-md hover:bg-panel transition ${
          settingsOpen ? 'text-accent' : 'text-inkMute'
        }`}
      >
        <GearIcon />
      </button>
    </header>
  );
}

interface MainPanelProps {
  phase: Phase;
  detail: string | undefined;
  error: string | undefined;
  success: SuccessState | undefined;
  isWorking: boolean;
  isConnected: boolean;
  onCapture: () => void;
}

function MainPanel({
  phase,
  detail,
  error,
  success,
  isWorking,
  isConnected,
  onCapture,
}: MainPanelProps) {
  return (
    <div className="space-y-3">
      <div className="rounded-lg bg-panel border border-hairlineSoft p-3">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[11px] uppercase tracking-wider text-inkFaint">
            {phase === 'error'
              ? 'Error'
              : phase === 'done'
                ? 'Done'
                : 'Status'}
          </span>
          <span
            className={`text-[11px] font-medium ${
              phase === 'error'
                ? 'text-err'
                : phase === 'done'
                  ? 'text-ok'
                  : 'text-inkMute'
            }`}
          >
            {PHASE_LABEL[phase]}
          </span>
        </div>
        <div className="text-[12px] text-ink min-h-[16px]">
          {detail ?? defaultDetailFor(phase)}
        </div>
        {isWorking ? (
          <div className="foldo-bar mt-3" />
        ) : (
          <div className="h-[2px] mt-3 rounded-full bg-hairlineSoft" />
        )}
      </div>

      {success ? (
        <a
          href={success.viewUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="block rounded-lg bg-panel border border-hairlineSoft px-3 py-2.5 hover:border-accent transition group"
        >
          <div className="text-[11px] uppercase tracking-wider text-inkFaint">
            Captured frame
          </div>
          <div className="text-[12px] text-ink mt-0.5 truncate">
            {success.frame.commitMessage || success.frame.id}
          </div>
          <div className="text-[11px] text-accent mt-1 group-hover:text-accentSoft">
            View on canvas →
          </div>
        </a>
      ) : null}

      {error ? (
        <div className="rounded-lg bg-panel border border-err/40 px-3 py-2.5">
          <div className="text-[11px] uppercase tracking-wider text-err">
            Capture failed
          </div>
          <div className="text-[12px] text-ink mt-1 break-words">{error}</div>
        </div>
      ) : null}

      <button
        type="button"
        onClick={onCapture}
        disabled={isWorking || !isConnected}
        className={`w-full rounded-lg font-medium text-[13px] py-2.5 transition ${
          isWorking || !isConnected
            ? 'bg-panel text-inkFaint cursor-not-allowed'
            : phase === 'error'
              ? 'bg-accent text-canvas hover:bg-accentSoft'
              : 'bg-accent text-canvas hover:bg-accentSoft'
        }`}
      >
        {isWorking
          ? 'Working…'
          : !isConnected
            ? 'Connect first'
            : phase === 'error'
              ? 'Retry'
              : phase === 'done'
                ? 'Freeze this state again'
                : 'Freeze this state'}
      </button>
    </div>
  );
}

function defaultDetailFor(phase: Phase): string {
  switch (phase) {
    case 'idle':
      return 'Click to freeze the current tab into a Foldo canvas frame.';
    case 'done':
      return 'Your snapshot is on the canvas.';
    case 'error':
      return 'Something went wrong. Try again.';
    default:
      return 'Working…';
  }
}

interface SettingsPanelProps {
  settings: Settings;
  onChange: (patch: Partial<Settings>) => void;
}

function SettingsPanel({ settings, onChange }: SettingsPanelProps) {
  return (
    <div className="space-y-3">
      <Field
        label="Foldo cloud URL"
        value={settings.cloudUrl}
        placeholder={DEFAULTS.cloudUrl}
        onCommit={(v) => onChange({ cloudUrl: v || DEFAULTS.cloudUrl })}
      />
      <Field
        label="Canvas web URL"
        value={settings.webUrl}
        placeholder={DEFAULTS.webUrl}
        onCommit={(v) => onChange({ webUrl: v || DEFAULTS.webUrl })}
      />
      <Field
        label="Session token"
        value={settings.bearerToken}
        placeholder="Paste from Foldo app → Settings → API"
        type="password"
        onCommit={(v) => onChange({ bearerToken: v })}
      />
      <Field
        label="Board id"
        value={settings.boardId}
        placeholder="board-…"
        onCommit={(v) => onChange({ boardId: v })}
      />
      <div className="text-[11px] text-inkFaint pt-1">
        Settings live in chrome.storage.local. For a full-screen settings view
        open the{' '}
        <button
          type="button"
          onClick={() => chrome.runtime.openOptionsPage()}
          className="underline hover:text-ink"
        >
          options page
        </button>
        .
      </div>
    </div>
  );
}

interface FieldProps {
  label: string;
  value: string;
  placeholder: string;
  type?: 'text' | 'password';
  onCommit: (next: string) => void;
}

function Field({ label, value, placeholder, type = 'text', onCommit }: FieldProps) {
  const [local, setLocal] = useState(value);
  useEffect(() => {
    setLocal(value);
  }, [value]);
  return (
    <label className="block">
      <span className="block text-[10px] uppercase tracking-wider text-inkFaint mb-1">
        {label}
      </span>
      <input
        type={type}
        value={local}
        placeholder={placeholder}
        onChange={(e) => setLocal(e.target.value)}
        onBlur={() => onCommit(local.trim())}
        className="w-full bg-panel border border-hairlineSoft rounded-md px-2 py-1.5 text-[12px] text-ink font-mono focus:outline-none focus:border-accent"
      />
    </label>
  );
}

function GearIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}
