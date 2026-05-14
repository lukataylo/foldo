import type { ComponentType } from 'react';
import { FoldoMark, INK, PILLOW } from '../marketing/shared';
import type { HomeBoardSummary } from './api';
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
  starredCount: number;
  boards: HomeBoardSummary[] | null;
}

export function Sidebar({ view, onView, starredCount, boards }: SidebarProps) {
  // Group boards by team prefix (e.g. "acme/landing" → "acme").
  const teams = new Map<string, number>();
  for (const b of boards ?? []) {
    const prefix = b.repoSlug.split('/')[0] || '·';
    teams.set(prefix, (teams.get(prefix) ?? 0) + 1);
  }
  const teamList = [...teams.entries()].sort((a, b) => b[1] - a[1]);

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

      {teamList.length > 0 && (
        <>
          <div className="home-section-label">TEAMS</div>
          {teamList.map(([team, count]) => (
            <div key={team} className="home-team">
              <span className="dot" style={{ background: pickTeamColor(team) }} />
              <span style={{ flex: 1 }}>{team}</span>
              <span style={{ color: '#888', fontSize: 11.5 }}>{count}</span>
            </div>
          ))}
        </>
      )}

      <div className="home-section-label">SHARED</div>
      <div className="home-team" style={{ color: '#777', fontSize: 13 }}>
        <span className="dot" style={{ background: PILLOW }} />
        <span style={{ flex: 1 }}>With me</span>
        <span style={{ color: '#888', fontSize: 11.5 }}>
          {(boards ?? []).filter((b) => b.role !== 'owner').length}
        </span>
      </div>
      <div className="home-team" style={{ color: '#777', fontSize: 13 }}>
        <span className="dot" />
        <span style={{ flex: 1 }}>By me</span>
        <span style={{ color: '#888', fontSize: 11.5 }}>
          {(boards ?? []).filter((b) => b.role === 'owner').length}
        </span>
      </div>

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

function pickTeamColor(team: string): string {
  const palette = ['#ff7849', '#5db0ff', '#b08cff', '#7fd49a', '#f5b86b', '#ff8ec2'];
  let h = 0;
  for (const ch of team) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return palette[h % palette.length];
}
