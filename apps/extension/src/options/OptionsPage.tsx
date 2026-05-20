// Full-page settings UI for the Foldo extension (MV3 options_ui page).
// Mirrors the SettingsPanel in the popup but has more space for guidance.

import { useEffect, useRef, useState } from 'react';
import { DEFAULTS } from '../config.ts';
import { readSettings, writeSettings } from '../shared/settings.ts';
import type { Settings } from '../shared/types.ts';

export function OptionsPage() {
  const [settings, setSettings] = useState<Settings>({
    cloudUrl: DEFAULTS.cloudUrl,
    webUrl: DEFAULTS.webUrl,
    bearerToken: DEFAULTS.bearerToken,
    boardId: DEFAULTS.boardId,
  });
  const [saved, setSaved] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    readSettings().then(setSettings);
  }, []);

  const handleChange = (patch: Partial<Settings>) => {
    const next = { ...settings, ...patch };
    setSettings(next);
  };

  const handleSave = async () => {
    await writeSettings(settings);
    setSaved(true);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => setSaved(false), 2500);
  };

  const isConnected = settings.bearerToken.trim().length > 0;
  const hasBoardId = settings.boardId.trim().length > 0;

  return (
    <div
      className="bg-canvas text-ink min-h-screen"
      style={{ fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif' }}
    >
      <div className="max-w-lg mx-auto px-6 py-8">
        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <img
            src={chrome.runtime.getURL('public/icon-48.png')}
            alt=""
            className="w-8 h-8 rounded-lg"
          />
          <div>
            <h1 className="text-[16px] font-semibold leading-tight">
              Foldo · Extension Settings
            </h1>
            <p className="text-[12px] text-inkFaint mt-0.5">
              Configure your session token and target board.
            </p>
          </div>
        </div>

        {/* Connection status banner */}
        <div
          className={`rounded-lg border px-4 py-3 mb-6 ${
            isConnected && hasBoardId
              ? 'border-ok/40 bg-panel'
              : 'border-err/40 bg-panel'
          }`}
        >
          <div
            className={`text-[11px] uppercase tracking-wider mb-1 ${
              isConnected && hasBoardId ? 'text-ok' : 'text-err'
            }`}
          >
            {isConnected && hasBoardId ? 'Ready to capture' : 'Not ready'}
          </div>
          <div className="text-[12px] text-ink">
            {!isConnected
              ? 'Paste a Foldo session token below to enable captures.'
              : !hasBoardId
                ? 'Enter a board id below to specify the capture target.'
                : 'Extension is connected and ready to capture pages.'}
          </div>
        </div>

        {/* Fields */}
        <div className="space-y-5">
          <Section title="Authentication">
            <Field
              label="Session token"
              description="Copy from the Foldo app under Settings → API Tokens. This token is stored locally and never leaves your browser except to authenticate with the Foldo server."
              value={settings.bearerToken}
              placeholder="Paste your session token here"
              type="password"
              onChange={(v) => handleChange({ bearerToken: v })}
            />
          </Section>

          <Section title="Capture target">
            <Field
              label="Board id"
              description="The id of the Foldo board that captured frames will be added to. Visible in the board URL: /board/<board-id>."
              value={settings.boardId}
              placeholder="board-…"
              onChange={(v) => handleChange({ boardId: v })}
            />
          </Section>

          <Section title="Server URLs">
            <Field
              label="Foldo cloud URL"
              description="The URL of the Foldo API server. Leave unchanged for the hosted service."
              value={settings.cloudUrl}
              placeholder={DEFAULTS.cloudUrl}
              onChange={(v) => handleChange({ cloudUrl: v || DEFAULTS.cloudUrl })}
            />
            <Field
              label="Canvas web URL"
              description="The URL of the Foldo canvas app. Used to build the 'View on canvas' link after a capture."
              value={settings.webUrl}
              placeholder={DEFAULTS.webUrl}
              onChange={(v) => handleChange({ webUrl: v || DEFAULTS.webUrl })}
            />
          </Section>
        </div>

        {/* Save button */}
        <div className="mt-8 flex items-center gap-3">
          <button
            type="button"
            onClick={() => void handleSave()}
            className="bg-accent text-canvas font-medium text-[13px] rounded-lg px-5 py-2.5 hover:bg-accentSoft transition"
          >
            Save settings
          </button>
          {saved && (
            <span className="text-[12px] text-ok">Settings saved.</span>
          )}
        </div>
      </div>
    </div>
  );
}

interface SectionProps {
  title: string;
  children: React.ReactNode;
}

function Section({ title, children }: SectionProps) {
  return (
    <div>
      <h2 className="text-[11px] uppercase tracking-wider text-inkFaint mb-3">
        {title}
      </h2>
      <div className="rounded-lg bg-panel border border-hairlineSoft p-4 space-y-4">
        {children}
      </div>
    </div>
  );
}

interface FieldProps {
  label: string;
  description?: string;
  value: string;
  placeholder: string;
  type?: 'text' | 'password';
  onChange: (next: string) => void;
}

function Field({
  label,
  description,
  value,
  placeholder,
  type = 'text',
  onChange,
}: FieldProps) {
  return (
    <div>
      <label className="block">
        <span className="block text-[12px] font-medium text-ink mb-1">
          {label}
        </span>
        {description && (
          <span className="block text-[11px] text-inkFaint mb-2 leading-relaxed">
            {description}
          </span>
        )}
        <input
          type={type}
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          className="w-full bg-canvas border border-hairline rounded-md px-3 py-2 text-[13px] text-ink font-mono focus:outline-none focus:border-accent"
        />
      </label>
    </div>
  );
}
