// Client-only selection state — which branch is focused, whether Solo
// mode is on, which worktree is the active dispatch target. Lives
// outside BoardStore because none of this state is server-truth: it's
// pure local UI on top of the server snapshot.
//
// The store is a tiny external store (React 18 useSyncExternalStore)
// with a localStorage backing so selections survive reloads. Two side
// effects of changes:
//   1. Subscribers re-render via useSelection().
//   2. A `foldo:selectionchange` window event fires so non-React
//      consumers (e.g. canvas-level filters that don't want to add a
//      subscription) can listen.

import { useSyncExternalStore } from 'react';

export interface SelectionState {
  /** Currently-focused branch id, or null when nothing is selected. */
  selectedBranchId: string | null;
  /** When non-null, only this branch's frames render on canvas. */
  soloBranchId: string | null;
  /** Currently-active worktree (drives the "→ ~/path" chip in TopBar). */
  activeWorktreeId: string | null;
}

const LS_KEY = 'foldo:selection';
const EVENT = 'foldo:selectionchange';

function readInitial(): SelectionState {
  if (typeof localStorage === 'undefined') {
    return { selectedBranchId: null, soloBranchId: null, activeWorktreeId: null };
  }
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) {
      return { selectedBranchId: null, soloBranchId: null, activeWorktreeId: null };
    }
    const parsed = JSON.parse(raw) as Partial<SelectionState>;
    return {
      selectedBranchId: parsed.selectedBranchId ?? null,
      soloBranchId: parsed.soloBranchId ?? null,
      activeWorktreeId: parsed.activeWorktreeId ?? null,
    };
  } catch {
    return { selectedBranchId: null, soloBranchId: null, activeWorktreeId: null };
  }
}

let state: SelectionState = readInitial();
const listeners = new Set<() => void>();

function emit(): void {
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(state));
    } catch {
      /* localStorage full or denied — swallow; this state is transient. */
    }
  }
  for (const l of listeners) l();
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(EVENT, { detail: state }));
  }
}

export const selectionStore = {
  getSnapshot(): SelectionState {
    return state;
  },
  subscribe(fn: () => void): () => void {
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  },
  setSelectedBranch(id: string | null): void {
    if (state.selectedBranchId === id) return;
    state = { ...state, selectedBranchId: id };
    // Selecting a different branch exits Solo (the soloed branch is
    // implicitly the selected one — switching selection without exiting
    // Solo would leave a stale ghost-filter on the canvas).
    if (state.soloBranchId !== null && state.soloBranchId !== id) {
      state = { ...state, soloBranchId: null };
    }
    emit();
  },
  setSoloBranch(id: string | null): void {
    if (state.soloBranchId === id) return;
    state = { ...state, soloBranchId: id };
    // Entering Solo implies selection on the same branch — keep them in sync.
    if (id !== null && state.selectedBranchId !== id) {
      state = { ...state, selectedBranchId: id };
    }
    emit();
  },
  setActiveWorktree(id: string | null): void {
    if (state.activeWorktreeId === id) return;
    state = { ...state, activeWorktreeId: id };
    emit();
  },
  reset(): void {
    state = { selectedBranchId: null, soloBranchId: null, activeWorktreeId: null };
    emit();
  },
};

/**
 * React hook returning the full selection state. Subscribers re-render
 * whenever any field changes. Use a selector (`useSelectionSlice`) when
 * a component only cares about one field — saves a render per unrelated
 * update.
 */
export function useSelection(): SelectionState {
  return useSyncExternalStore(selectionStore.subscribe, selectionStore.getSnapshot, selectionStore.getSnapshot);
}

export function useSelectionSlice<T>(selector: (s: SelectionState) => T): T {
  return useSyncExternalStore(
    selectionStore.subscribe,
    () => selector(selectionStore.getSnapshot()),
    () => selector(selectionStore.getSnapshot()),
  );
}
