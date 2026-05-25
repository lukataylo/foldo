// Generic side-panel slot used for both LeftPanel and RightPanel. Pulls
// matching `leftPanel` / `rightPanel` tab contributions from the
// registry, renders a vertical tab strip + the active tab's body, and
// hides itself if no plugin contributes a tab.
//
// Active tab is route-backed via `?leftTab=…` / `?rightTab=…` query params
// so a tab selection survives reload + is deep-linkable. Falls back to the
// first tab when the param is absent or names an unknown tab.
//
// Collapsed state: the user can collapse either panel into a vertical
// icon pill at the screen edge. Each pill icon corresponds to one tab;
// clicking expands the panel + switches to that tab. The collapsed flag
// is persisted to localStorage so it survives reloads.

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { usePluginSurfaces } from '../registry';

type Side = 'left' | 'right';

/* Responsive width: on viewports <900px we narrow the panel from 280→220px
   so it stops eating half the canvas on iPad portrait. */
function pickWidth(vw: number): number {
  if (vw < 900) return 220;
  return 280;
}

// Expanded floating card — dark panel token, soft outer shadow + crisp
// inner hairline. zIndex sits BELOW the TopBar (z=50) so a stray full-
// bleed panel can never paint over it.
const containerBase: CSSProperties = {
  position: 'fixed',
  top: 64,
  bottom: 72,
  display: 'flex',
  flexDirection: 'column',
  background: '#2c2c2c',
  borderRadius: 10,
  border: '1px solid #323232',
  boxShadow: '0 12px 32px rgba(0,0,0,0.45)',
  /* Chrome z-index lives in the 100-range so canvas-side overlays
     (popovers, iframe portals, comment pins) can never paint over it
     regardless of zoom level. */
  zIndex: 100,
  color: '#e8e8ea',
  overflow: 'hidden',
};

// Pill container: same vertical rhythm as the expanded card, ~36px wide,
// vertical stack of icon buttons.
const pillBase: CSSProperties = {
  position: 'fixed',
  top: 64,
  width: 36,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 2,
  padding: 4,
  background: '#2c2c2c',
  borderRadius: 10,
  border: '1px solid #323232',
  boxShadow: '0 12px 32px rgba(0,0,0,0.45)',
  zIndex: 100,
  color: '#e8e8ea',
};

const pillBtnBase: CSSProperties = {
  width: 28,
  height: 28,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: 'transparent',
  color: '#9a9a9a',
  border: 'none',
  borderRadius: 6,
  cursor: 'pointer',
  fontSize: 13,
  transition: 'background 80ms, color 80ms',
};

const pillBtnActive: CSSProperties = {
  ...pillBtnBase,
  background: 'rgba(253,179,6,0.16)',
  color: '#FDB306',
};

const pillDivider: CSSProperties = {
  width: '70%',
  height: 1,
  background: '#323232',
  margin: '2px 0',
};

const tabStrip: CSSProperties = {
  display: 'flex',
  gap: 2,
  padding: '6px 6px',
  borderBottom: '1px solid #323232',
  flexShrink: 0,
  alignItems: 'center',
};

const tabBtn: CSSProperties = {
  padding: '5px 8px',
  minHeight: 26,
  border: 'none',
  background: 'transparent',
  color: '#9a9a9a',
  borderRadius: 5,
  fontSize: 11,
  fontWeight: 500,
  letterSpacing: 0.2,
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 5,
  transition: 'background 80ms, color 80ms',
};

const tabBtnActive: CSSProperties = {
  ...tabBtn,
  background: 'rgba(255,255,255,0.06)',
  color: '#e8e8ea',
};

const collapseHandle: CSSProperties = {
  background: 'transparent',
  border: 'none',
  color: '#9a9a9a',
  width: 22,
  height: 22,
  padding: 0,
  cursor: 'pointer',
  fontSize: 14,
  borderRadius: 4,
  marginLeft: 'auto',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
};

const body: CSSProperties = {
  flex: 1,
  overflow: 'auto',
  padding: '8px 10px 10px 10px',
};

