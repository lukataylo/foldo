import type { ComponentType } from 'react';
import { FoldoMark, INK, PILLOW } from '../marketing/shared';
import type { HomeBoardSummary } from './api';
import type { Scope } from './HomeApp';
import { IconClock, IconFiles, IconGear, IconStar } from './icons';

type View = 'all' | 'recents' | 'starred';

const NAV: { id: View; label: string; Icon: ComponentType<{ size?: number }> }[] = [
  { id: 'recents', label: 'Recents', Icon: IconClock },
  { id: 'starred', label: 'Starred', Icon: IconStar },
  { id: 'all', label: 'All files', Icon: IconFiles },
];

interface SidebarProps {
  view: View;
  onView: (v: View) => void;
  scope: Scope;
  onScope: (s: Scope) => void;
  starredCount: number;
  boards: HomeBoardSummary[] | null;
}

export function Sidebar({
  view,
  onView,
  scope,
  onScope,
  starredCount,
  boards,
}: SidebarProps) {
  // Membership counts. "Teams" aren't a real entity in Foldo's data model —
  // only board memberships with owner/editor/viewer roles exist — so the
  // sidebar reflects that truthfully instead of faking team rows.
  const all = boards ?? [];
  const ownedCount = all.filter((b) => b.role === 'owner').length;
  const sharedCount = all.filter((b) => b.role !== 'owner').length;

  const scopeRows: { id: Scope; label: string; count: number; dot: string }[] = [
    { id: 'owned', label: 'Owned by me', count: ownedCount, dot: PILLOW },
    { id: 'shared', label: 'Shared with me', count: sharedCount, dot: '#5db0ff' },
  ];

  return (
    <aside
      className="home-sidebar"
      style={{
        background: 'transparent',
        borderRight: `1.5px solid #E6E3DE`,
        padding: '22px 14px 32px',
        position: 'sticky',
        top: 0,
        alignSelf: 'start',
        height: '100vh',
        overflowY: 'auto',
      }}
    >
      <a
        href="/"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          textDecoration: 'none',
          color: INK,
          padding: '0 8px 18px',
        }}
      >
        <FoldoMark size={28} />
        <span className="display" style={{ fontSize: 22, letterSpacing: '0.02em', lineHeight: 1, marginTop: 3 }}>Foldo</span>
      </a>

      <nav>
        {NAV.map((n) => (
          <button
            key={n.id}
            type="button"
            onClick={() => onView(n.id)}
            className={`home-sidebar-link${view === n.id ? ' is-active' : ''}`}
            style={{ width: '100%', textAlign: 'left', border: 0, background: 'transparent' }}
          >
            <span style={{ display: 'inline-flex', width: 18, alignItems: 'center', justifyContent: 'center', color: INK }} aria-hidden>
              <n.Icon size={15} />
            </span>
            <span style={{ flex: 1 }}>{n.label}</span>
            {n.id === 'starred' && starredCount > 0 && (
              <span style={{ fontSize: 11.5, color: '#666' }}>{starredCount}</span>
            )}
          </button>
        ))}
      </nav>

      <div className="home-section-label">MEMBERSHIP</div>
      <button
        type="button"
        onClick={() => onScope('everything')}
        className={`home-sidebar-link${scope === 'everything' ? ' is-active' : ''}`}
        style={{ width: '100%', textAlign: 'left', border: 0, background: 'transparent' }}
      >
        <span className="dot" style={{ width: 8, height: 8, borderRadius: '50%', background: '#bbb', flex: 'none' }} />
        <span style={{ flex: 1 }}>Everything</span>
        <span style={{ color: '#888', fontSize: 11.5 }}>{all.length}</span>
      </button>
      {scopeRows.map((r) => (
        <button
          key={r.id}
          type="button"
          onClick={() => onScope(r.id)}
          className={`home-sidebar-link${scope === r.id ? ' is-active' : ''}`}
          style={{ width: '100%', textAlign: 'left', border: 0, background: 'transparent' }}
        >
          <span className="dot" style={{ width: 8, height: 8, borderRadius: '50%', background: r.dot, flex: 'none' }} />
          <span style={{ flex: 1 }}>{r.label}</span>
          <span style={{ color: '#888', fontSize: 11.5 }}>{r.count}</span>
        </button>
      ))}

      <div style={{ marginTop: 'auto', paddingTop: 24 }}>
        <a
          href="/settings"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '8px 12px',
            fontSize: 13,
            color: '#666',
            textDecoration: 'none',
            borderRadius: 10,
          }}
        >
          <span style={{ display: 'inline-flex', width: 16, alignItems: 'center', justifyContent: 'center' }} aria-hidden>
            <IconGear size={14} />
          </span>
          Account & settings
        </a>
      </div>
    </aside>
  );
}
