// Branches panel body. Reads `branches` + `frames` Maps from the
// BoardStore + the client-only selection store (selectionStore). Each
// row shows the canvas context (frame count) and stubbed git metadata
// until `/api/branches/:id/git` lands.
//
// Selection rules (see the rollout plan in the doc):
//   - Click row     → setSelectedBranch + pan-to-fit that branch's frames.
//   - Cmd-click row → toggle Solo (hide other branches' frames).
//   - Click again   → deselect, exit Solo.
//   - Esc on panel  → clear selection.
//
// Grouping: branches are bucketed by status (Active / Stale / Merged).
// Stale = no commits in 30 days (stubbed for now). Merged = stub PR
// state. Default-open: Active. Stale/Merged collapsed.

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import type { Branch, Frame } from '@foldo/protocol';
import { useBoardSelector } from '../../state/useBoardStore';
import { selectionStore, useSelection } from '../../state/selectionStore';
import { getFitToHook } from '../registry';

// ---------- styles ----------

const containerStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
  height: '100%',
};

const searchStyle: CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  background: 'rgba(0,0,0,0.25)',
  color: '#e8e8ea',
  border: '1px solid #323232',
  borderRadius: 4,
  padding: '5px 8px',
  height: 26,
  fontSize: 12,
  outline: 'none',
};

const filterRow: CSSProperties = {
  display: 'flex',
  gap: 4,
  paddingBottom: 6,
  borderBottom: '1px solid #323232',
};

const filterChip: CSSProperties = {
  padding: '3px 8px',
  height: 22,
  background: 'rgba(255,255,255,0.03)',
  color: '#9a9a9a',
  border: '1px solid #323232',
  borderRadius: 11,
  cursor: 'pointer',
  fontSize: 10,
  fontWeight: 500,
  letterSpacing: 0.4,
  textTransform: 'uppercase',
};

const filterChipActive: CSSProperties = {
  ...filterChip,
  background: 'rgba(253,179,6,0.12)',
  color: '#FDB306',
  borderColor: 'rgba(253,179,6,0.35)',
};

const listStyle: CSSProperties = {
  flex: 1,
  overflow: 'auto',
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
};

const groupHeaderStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 4,
  padding: '6px 4px 2px 4px',
  fontSize: 10,
  fontWeight: 600,
  letterSpacing: 0.6,
  textTransform: 'uppercase',
  color: '#7a7a80',
  background: 'transparent',
  border: 'none',
  cursor: 'pointer',
  textAlign: 'left',
  width: '100%',
};

const rowStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 3,
  padding: '7px 8px 7px 10px',
  borderRadius: 4,
  background: 'rgba(255,255,255,0.02)',
  border: '1px solid #2a2a2a',
  cursor: 'pointer',
  position: 'relative',
  transition: 'background 80ms, border-color 80ms',
};

const rowSelected: CSSProperties = {
  ...rowStyle,
  background: 'rgba(253,179,6,0.06)',
  borderColor: 'rgba(253,179,6,0.35)',
  boxShadow: 'inset 4px 0 0 0 #FDB306',
  paddingLeft: 12,
};

const rowSoloed: CSSProperties = {
  ...rowSelected,
  background: 'rgba(253,179,6,0.12)',
};

const rowHeaderStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
};

const dotStyle: CSSProperties = {
  width: 8,
  height: 8,
  borderRadius: '50%',
  flexShrink: 0,
};

