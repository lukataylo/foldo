// Bottom-center tool dock — the canvas's canonical tool surface. Pulls
// every `toolbar` surface contribution from the registry and lays them
// out as a horizontal icon-only rail. Hides itself if no plugin
// contributes tools.
//
// Visual: small icon-only square buttons on the dark `bg-panel` token —
// same style language as the side panels so the canvas reads as one
// design system rather than two competing rails.
//
// Buttons respect ToolSpec.group: a 1px vertical hairline divider sits
// between adjacent tools that disagree on `group`. a11y attributes
// (aria-label, aria-keyshortcuts, aria-pressed) announce label, bound
// shortcut, and active state to screen readers.
//
// The container carries the historical `foldo-canvas-leftrail` testid +
// per-button `foldo-rail-tool-<id>` testids so the existing e2e helpers
// (CanvasPage.clickTool, share-link visibility checks) keep working
// after the vertical LeftRail was retired.

import { Fragment, type CSSProperties } from 'react';
import { usePluginSurfaces, getCurrentTool } from '../registry';

const wrap: CSSProperties = {
  position: 'fixed',
  bottom: 16,
  left: '50%',
  transform: 'translateX(-50%)',
  display: 'flex',
  alignItems: 'center',
  gap: 2,
  padding: 4,
  background: '#2c2c2c',
  border: '1px solid #323232',
  borderRadius: 10,
  boxShadow: '0 12px 32px rgba(0,0,0,0.45)',
  // Chrome z-index — see SidePanel.tsx for the rationale.
  zIndex: 110,
};

const btn: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 32,
  height: 32,
  padding: 0,
  borderRadius: 6,
  border: 'none',
  background: 'transparent',
  color: '#9a9a9a',
  cursor: 'pointer',
  transition: 'background 80ms, color 80ms',
};

const btnActive: CSSProperties = {
  ...btn,
  background: 'rgba(253,179,6,0.16)',
  color: '#FDB306',
};

const divider: CSSProperties = {
  width: 1,
  alignSelf: 'stretch',
  margin: '4px 2px',
  background: '#323232',
};

export function ToolBar(): JSX.Element | null {
  const surfaces = usePluginSurfaces('toolbar');
  const tools = surfaces.flatMap((s) => s.tools);
  if (tools.length === 0) return null;
  const activeToolId = getCurrentTool();

  return (
    <div
      data-testid="foldo-canvas-leftrail"
      role="toolbar"
      aria-label="Canvas tools"
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
              data-testid={`foldo-rail-tool-${t.id}`}
            >
              {t.icon}
            </button>
          </Fragment>
        );
      })}
    </div>
  );
}
