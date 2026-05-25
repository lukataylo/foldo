// Worktrees panel body. Renders a stubbed list of local git worktrees
// in the shape the future `/api/worktrees` endpoint will return. The
// shell + selection wiring are real today — selecting a worktree sets
// `activeWorktreeId` in the selection store, which:
//   1. Shows a "→ ~/path" chip in the TopBar (so the user always knows
//      where their next dispatch lands).
//   2. Threads through to `CreateDispatchRequest.worktreeHint` so the
//      MCP bridge can `cd` there for the run.
//
// The data is hardcoded until the server ships `/api/worktrees`.

import { useState, type CSSProperties } from 'react';
import { selectionStore, useSelectionSlice } from '../../state/selectionStore';

// ---------- styles ----------

const containerStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
  height: '100%',
};

const headerRowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 6,
  paddingBottom: 6,
  borderBottom: '1px solid #323232',
};

const headerLabelStyle: CSSProperties = {
  fontSize: 11,
  color: '#9a9a9a',
};

const addBtnStyle: CSSProperties = {
  padding: '4px 8px',
  height: 24,
  background: 'rgba(255,255,255,0.03)',
  color: '#e8e8ea',
  border: '1px solid #323232',
  borderRadius: 3,
  cursor: 'pointer',
  fontSize: 11,
  fontWeight: 500,
};

const listStyle: CSSProperties = {
  flex: 1,
  overflow: 'auto',
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
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
  transition: 'background 80ms, border-color 80ms',
};

