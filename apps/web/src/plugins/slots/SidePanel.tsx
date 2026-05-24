// Generic side-panel slot used for both LeftPanel and RightPanel. Pulls
// matching `leftPanel` / `rightPanel` tab contributions from the
// registry, renders a vertical tab strip + the active tab's body, and
// hides itself if no plugin contributes a tab.
//
// Active tab is route-backed via `?leftTab=…` / `?rightTab=…` query params
// so a tab selection survives reload + is deep-linkable. Falls back to the
// first tab when the param is absent or names an unknown tab.

import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react';
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

// Floating Figma-style panel: insets from the screen edges (so the
// TopBar above and PluginToolBar below stay fully visible and the panel
// reads as a "card" floating on the canvas), rounded corners, soft
// outer shadow + crisp inner hairline. zIndex sits BELOW the TopBar
// (z=50) so a stray full-bleed panel can never paint over it.
const containerBase: CSSProperties = {
  position: 'fixed',
  top: 64, // below TopBar (~56px) + 8px gap
  bottom: 80, // above PluginToolBar (~60px) + 20px gap
  display: 'flex',
  flexDirection: 'column',
  background: 'rgba(20, 20, 22, 0.96)',
  backdropFilter: 'blur(14px)',
  WebkitBackdropFilter: 'blur(14px)',
  borderRadius: 12,
  border: '1px solid rgba(255,255,255,0.06)',
  boxShadow: '0 12px 40px rgba(0,0,0,0.4)',
  zIndex: 35,
  color: '#e8e8ea',
  overflow: 'hidden', // round body corners with the parent
};

// Tab strip header: subtle, compact. When there's only ONE tab we
// shrink-wrap the label so the strip reads as a "panel title" rather
// than a giant button (the previous full-width treatment looked like a
// CTA dominating the top of the panel).
const tabStrip: CSSProperties = {
  display: 'flex',
  gap: 2,
  padding: '8px 10px',
  borderBottom: '1px solid rgba(255,255,255,0.06)',
  flexShrink: 0,
};

const tabBtn: CSSProperties = {
  // Default tab button: equal-width when multiple tabs, content-width
  // when single. The flex value is overridden inline below based on
  // tabs.length so a 1-tab panel reads as a title not a button.
  padding: '6px 10px',
  minHeight: 28,
  border: 'none',
  background: 'transparent',
  color: '#9a9aa0',
  borderRadius: 6,
  fontSize: 12,
  fontWeight: 500,
  letterSpacing: 0.2,
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 6,
  transition: 'background 80ms, color 80ms',
};

const tabBtnActive: CSSProperties = {
  ...tabBtn,
  background: 'rgba(255,255,255,0.06)',
  color: '#e8e8ea',
};

const body: CSSProperties = {
  flex: 1,
  overflow: 'auto',
  padding: '8px 12px 12px 12px',
};

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

/**
 * Tiny `?leftTab=` / `?rightTab=` hook. We don't extend Router (it's path-
 * shaped, not query-shaped) — the panel substrate is the only thing that
 * needs query state today, so a local helper is the lighter-weight option.
 *
 * Writes use `history.replaceState` (a tab switch shouldn't pile a back-
 * stack entry per click) and dispatch a custom `foldo:tabchange` event so
 * sibling panels (LeftPanel + RightPanel coexist) reconcile without each
 * polling location.search.
 */
function useTabRouteParam(paramName: string): {
  value: string | null;
  set: (v: string | null) => void;
} {
  const read = useCallback((): string | null => {
    if (typeof location === 'undefined') return null;
    const sp = new URLSearchParams(location.search);
    return sp.get(paramName);
  }, [paramName]);
  const [value, setValue] = useState<string | null>(read);

  useEffect(() => {
    const sync = (): void => setValue(read());
    window.addEventListener('popstate', sync);
    window.addEventListener('foldo:tabchange', sync as EventListener);
    return () => {
      window.removeEventListener('popstate', sync);
      window.removeEventListener('foldo:tabchange', sync as EventListener);
    };
  }, [read]);

  const set = useCallback(
    (v: string | null): void => {
      if (typeof location === 'undefined') return;
      const sp = new URLSearchParams(location.search);
      if (v === null) sp.delete(paramName);
      else sp.set(paramName, v);
      const qs = sp.toString();
      const next = location.pathname + (qs ? `?${qs}` : '') + location.hash;
      history.replaceState({}, '', next);
      setValue(v);
      // Tell the sibling panel + other listeners.
      window.dispatchEvent(new Event('foldo:tabchange'));
    },
    [paramName],
  );

  return { value, set };
}

function SidePanel({ side }: { side: Side }): JSX.Element | null {
  const surfaces = usePluginSurfaces(side === 'left' ? 'leftPanel' : 'rightPanel');
  const tabs = useMemo(() => surfaces.map((s) => s.tab), [surfaces]);
  const { value: routeTab, set: setRouteTab } = useTabRouteParam(
    side === 'left' ? 'leftTab' : 'rightTab',
  );

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
  // Resolve active tab: route param if it names a real tab, else first tab.
  const active = tabs.find((t) => t.id === routeTab) ?? tabs[0]!;
  const onSelectTab = (id: string): void => {
    // Writing the first tab as the route value lets a deep-link force the
    // first tab even after a future plugin install reshuffles ordering.
    setRouteTab(id);
  };

  // Inset from the screen edge so the panel reads as a floating card
  // rather than a full-bleed sidebar. 12px on desktop, 8px on narrow.
  const edgeInset = vw < 900 ? 8 : 12;
  const positional: CSSProperties =
    side === 'left' ? { left: edgeInset } : { right: edgeInset };

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
          // Single-tab panel: render as left-aligned title, no flex
          // expansion. Multi-tab: equal-width segmented control.
          const widthStyle: CSSProperties =
            tabs.length === 1
              ? { flex: 'initial', justifyContent: 'flex-start', paddingLeft: 4 }
              : { flex: 1 };
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              aria-controls={`foldo-plugin-${side}-body-${t.id}`}
              id={`foldo-plugin-${side}-tab-${t.id}-trigger`}
              onClick={() => onSelectTab(t.id)}
              style={{
                ...(isActive ? tabBtnActive : tabBtn),
                ...widthStyle,
                // Single-tab acts as a panel title — no hover/active
                // background since there's nothing to switch to.
                ...(tabs.length === 1
                  ? {
                      background: 'transparent',
                      color: '#9a9aa0',
                      cursor: 'default',
                      fontSize: 11,
                      fontWeight: 600,
                      letterSpacing: 0.6,
                      textTransform: 'uppercase',
                    }
                  : {}),
              }}
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
      <div
        style={body}
        role="tabpanel"
        id={`foldo-plugin-${side}-body-${active.id}`}
        aria-labelledby={`foldo-plugin-${side}-tab-${active.id}-trigger`}
        data-testid={`foldo-plugin-${side}-body-${active.id}`}
      >
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
