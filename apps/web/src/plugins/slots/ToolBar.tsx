// Bottom-center tool dock. Pulls every `toolbar` surface contribution
// from the registry and lays them out as a single horizontal pill. Hides
// itself if no plugin contributes tools — the existing LeftRail keeps
// rendering its hardcoded buttons until they're collapsed into a plugin
// in a Step 9 fast-follow.
//
// Visual style mirrors LeftRail.tsx — same pill background + button
// shape — so contributions look at-home alongside the legacy rail.

import type { CSSProperties } from 'react';
import { usePluginSurfaces } from '../registry';

const wrap: CSSProperties = {
  position: 'fixed',
  bottom: 20,
  left: '50%',
  transform: 'translateX(-50%)',
  display: 'flex',
  gap: 4,
  padding: 6,
  background: 'rgba(20, 20, 22, 0.85)',
  backdropFilter: 'blur(12px)',
  borderRadius: 999,
  boxShadow: '0 8px 32px rgba(0,0,0,0.35), inset 0 0 0 1px rgba(255,255,255,0.06)',
  zIndex: 50,
};

const btn: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  /* A+W1 touch: padding bumped 6px10px → 10px14px so the pill button reads
     ~40px tall — fingertip-friendly on iPad. minHeight is the safety net for
     buttons whose label is short. */
  padding: '10px 14px',
  minHeight: 40,
  borderRadius: 999,
  border: 'none',
  background: 'transparent',
  color: '#e8e8ea',
  fontSize: 13,
  fontWeight: 500,
  cursor: 'pointer',
};

export function ToolBar(): JSX.Element | null {
  const surfaces = usePluginSurfaces('toolbar');
  const tools = surfaces.flatMap((s) => s.tools);
  if (tools.length === 0) return null;
  return (
    <div
      data-testid="foldo-plugin-toolbar"
      role="toolbar"
      aria-label="Plugin tools"
      style={wrap}
    >
      {tools.map((t) => (
        <button
          key={t.id}
          type="button"
          title={t.shortcut ? `${t.label} (${t.shortcut.toUpperCase()})` : t.label}
          onClick={t.activate}
          style={btn}
          data-testid={`foldo-plugin-toolbar-tool-${t.id}`}
        >
          {t.icon}
          <span>{t.label}</span>
        </button>
      ))}
    </div>
  );
}
