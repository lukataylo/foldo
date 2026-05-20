// React context wiring that turns the plugin API's type-only hooks into
// concrete hooks plugins can call. The host (App.tsx) wraps the canvas in
// <PluginRuntimeProvider value={…}> with the live board state and action
// callbacks. Plugins import the hooks from this module.
//
// PERF CONTRACT: the context value here holds ONLY slices that change rarely
// (tool switch, selection, comment edits) — never the camera. Zoom and the
// near-viewport set live in `viewportStore` and are read via
// `useZoom` / `useIsInViewport`, which re-export the store's selector hooks.
// This is what keeps a wheel/pinch tick from re-rendering every frame plugin.

import { createContext, useContext, type ReactNode } from 'react';
import type { Board, Comment, FrameId } from '@foldo/protocol';
import type {
  PluginActions,
  PluginRuntime,
  SelectedElement,
} from '@foldo/plugin-api';
import { useZoom, useIsFrameInViewport } from '../state/viewportStore';

export interface PluginRuntimeValue {
  tool: string;
  board: Board | null;
  selectedElement: SelectedElement | null;
  selectedFrameId: FrameId | null;
  /** Frame-id → ordered comment list. */
  commentsByFrame: Map<FrameId, Comment[]>;
  actions: PluginActions;
}

const PluginRuntimeContext = createContext<PluginRuntimeValue | null>(null);

export function PluginRuntimeProvider({
  value,
  children,
}: {
  value: PluginRuntimeValue;
  children: ReactNode;
}) {
  return (
    <PluginRuntimeContext.Provider value={value}>
      {children}
    </PluginRuntimeContext.Provider>
  );
}

function useRuntime(): PluginRuntimeValue {
  const v = useContext(PluginRuntimeContext);
  if (!v) {
    throw new Error(
      'Plugin runtime hooks must be called inside <PluginRuntimeProvider>.',
    );
  }
  return v;
}

// ----- viewport-backed hooks (re-exported from the viewport store) -----

/** Reactive canvas zoom. Backed by viewportStore, NOT the context. */
export { useZoom };

/** Reactive per-frame near-viewport membership. Backed by viewportStore. */
export function useIsInViewport(frameId: FrameId): boolean {
  return useIsFrameInViewport(frameId);
}

// ----- context-backed hooks (stable slices) -----

export function useTool(): string {
  return useRuntime().tool;
}

export function useBoard(): Board | null {
  return useRuntime().board;
}

export function useFrameComments(frameId: FrameId): Comment[] {
  return useRuntime().commentsByFrame.get(frameId) ?? [];
}

export function useActions(): PluginActions {
  return useRuntime().actions;
}

export function useSelectedElement(): SelectedElement | null {
  return useRuntime().selectedElement;
}

export function useSelectedFrameId(): FrameId | null {
  return useRuntime().selectedFrameId;
}

// Compile-time guard: the concrete hooks above must stay in lock-step with the
// `PluginRuntime` contract in @foldo/plugin-api. If a hook is added/removed or
// a signature drifts, this `satisfies` fails the build.
const _runtimeContract = {
  useZoom,
  useTool,
  useFrameComments,
  useIsInViewport,
  useBoard,
  useActions,
  useSelectedElement,
  useSelectedFrameId,
} satisfies PluginRuntime;
void _runtimeContract;