const nameStyle: CSSProperties = {
  flex: 1,
  fontSize: 12,
  color: '#e8e8ea',
  fontWeight: 500,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

const prBadge: CSSProperties = {
  fontSize: 9,
  padding: '1px 5px',
  borderRadius: 3,
  background: 'rgba(150,255,150,0.10)',
  border: '1px solid rgba(150,255,150,0.25)',
  color: '#9ed29e',
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
  flexShrink: 0,
  fontWeight: 600,
};

const prBadgeMerged: CSSProperties = {
  ...prBadge,
  background: 'rgba(180,150,255,0.10)',
  borderColor: 'rgba(180,150,255,0.25)',
  color: '#c8b5ff',
};

const prBadgeDraft: CSSProperties = {
  ...prBadge,
  background: 'rgba(150,150,150,0.10)',
  borderColor: 'rgba(150,150,150,0.25)',
  color: '#a8a8a8',
};

const soloBadge: CSSProperties = {
  fontSize: 9,
  padding: '1px 5px',
  borderRadius: 3,
  background: '#FDB306',
  color: '#1a1a1d',
  flexShrink: 0,
  fontWeight: 700,
  letterSpacing: 0.4,
};

const metaStyle: CSSProperties = {
  fontSize: 10,
  color: '#7a7a80',
  display: 'flex',
  gap: 6,
  alignItems: 'center',
  flexWrap: 'wrap',
};

const monoStyle: CSSProperties = {
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
};

const statusLine: CSSProperties = {
  fontSize: 10,
  color: '#FDB306',
  fontWeight: 500,
};

const actionRow: CSSProperties = {
  display: 'flex',
  gap: 4,
  marginTop: 3,
};

const actionBtn: CSSProperties = {
  fontSize: 10,
  padding: '3px 8px',
  height: 22,
  background: 'rgba(255,255,255,0.03)',
  color: '#c8c8cc',
  border: '1px solid #323232',
  borderRadius: 3,
  cursor: 'pointer',
};

const stubBannerStyle: CSSProperties = {
  fontSize: 10,
  color: '#7a7a80',
  padding: '6px 8px',
  background: 'rgba(253,179,6,0.05)',
  border: '1px dashed rgba(253,179,6,0.25)',
  borderRadius: 3,
  lineHeight: 1.4,
};

const tipStyle: CSSProperties = {
  fontSize: 10.5,
  color: '#c8c8cc',
  padding: '8px 10px',
  background: 'rgba(255,255,255,0.03)',
  border: '1px solid #323232',
  borderRadius: 4,
  lineHeight: 1.5,
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
};

// ---------- stubbed git metadata ----------

interface StubbedGitMeta {
  ahead: number;
  behind: number;
  prNumber: number | null;
  prState: 'open' | 'merged' | 'draft' | null;
  isCheckedOut: boolean;
  /** Synthesised "days since last commit" — drives the Stale group. */
  daysSinceLastCommit: number;
}

function stubGitMeta(branch: Branch): StubbedGitMeta {
  let h = 0;
  for (let i = 0; i < branch.name.length; i += 1) {
    h = (h * 31 + branch.name.charCodeAt(i)) >>> 0;
  }
  const isMain = branch.name === 'main';
  const ahead = isMain ? 0 : (h % 9);
  const behind = isMain ? 0 : ((h >> 3) % 4);
  const hasPr = branch.name.startsWith('feat/') || branch.name.startsWith('fix/');
  const prNumber = hasPr ? 30 + (h % 40) : null;
  const prState: StubbedGitMeta['prState'] = hasPr
    ? (h & 1) === 0
      ? 'open'
      : (h & 2) === 0
        ? 'draft'
        : 'merged'
    : null;
  const daysSinceLastCommit = isMain ? 0 : ((h >> 5) % 60);
  return {
    ahead,
    behind,
    prNumber,
    prState,
    isCheckedOut: isMain,
    daysSinceLastCommit,
  };
}

function notify(msg: string): void {
  const fn = (window as unknown as { __foldoToast?: (m: string) => void }).__foldoToast;
  if (fn) fn(msg);
}

// ---------- helpers ----------

type FilterMode = 'active' | 'mine' | 'stale' | 'all';

function bucketFor(meta: StubbedGitMeta): 'active' | 'stale' | 'merged' {
  if (meta.prState === 'merged') return 'merged';
  if (meta.daysSinceLastCommit > 30) return 'stale';
  return 'active';
}

function fitFramesForBranch(branchId: string, frames: Map<string, Frame>): void {
  const matching: Frame[] = [];
  for (const f of frames.values()) {
    if (f.branchId === branchId) matching.push(f);
  }
  if (matching.length === 0) {
    notify('No frames on this branch yet — nothing to focus.');
    return;
  }
  // World rect that covers every frame on the branch, with a small pad.
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const f of matching) {
    minX = Math.min(minX, f.position.x);
    minY = Math.min(minY, f.position.y);
    maxX = Math.max(maxX, f.position.x + f.size.width);
    maxY = Math.max(maxY, f.position.y + f.size.height);
  }
  const pad = 80;
  const fit = getFitToHook();
  if (!fit) return;
  fit({
    x: minX - pad,
    y: minY - pad,
    width: maxX - minX + pad * 2,
    height: maxY - minY + pad * 2,
  });
}

// ---------- component ----------

const TIP_LS_KEY = 'foldo:branches:tip-dismissed';

