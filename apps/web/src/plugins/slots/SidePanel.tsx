// Generic side-panel slot used for both LeftPanel and RightPanel. Pulls
// matching `leftPanel` / `rightPanel` tab contributions from the
// registry, renders a vertical tab strip + the active tab's body, and
// hides itself if no plugin contributes a tab.
//
// The active tab is local React state — no global tab-id selector yet.
// Once Layer Navigator + DOM Editor land, route deep-links (`?layer=…`)
// will lift this into a query-param hook.

import { useEffect, useState, type CSSProperties } from 'react';
import { usePluginSurfaces } from '../registry';

type Side = 'left' | 'right';

/* A+W1 touch: responsive sizing. On viewports <900px we narrow the panel from
   280px → 220px so it stops eating half the canvas on iPad portrait. On
   viewports <700px (rare — the phone banner usually kicks in first) the panel
   collapses to a small "Tabs" toggle button. */
function pickWidth(vw: number): number {
  if (vw < 900) return 220;
  return 280;
}

const containerBase: CSSProperties = {
  position: 'fixed',
  top: 56, // below TopBar
  bottom: 64, // above ToolBar
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
  /* A+W1 touch: padding 6x8 → 10x12 so the tab is comfortable on iPad. */
  padding: '10px 12px',
  minHeight: 40,
  border: 'none',
  background: 'transparent',
  color: '#9a9aa0',
  borderRadius: 6,
  fontSize: 13,
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

/* A+W1 touch: small floating "Tabs" toggle for very narrow viewports — sits
   along the panel's edge so the user has a way to bring the collapsed panel
   back without needing the keyboard. */
const collapsedToggleBase: CSSProperties = {
  position: 'fixed',
  top: '50%',
  transform: 'translateY(-50%)',
  background: 'rgba(20,20,22,0.92)',
  color: '#e8e8ea',
  border: 'none',
  padding: '10px 8px',
  fontSize: 11,
  cursor: 'pointer',
  borderRadius: 0,
  writingMode: 'vertical-rl',
  zIndex: 40,
  boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.06)',
};

function SidePanel({ side }: { side: Side }): JSX.Element | null {
  const surfaces = usePluginSurfaces(side === 'left' ? 'leftPanel' : 'rightPanel');
  const tabs = surfaces.map((s) => s.tab);
  const [activeId, setActiveId] = useState<string | null>(tabs[0]?.id ?? null);

  /* A+W1 touch: track viewport width to compute panel width + collapse mode. */
  const [vw, setVw] = useState<number>(
    typeof window === 'undefined' ? 1440 : window.innerWidth,
  );
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onResize = (): void => setVw(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  const collapseByDefault = vw < 700;
  const [userCollapsed, setUserCollapsed] = useState<boolean>(collapseByDefault);
  // Re-sync when the viewport crosses the breakpoint so a portrait → landscape
  // rotation re-expands automatically.
  useEffect(() => {
    setUserCollapsed(collapseByDefault);
  }, [collapseByDefault]);

  if (tabs.length === 0) return null;
  const active = tabs.find((t) => t.id === activeId) ?? tabs[0]!;

  const positional: CSSProperties =
    side === 'left' ? { left: 0 } : { right: 0 };

  // Collapsed state: render only a small toggle button along the screen edge.
  if (userCollapsed) {
    return (
      <button
        type="button"
        data-testid={`foldo-plugin-${side}-panel-toggle`}
        style={{
          ...collapsedToggleBase,
          ...(side === 'left' ? { left: 0 } : { right: 0 }),
        }}
        onClick={() => setUserCollapsed(false)}
        aria-label={`Open ${side} panel`}
      >
        Tabs
      </button>
    );
  }

  return (
    <aside
      data-testid={`foldo-plugin-${side}-panel`}
      style={{ ...containerBase, ...positional, width: pickWidth(vw) }}
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
        {/* A+W1 touch: collapse handle is always visible on narrow tablets so
            the user can reclaim canvas space without keyboard. */}
        {vw < 900 && (
          <button
            type="button"
            onClick={() => setUserCollapsed(true)}
            aria-label={`Collapse ${side} panel`}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#9a9aa0',
              padding: '10px 8px',
              minHeight: 40,
              cursor: 'pointer',
              fontSize: 14,
            }}
            data-testid={`foldo-plugin-${side}-panel-collapse`}
          >
            {side === 'left' ? '‹' : '›'}
          </button>
        )}
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
