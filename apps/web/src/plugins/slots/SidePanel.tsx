// Generic side-panel slot used for both LeftPanel and RightPanel. Pulls
// matching `leftPanel` / `rightPanel` tab contributions from the
// registry, renders a vertical tab strip + the active tab's body, and
// hides itself if no plugin contributes a tab.
//
// The active tab is local React state — no global tab-id selector yet.
// Once Layer Navigator + DOM Editor land, route deep-links (`?layer=…`)
// will lift this into a query-param hook.

import { useState, type CSSProperties } from 'react';
import { usePluginSurfaces } from '../registry';

type Side = 'left' | 'right';

const containerBase: CSSProperties = {
  position: 'fixed',
  top: 56, // below TopBar
  bottom: 64, // above ToolBar
  width: 280,
  display: 'flex',
  flexDirection: 'column',
  background: 'rgba(20, 20, 22, 0.92)',
  backdropFilter: 'blur(12px)',
  boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.06)',
  zIndex: 40,
  color: '#e8e8ea',
};

const tabStrip: CSSProperties = {
  display: 'flex',
  gap: 2,
  padding: 6,
  borderBottom: '1px solid rgba(255,255,255,0.06)',
};

const tabBtn: CSSProperties = {
  flex: 1,
  padding: '6px 8px',
  border: 'none',
  background: 'transparent',
  color: '#9a9aa0',
  borderRadius: 6,
  fontSize: 12,
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 4,
};

const tabBtnActive: CSSProperties = {
  ...tabBtn,
  background: 'rgba(255,255,255,0.06)',
  color: '#e8e8ea',
};

const body: CSSProperties = { flex: 1, overflow: 'auto', padding: 12 };

function SidePanel({ side }: { side: Side }): JSX.Element | null {
  const surfaces = usePluginSurfaces(side === 'left' ? 'leftPanel' : 'rightPanel');
  const tabs = surfaces.map((s) => s.tab);
  const [activeId, setActiveId] = useState<string | null>(tabs[0]?.id ?? null);

  if (tabs.length === 0) return null;
  const active = tabs.find((t) => t.id === activeId) ?? tabs[0]!;

  const positional: CSSProperties =
    side === 'left' ? { left: 0 } : { right: 0 };

  return (
    <aside
      data-testid={`foldo-plugin-${side}-panel`}
      style={{ ...containerBase, ...positional }}
    >
      <div style={tabStrip} role="tablist">
        {tabs.map((t) => {
          const isActive = t.id === active.id;
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => setActiveId(t.id)}
              style={isActive ? tabBtnActive : tabBtn}
              data-testid={`foldo-plugin-${side}-tab-${t.id}`}
            >
              {t.icon}
              <span>{t.label}</span>
              {t.badge ? <span style={{ marginLeft: 4 }}>{t.badge}</span> : null}
            </button>
          );
        })}
      </div>
      <div style={body} data-testid={`foldo-plugin-${side}-body-${active.id}`}>
        {active.render()}
      </div>
    </aside>
  );
}

export function LeftPanel(): JSX.Element | null {
  return <SidePanel side="left" />;
}

export function RightPanel(): JSX.Element | null {
  return <SidePanel side="right" />;
}