export function BranchesPanel(): JSX.Element {
  const branches = useBoardSelector((s) => s.branches);
  const frames = useBoardSelector((s) => s.frames);
  const { selectedBranchId, soloBranchId } = useSelection();

  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<FilterMode>('active');
  const [collapsed, setCollapsed] = useState<Set<'active' | 'stale' | 'merged'>>(
    () => new Set(['merged']),
  );
  const [tipDismissed, setTipDismissed] = useState<boolean>(() => {
    if (typeof localStorage === 'undefined') return false;
    return localStorage.getItem(TIP_LS_KEY) === '1';
  });
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Branch list with metadata + bucket.
  const enriched = useMemo(() => {
    const list = Array.from(branches.values()).map((b) => {
      const meta = stubGitMeta(b);
      return { branch: b, meta, bucket: bucketFor(meta) };
    });
    list.sort((a, b) => {
      // main first, then alphabetical
      if (a.branch.name === 'main') return -1;
      if (b.branch.name === 'main') return 1;
      return a.branch.name.localeCompare(b.branch.name);
    });
    return list;
  }, [branches]);

  const frameCountByBranch = useMemo(() => {
    const out = new Map<string, number>();
    for (const f of frames.values()) {
      out.set(f.branchId, (out.get(f.branchId) ?? 0) + 1);
    }
    return out;
  }, [frames]);

  // Apply search + filter.
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return enriched.filter(({ branch, bucket }) => {
      if (q && !branch.name.toLowerCase().includes(q)) return false;
      if (filter === 'all') return true;
      if (filter === 'active') return bucket === 'active';
      if (filter === 'stale') return bucket === 'stale';
      if (filter === 'mine') {
        // "Mine" = branches authored by the current user. We don't have
        // the user id here, so for the stub we treat human-authored as Mine.
        return branch.authoredBy === 'human';
      }
      return true;
    });
  }, [enriched, query, filter]);

  // Group visible branches by bucket.
  const grouped = useMemo(() => {
    const out = { active: [] as typeof visible, stale: [] as typeof visible, merged: [] as typeof visible };
    for (const e of visible) out[e.bucket].push(e);
    return out;
  }, [visible]);

  const onSelectBranch = useCallback(
    (branch: Branch, modifiers: { meta: boolean; shift: boolean }): void => {
      // Cmd-click: toggle Solo on this branch.
      if (modifiers.meta) {
        if (soloBranchId === branch.id) {
          selectionStore.setSoloBranch(null);
        } else {
          selectionStore.setSoloBranch(branch.id);
          fitFramesForBranch(branch.id, frames);
        }
        return;
      }
      // Plain click: toggle selection.
      if (selectedBranchId === branch.id) {
        selectionStore.setSelectedBranch(null);
        return;
      }
      selectionStore.setSelectedBranch(branch.id);
      fitFramesForBranch(branch.id, frames);
    },
    [frames, selectedBranchId, soloBranchId],
  );

  const onCheckOut = useCallback((branch: Branch) => {
    notify(`Checkout of ${branch.name} is not wired yet — coming soon.`);
  }, []);

  // Esc on the panel clears selection.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return;
      const root = containerRef.current;
      if (!root) return;
      if (!root.contains(document.activeElement) && document.activeElement !== document.body) return;
      if (selectedBranchId || soloBranchId) {
        e.preventDefault();
        selectionStore.setSelectedBranch(null);
        selectionStore.setSoloBranch(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedBranchId, soloBranchId]);

  const dismissTip = useCallback(() => {
    setTipDismissed(true);
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem(TIP_LS_KEY, '1');
      } catch {
        /* swallow */
      }
    }
  }, []);

  const toggleGroup = useCallback((g: 'active' | 'stale' | 'merged') => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(g)) next.delete(g);
      else next.add(g);
      return next;
    });
  }, []);

  const showMergedGroup = filter === 'all';
  const showStaleGroup = filter === 'all' || filter === 'stale';
  const showActiveGroup = filter === 'all' || filter === 'active' || filter === 'mine';

  return (
    <div style={containerStyle} ref={containerRef} data-testid="foldo-branches-panel" tabIndex={-1}>
      <input
        type="search"
        placeholder={`Search ${enriched.length} branch${enriched.length === 1 ? '' : 'es'}…`}
        style={searchStyle}
        aria-label="Search branches"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        data-testid="foldo-branches-search"
      />
      <div style={filterRow} role="tablist" aria-label="Branch filter">
        {(['active', 'mine', 'stale', 'all'] as FilterMode[]).map((m) => (
          <button
            key={m}
            type="button"
            role="tab"
            aria-selected={filter === m}
            onClick={() => setFilter(m)}
            style={filter === m ? filterChipActive : filterChip}
            data-testid={`foldo-branches-filter-${m}`}
          >
            {m}
          </button>
        ))}
      </div>

      {!tipDismissed && enriched.length <= 1 ? (
        <div style={tipStyle} data-testid="foldo-branches-tip">
          <div>
            <strong style={{ color: '#FDB306' }}>ⓘ</strong> New branches you
            create with <code style={monoStyle}>/branch</code> or via Claude
            will show up here. Click any row to focus its frames on the canvas.
          </div>
          <button
            type="button"
            onClick={dismissTip}
            style={{ ...actionBtn, alignSelf: 'flex-start' }}
            data-testid="foldo-branches-tip-dismiss"
          >
            Got it
          </button>
        </div>
      ) : null}

      <div style={stubBannerStyle}>
        PR state + ahead/behind are stubbed. Wire{' '}
        <code style={monoStyle}>/api/branches/:id/git</code> for live data.
      </div>

      <div style={listStyle}>
        {enriched.length === 0 ? (
          <div
            style={{
              ...metaStyle,
              padding: '14px 8px',
              textAlign: 'center',
              justifyContent: 'center',
            }}
            data-testid="foldo-branches-empty"
          >
            No branches on this board yet.
          </div>
        ) : visible.length === 0 ? (
          <div
            style={{
              ...metaStyle,
              padding: '14px 8px',
              textAlign: 'center',
              justifyContent: 'center',
            }}
            data-testid="foldo-branches-no-match"
          >
            No branches match this filter.
          </div>
        ) : (
          <>
            {showActiveGroup && grouped.active.length > 0 ? (
              <GroupSection
                title={`Active (${grouped.active.length})`}
                slug="active"
                collapsed={collapsed.has('active')}
                onToggle={() => toggleGroup('active')}
              >
                {grouped.active.map((e) => (
                  <BranchRow
                    key={e.branch.id}
                    branch={e.branch}
                    meta={e.meta}
                    frameCount={frameCountByBranch.get(e.branch.id) ?? 0}
                    selected={selectedBranchId === e.branch.id}
                    soloed={soloBranchId === e.branch.id}
                    onClick={(mods) => onSelectBranch(e.branch, mods)}
                    onCheckOut={() => onCheckOut(e.branch)}
                  />
                ))}
              </GroupSection>
            ) : null}
            {showStaleGroup && grouped.stale.length > 0 ? (
              <GroupSection
                title={`Stale (${grouped.stale.length})`}
                slug="stale"
                collapsed={collapsed.has('stale')}
                onToggle={() => toggleGroup('stale')}
                subtitle="no commits 30d+"
              >
                {grouped.stale.map((e) => (
                  <BranchRow
                    key={e.branch.id}
                    branch={e.branch}
                    meta={e.meta}
                    frameCount={frameCountByBranch.get(e.branch.id) ?? 0}
                    selected={selectedBranchId === e.branch.id}
                    soloed={soloBranchId === e.branch.id}
                    onClick={(mods) => onSelectBranch(e.branch, mods)}
                    onCheckOut={() => onCheckOut(e.branch)}
                  />
                ))}
              </GroupSection>
            ) : null}
            {showMergedGroup && grouped.merged.length > 0 ? (
              <GroupSection
                title={`Merged (${grouped.merged.length})`}
                slug="merged"
                collapsed={collapsed.has('merged')}
                onToggle={() => toggleGroup('merged')}
              >
                {grouped.merged.map((e) => (
                  <BranchRow
                    key={e.branch.id}
                    branch={e.branch}
                    meta={e.meta}
                    frameCount={frameCountByBranch.get(e.branch.id) ?? 0}
                    selected={selectedBranchId === e.branch.id}
                    soloed={soloBranchId === e.branch.id}
                    onClick={(mods) => onSelectBranch(e.branch, mods)}
                    onCheckOut={() => onCheckOut(e.branch)}
                  />
                ))}
              </GroupSection>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}

interface GroupSectionProps {
  title: string;
  slug: string;
  collapsed: boolean;
  subtitle?: string;
  onToggle: () => void;
  children: React.ReactNode;
}

function GroupSection({ title, slug, collapsed, subtitle, onToggle, children }: GroupSectionProps): JSX.Element {
  return (
    <div data-testid={`foldo-branches-group-${slug}`}>
      <button
        type="button"
        style={groupHeaderStyle}
        onClick={onToggle}
        aria-expanded={!collapsed}
        data-testid={`foldo-branches-group-toggle-${slug}`}
      >
        <span style={{ fontSize: 9 }}>{collapsed ? '▸' : '▾'}</span>
        <span>{title}</span>
        {subtitle ? (
          <span
            style={{
              fontSize: 9,
              color: '#5a5a60',
              marginLeft: 6,
              textTransform: 'none',
              letterSpacing: 0,
              fontWeight: 400,
            }}
          >
            — {subtitle}
          </span>
        ) : null}
      </button>
      {!collapsed ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>{children}</div>
      ) : null}
    </div>
  );
}

interface BranchRowProps {
  branch: Branch;
  meta: StubbedGitMeta;
  frameCount: number;
  selected: boolean;
  soloed: boolean;
  onClick: (modifiers: { meta: boolean; shift: boolean }) => void;
  onCheckOut: () => void;
}

function BranchRow({ branch, meta, frameCount, selected, soloed, onClick, onCheckOut }: BranchRowProps): JSX.Element {
  const rowStyleResolved = soloed ? rowSoloed : selected ? rowSelected : rowStyle;
  return (
    <div
      style={rowStyleResolved}
      role="button"
      tabIndex={0}
      onClick={(e) => onClick({ meta: e.metaKey || e.ctrlKey, shift: e.shiftKey })}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick({ meta: e.metaKey || e.ctrlKey, shift: e.shiftKey });
        }
      }}
      data-testid={`foldo-branches-row-${branch.id}`}
      data-selected={selected ? 'true' : 'false'}
      data-soloed={soloed ? 'true' : 'false'}
      aria-pressed={selected}
      title={
        soloed
          ? `${branch.name} — Solo mode (only this branch is visible). Cmd+click again to exit.`
          : selected
            ? `${branch.name} — focused on canvas. Cmd+click for Solo.`
            : `${branch.name} — click to focus, Cmd+click to Solo.`
      }
    >
      <div style={rowHeaderStyle}>
        <span style={{ ...dotStyle, background: branch.color }} />
        <span style={nameStyle}>{branch.name}</span>
        {soloed ? <span style={soloBadge}>SOLO</span> : null}
        {meta.prNumber ? (
          <span
            style={
              meta.prState === 'merged'
                ? prBadgeMerged
                : meta.prState === 'draft'
                  ? prBadgeDraft
                  : prBadge
            }
            title={`PR #${meta.prNumber} · ${meta.prState}`}
          >
            PR #{meta.prNumber}
          </span>
        ) : null}
      </div>
      <div style={metaStyle}>
        {meta.isCheckedOut ? (
          <span style={{ color: '#9ed29e' }}>● checked out</span>
        ) : meta.ahead || meta.behind ? (
          <span style={monoStyle}>
            {meta.ahead ? `↑${meta.ahead}` : ''}
            {meta.ahead && meta.behind ? ' ' : ''}
            {meta.behind ? `↓${meta.behind}` : ''}
          </span>
        ) : (
          <span>in sync</span>
        )}
        <span>·</span>
        <span>
          {frameCount} frame{frameCount === 1 ? '' : 's'}
        </span>
        {meta.daysSinceLastCommit > 0 ? (
          <>
            <span>·</span>
            <span>
              {meta.daysSinceLastCommit === 1
                ? '1d'
                : `${meta.daysSinceLastCommit}d`}{' '}
              ago
            </span>
          </>
        ) : null}
      </div>
      {selected ? (
        <div style={statusLine} data-testid={`foldo-branches-row-status-${branch.id}`}>
          {soloed ? 'Only this branch visible' : '● Focused on canvas'}
        </div>
      ) : null}
      {!meta.isCheckedOut && selected ? (
        <div style={actionRow}>
          <button
            type="button"
            style={actionBtn}
            onClick={(e) => {
              e.stopPropagation();
              onCheckOut();
            }}
            data-testid={`foldo-branches-checkout-${branch.id}`}
          >
            Check out
          </button>
          {meta.prNumber ? (
            <button
              type="button"
              style={actionBtn}
              onClick={(e) => {
                e.stopPropagation();
                notify(`PR link is not wired yet.`);
              }}
              data-testid={`foldo-branches-openpr-${branch.id}`}
            >
              Open PR
            </button>
          ) : null}
          <button
            type="button"
            style={actionBtn}
            onClick={(e) => {
              e.stopPropagation();
              if (soloed) selectionStore.setSoloBranch(null);
              else selectionStore.setSoloBranch(branch.id);
            }}
            data-testid={`foldo-branches-solo-${branch.id}`}
          >
            {soloed ? 'Exit Solo' : 'Solo'}
          </button>
        </div>
      ) : null}
    </div>
  );
}
