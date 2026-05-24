// /* A+W1 features */ — small in-canvas banner shown when the dispatch
// backend is running in the local simulator (FOLDO_MCP_FORCE_SIM=1 on
// apps/mcp, or simply no Claude binary on PATH). The signal comes from
// `mcpConnected` on the BoardStore — when false, dispatches still work
// but they're answered by apps/server/src/sim/dispatch.ts rather than a
// real Claude Code session.
//
// Rendered at the top-centre of the canvas, dismissible via X. The banner
// is a "first-run" surface — once dismissed for the session it stays
// hidden (in-memory state owned by App.tsx) so it doesn't nag every
// re-render. The TopBar already shows a tiny MCP dot for the always-on
// signal; this banner is the louder version for newcomers.

import { useState, type CSSProperties } from 'react';

interface Props {
  /** Click handler for the dismiss × — App owns the "shown" flag. */
  onDismiss: () => void;
}

const wrap: CSSProperties = {
  position: 'absolute',
  top: 12,
  left: '50%',
  transform: 'translateX(-50%)',
  zIndex: 45,
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  background: '#fff7e0',
  border: '1.5px solid #f0d27a',
  color: '#5a4a14',
  borderRadius: 999,
  padding: '6px 12px 6px 14px',
  fontSize: 12.5,
  fontWeight: 500,
  boxShadow: '0 8px 24px -10px rgba(90,74,20,0.25)',
};

const closeBtn: CSSProperties = {
  background: 'transparent',
  border: 'none',
  color: '#7a6624',
  cursor: 'pointer',
  fontSize: 14,
  lineHeight: 1,
  padding: 2,
};

const dot: CSSProperties = {
  display: 'inline-block',
  width: 8,
  height: 8,
  borderRadius: '50%',
  background: '#f0a500',
  boxShadow: '0 0 6px #f0a500',
};

export function ClaudeSimulatorBanner({ onDismiss }: Props): JSX.Element {
  return (
    <div
      role="status"
      data-testid="foldo-claude-simulator-banner"
      style={wrap}
    >
      <span style={dot} />
      <span>
        <strong>Simulator mode</strong> — dispatches are answered by the
        local simulator, not Claude Code.
      </span>
      <a
        href="/docs#mcp"
        style={{ color: '#5a4a14', fontWeight: 600 }}
      >
        Connect MCP
      </a>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss banner"
        style={closeBtn}
        data-testid="foldo-claude-simulator-banner-dismiss"
      >
        ×
      </button>
    </div>
  );
}

/** Local module-level hook to track first-render dismissal in a session. */
export function useBannerDismissal(): {
  dismissed: boolean;
  dismiss: () => void;
} {
  const [dismissed, setDismissed] = useState<boolean>(() => {
    try {
      return sessionStorage.getItem('foldo:simBanner:dismissed') === '1';
    } catch {
      return false;
    }
  });
  const dismiss = (): void => {
    setDismissed(true);
    try {
      sessionStorage.setItem('foldo:simBanner:dismissed', '1');
    } catch {
      /* ignore */
    }
  };
  return { dismissed, dismiss };
}
