// Bottom-center tool dock. Pulls every `toolbar` surface contribution
// from the registry and lays them out as a single horizontal pill. Hides
// itself if no plugin contributes tools — the existing LeftRail keeps
// rendering its hardcoded buttons until they're collapsed into a plugin
// in a Step 9 fast-follow.
//
// Visual style mirrors LeftRail.tsx — same pill background + button
// shape — so contributions look at-home alongside the legacy rail.
//
// /* A+W4 features */ — buttons now respect ToolSpec.group: a 1px vertical
// hairline divider sits between adjacent tools that disagree on `group`.
// Mirrors the LeftRail vertical pill so the two views read as the same
// taxonomy. Buttons also gain a11y attributes (aria-label,
// aria-keyshortcuts, aria-pressed) so screen readers announce both the
// label and the bound shortcut, plus the active state.

import { Fragment, type CSSProperties } from 'react';
import { usePluginSurfaces, getCurrentTool } from '../registry';

const wrap: CSSProperties = {
  position: 'fixed',
  bottom: 20,
  left: '50%',
  transform: 'translateX(-50%)',
  display: 'flex',
  alignItems: 'center',
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

const btnActive: CSSProperties = {
  ...btn,
  background: 'rgba(255,255,255,0.10)',
  color: '#ffffff',
};

const divider: CSSProperties = {
  width: 1,
  alignSelf: 'stretch',
  margin: '4px 2px',
  background: 'rgba(255,255,255,0.10)',
};

export function ToolBar(): JSX.Element | null {
  const surfaces = usePluginSurfaces('toolbar');
  const tools = surfaces.flatMap((s) => s.tools);
  if (tools.length === 0) return null;
  // Live tool id (or null pre-mount). Read once per render — the pill is
  // cheap enough that we don't bother subscribing to App's state.
  const activeToolId = getCurrentTool();

  return (
    <div
      data-testid="foldo-plugin-toolbar"
      role="toolbar"
      aria-label="Plugin tools"
      style={wrap}
    >
      {tools.map((t, i) => {
        const prev = i > 0 ? tools[i - 1] : undefined;
        const groupChanged =
          !!prev && (prev.group ?? '') !== (t.group ?? '');
        const isActive = activeToolId === t.id;
        return (
          <Fragment key={t.id}>
            {groupChanged ? (
              <div
                aria-hidden="true"
                data-testid="foldo-plugin-toolbar-divider"
                style={divider}
              />
            ) : null}
            <button
              type="button"
              title={t.shortcut ? `${t.label} (${t.shortcut.toUpperCase()})` : t.label}
              aria-label={t.label}
              aria-keyshortcuts={t.shortcut ?? undefined}
              aria-pressed={isActive}
              onClick={t.activate}
              style={isActive ? btnActive : btn}
              data-testid={`foldo-plugin-toolbar-tool-${t.id}`}
            >
              {t.icon}
              <span>{t.label}</span>
            </button>
          </Fragment>
        );
      })}
    </div>
  );
}