/**
 * Tiny `?leftTab=` / `?rightTab=` hook. We don't extend Router (it's path-
 * shaped, not query-shaped) — the panel substrate is the only thing that
 * needs query state today, so a local helper is the lighter-weight option.
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
      window.dispatchEvent(new Event('foldo:tabchange'));
    },
    [paramName],
  );

  return { value, set };
}

/** Persist the collapsed flag per-side so reloads remember the user's choice. */
function useCollapsedFlag(side: Side, defaultCollapsed: boolean): {
  collapsed: boolean;
  setCollapsed: (v: boolean) => void;
} {
  const key = `foldo:sidepanel:${side}:collapsed`;
  const read = (): boolean => {
    if (typeof localStorage === 'undefined') return defaultCollapsed;
    const raw = localStorage.getItem(key);
    if (raw === null) return defaultCollapsed;
    return raw === '1';
  };
  const [collapsed, setCollapsedState] = useState<boolean>(read);
  const setCollapsed = useCallback(
    (v: boolean): void => {
      setCollapsedState(v);
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(key, v ? '1' : '0');
      }
    },
    [key],
  );
  return { collapsed, setCollapsed };
}

function SidePanel({ side }: { side: Side }): JSX.Element | null {
  const surfaces = usePluginSurfaces(side === 'left' ? 'leftPanel' : 'rightPanel');
  const tabs = useMemo(() => surfaces.map((s) => s.tab), [surfaces]);
  const { value: routeTab, set: setRouteTab } = useTabRouteParam(
    side === 'left' ? 'leftTab' : 'rightTab',
  );

  const [vw, setVw] = useState<number>(
    typeof window === 'undefined' ? 1440 : window.innerWidth,
  );
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onResize = (): void => setVw(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // Default-collapse on phone-sized viewports so the pill, not the full
  // card, is what shows up first. The localStorage flag overrides if the
  // user has explicitly toggled it.
  const { collapsed, setCollapsed } = useCollapsedFlag(side, vw < 700);

  if (tabs.length === 0) return null;

  const active = tabs.find((t) => t.id === routeTab) ?? tabs[0]!;
  const onSelectTab = (id: string): void => setRouteTab(id);

  // Pill + expanded panel both inset from the screen edge by 12px (8px on
  // narrow). The bottom edge tracks the canvas tool dock.
  const edgeInset = vw < 900 ? 8 : 12;
  const positional: CSSProperties =
    side === 'left' ? { left: edgeInset } : { right: edgeInset };

  if (collapsed) {
    return (
      <aside
        data-testid={`foldo-plugin-${side}-panel-pill`}
        aria-label={`${side === 'left' ? 'Left' : 'Right'} panel (collapsed)`}
        style={{
          ...pillBase,
          ...positional,
          bottom: vw < 700 ? 72 : undefined,
        }}
      >
        {tabs.map((t, i) => {
          const isActive = t.id === active.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => {
                setRouteTab(t.id);
                setCollapsed(false);
              }}
              style={isActive ? pillBtnActive : pillBtnBase}
              title={`${t.label} — expand panel`}
              aria-label={`${t.label} — expand panel`}
              data-testid={`foldo-plugin-${side}-pill-${t.id}`}
            >
              {renderPillIcon(t.icon, t.label)}
            </button>
          );
        })}
        <div aria-hidden style={pillDivider} />
        <button
          type="button"
          onClick={() => setCollapsed(false)}
          style={pillBtnBase}
          title="Expand panel"
          aria-label={`Expand ${side} panel`}
          data-testid={`foldo-plugin-${side}-pill-expand`}
        >
          {side === 'left' ? '›' : '‹'}
        </button>
      </aside>
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
              aria-controls={`foldo-plugin-${side}-body-${t.id}`}
              id={`foldo-plugin-${side}-tab-${t.id}-trigger`}
              onClick={() => onSelectTab(t.id)}
              style={{
                ...(isActive ? tabBtnActive : tabBtn),
                flex: tabs.length === 1 ? 'initial' : 1,
              }}
              data-testid={`foldo-plugin-${side}-tab-${t.id}`}
            >
              {t.icon}
              <span>{t.label}</span>
              {t.badge ? <span style={{ marginLeft: 4 }}>{t.badge}</span> : null}
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => setCollapsed(true)}
          style={collapseHandle}
          aria-label={`Collapse ${side} panel`}
          title="Collapse to icon pill"
          data-testid={`foldo-plugin-${side}-panel-collapse`}
        >
          {side === 'left' ? '‹' : '›'}
        </button>
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

/**
 * Tab icons in the expanded strip live next to a label; in the collapsed
 * pill they're the only affordance for distinguishing tabs. If a plugin
 * didn't ship an icon we fall back to the first letter of its label.
 */
function renderPillIcon(icon: ReactNode | undefined, label: string): ReactNode {
  if (icon !== undefined && icon !== null && icon !== '') return icon;
  return label.charAt(0).toUpperCase();
}

export function LeftPanel(): JSX.Element | null {
  return <SidePanel side="left" />;
}

export function RightPanel(): JSX.Element | null {
  return <SidePanel side="right" />;
}