const rowActive: CSSProperties = {
  ...rowStyle,
  background: 'rgba(253,179,6,0.06)',
  borderColor: 'rgba(253,179,6,0.35)',
  boxShadow: 'inset 4px 0 0 0 #FDB306',
  paddingLeft: 12,
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

const pathStyle: CSSProperties = {
  flex: 1,
  fontSize: 12,
  color: '#e8e8ea',
  fontWeight: 500,
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

const branchChipStyle: CSSProperties = {
  fontSize: 10,
  padding: '1px 5px',
  borderRadius: 3,
  background: 'rgba(255,255,255,0.05)',
  border: '1px solid #323232',
  color: '#c8c8cc',
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
  flexShrink: 0,
};

const metaStyle: CSSProperties = {
  fontSize: 10,
  color: '#7a7a80',
  display: 'flex',
  gap: 8,
  alignItems: 'center',
  flexWrap: 'wrap',
};

const statusLine: CSSProperties = {
  fontSize: 10,
  color: '#FDB306',
  fontWeight: 500,
};

const dirtyStyle: CSSProperties = { color: '#e2b557' };
const cleanStyle: CSSProperties = { color: '#7a7a80' };
const agentRunningStyle: CSSProperties = { color: '#9ed29e' };

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

// ---------- stub data ----------

export interface Worktree {
  id: string;
  path: string;
  branch: string;
  branchColor: string;
  clean: boolean;
  changeCount: number;
  agent: { name: string; status: 'idle' | 'running' } | null;
  lastActivity: string;
}

export const STUB_WORKTREES: Worktree[] = [
  {
    id: 'wt-root',
    path: '~/foldo',
    branch: 'main',
    branchColor: '#9a9a9a',
    clean: true,
    changeCount: 0,
    agent: { name: 'claude-code', status: 'idle' },
    lastActivity: '1m ago',
  },
  {
    id: 'wt-cta',
    path: '~/foldo-cta',
    branch: 'feat/cta-revamp',
    branchColor: '#b07bff',
    clean: false,
    changeCount: 4,
    agent: { name: 'claude-code', status: 'running' },
    lastActivity: '12s ago',
  },
  {
    id: 'wt-pro',
    path: '~/foldo-pro',
    branch: 'feat/pro-tier-highlight',
    branchColor: '#4a8bff',
    clean: true,
    changeCount: 0,
    agent: { name: 'claude-code', status: 'idle' },
    lastActivity: '4m ago',
  },
];

/** Look up the stub worktree by id — exported so TopBar can render its path. */
export function findStubWorktree(id: string | null): Worktree | null {
  if (!id) return null;
  return STUB_WORKTREES.find((w) => w.id === id) ?? null;
}

function notify(msg: string): void {
  const fn = (window as unknown as { __foldoToast?: (m: string) => void }).__foldoToast;
  if (fn) fn(msg);
}

// ---------- component ----------

const TIP_LS_KEY = 'foldo:worktrees:tip-dismissed';

export function WorktreesPanel(): JSX.Element {
  const activeWorktreeId = useSelectionSlice((s) => s.activeWorktreeId);
  const [tipDismissed, setTipDismissed] = useState<boolean>(() => {
    if (typeof localStorage === 'undefined') return false;
    return localStorage.getItem(TIP_LS_KEY) === '1';
  });

  // Default active worktree = the root one if nothing's chosen yet. We
  // do this in render rather than as an effect so the chip in the TopBar
  // appears immediately on first mount.
  const resolvedActive = activeWorktreeId ?? STUB_WORKTREES[0]?.id ?? null;

  const dirtyCount = STUB_WORKTREES.filter((w) => !w.clean).length;

  const dismissTip = (): void => {
    setTipDismissed(true);
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem(TIP_LS_KEY, '1');
      } catch {
        /* swallow */
      }
    }
  };

  const onSelect = (id: string, path: string): void => {
    selectionStore.setActiveWorktree(id);
    notify(`Next dispatch will run in ${path}.`);
  };

  return (
    <div style={containerStyle} data-testid="foldo-worktrees-panel">
      <div style={headerRowStyle}>
        <span style={headerLabelStyle}>
          {STUB_WORKTREES.length} worktree{STUB_WORKTREES.length === 1 ? '' : 's'}
          {dirtyCount > 0 ? ` · ${dirtyCount} dirty` : ''}
        </span>
        <button
          type="button"
          style={addBtnStyle}
          onClick={() => notify('Adding worktrees is not wired yet — coming soon.')}
          data-testid="foldo-worktrees-add"
        >
          + Add
        </button>
      </div>

      {!tipDismissed ? (
        <div style={tipStyle} data-testid="foldo-worktrees-tip">
          <div>
            <strong style={{ color: '#FDB306' }}>ⓘ</strong> Each worktree is
            an independent sandbox. Selecting one tells Claude Code{' '}
            <em>where to do the next dispatch</em> — it doesn't move the canvas.
          </div>
          <button
            type="button"
            onClick={dismissTip}
            style={{ ...actionBtn, alignSelf: 'flex-start' }}
            data-testid="foldo-worktrees-tip-dismiss"
          >
            Got it
          </button>
        </div>
      ) : null}

      <div style={stubBannerStyle}>
        Stubbed data. <code style={{ fontFamily: 'ui-monospace, monospace' }}>/api/worktrees</code>{' '}
        + MCP <code style={{ fontFamily: 'ui-monospace, monospace' }}>worktree.list</code> are the
        next backend pieces.
      </div>

      <div style={listStyle} role="list">
        {STUB_WORKTREES.map((wt) => {
          const isActive = wt.id === resolvedActive;
          return (
            <div
              key={wt.id}
              role="listitem"
              style={isActive ? rowActive : rowStyle}
              onClick={() => onSelect(wt.id, wt.path)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onSelect(wt.id, wt.path);
                }
              }}
              tabIndex={0}
              data-testid={`foldo-worktrees-row-${wt.id}`}
              data-active={isActive ? 'true' : 'false'}
              aria-pressed={isActive}
            >
              <div style={rowHeaderStyle}>
                <span style={{ ...dotStyle, background: wt.branchColor }} />
                <span style={pathStyle} title={wt.path}>
                  {wt.path}
                </span>
                <span style={branchChipStyle} title={`branch: ${wt.branch}`}>
                  {wt.branch}
                </span>
              </div>
              <div style={metaStyle}>
                <span style={wt.clean ? cleanStyle : dirtyStyle}>
                  {wt.clean
                    ? '○ clean'
                    : `◐ ${wt.changeCount} change${wt.changeCount === 1 ? '' : 's'}`}
                </span>
                <span>·</span>
                {wt.agent ? (
                  <span
                    style={wt.agent.status === 'running' ? agentRunningStyle : undefined}
                    title={`agent: ${wt.agent.name}`}
                  >
                    {wt.agent.status === 'running' ? '⟳ ' : ''}
                    {wt.agent.name} · {wt.agent.status}
                  </span>
                ) : (
                  <span>no agent</span>
                )}
                <span>·</span>
                <span>{wt.lastActivity}</span>
              </div>
              {isActive ? (
                <div style={statusLine} data-testid={`foldo-worktrees-row-status-${wt.id}`}>
                  ● Active dispatch target
                </div>
              ) : null}
              {!isActive ? (
                <div style={actionRow}>
                  <button
                    type="button"
                    style={actionBtn}
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelect(wt.id, wt.path);
                    }}
                    data-testid={`foldo-worktrees-switch-${wt.id}`}
                  >
                    Set as target
                  </button>
                  <button
                    type="button"
                    style={actionBtn}
                    onClick={(e) => {
                      e.stopPropagation();
                      notify('Open-in-Finder is not wired yet.');
                    }}
                    data-testid={`foldo-worktrees-open-${wt.id}`}
                  >
                    Open
                  </button>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
