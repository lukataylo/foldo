// Banner pinned to the top of the canvas (just below the TopBar) when
// Solo mode is active. Tells the user "you're not seeing every frame
// right now" + gives an Exit button so the mode can't get stuck.
//
// Why pin it instead of relying on the panel-side SOLO badge alone:
// users can collapse the panel into a pill. The banner is the one
// always-visible cue that the canvas content is filtered.

import type { CSSProperties } from 'react';
import { selectionStore, useSelectionSlice } from '../state/selectionStore';
import { useBoardSelector } from '../state/useBoardStore';

const wrap: CSSProperties = {
  position: 'fixed',
  top: 64,
  left: '50%',
  transform: 'translateX(-50%)',
  zIndex: 95,
  display: 'inline-flex',
  alignItems: 'center',
  gap: 10,
  padding: '6px 12px',
  background: '#FDB306',
  color: '#1a1a1d',
  borderRadius: 999,
  fontSize: 12,
  fontWeight: 600,
  boxShadow: '0 8px 24px rgba(0,0,0,0.45)',
  pointerEvents: 'auto',
};

const exitBtn: CSSProperties = {
  fontSize: 11,
  padding: '3px 8px',
  borderRadius: 999,
  background: 'rgba(0,0,0,0.2)',
  color: '#1a1a1d',
  border: '1px solid rgba(0,0,0,0.25)',
  cursor: 'pointer',
  fontWeight: 700,
};

export function SoloBanner(): JSX.Element | null {
  const soloBranchId = useSelectionSlice((s) => s.soloBranchId);
  const branch = useBoardSelector((s) =>
    soloBranchId ? (s.branches.get(soloBranchId) ?? null) : null,
  );
  if (!soloBranchId) return null;
  const branchName = branch?.name ?? soloBranchId;
  return (
    <div
      style={wrap}
      role="status"
      aria-live="polite"
      data-testid="foldo-solo-banner"
      data-branch-id={soloBranchId}
    >
      <span aria-hidden>⚠</span>
      <span>
        Solo: <code style={{ fontFamily: 'ui-monospace, monospace' }}>{branchName}</code>{' '}
        — other branches hidden.
      </span>
      <button
        type="button"
        style={exitBtn}
        onClick={() => selectionStore.setSoloBranch(null)}
        data-testid="foldo-solo-banner-exit"
      >
        Exit Solo
      </button>
    </div>
  );
}
