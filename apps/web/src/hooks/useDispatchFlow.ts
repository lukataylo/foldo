// Extracts the agent-dispatch lifecycle from App.tsx. Owns:
//   - activeDispatchId state
//   - sendDispatch(intent) → kicks the agent, online or offline
//   - activeDispatch derived value
//   - onJumpToResult / closeEditPanel handlers
//   - auto-pan-to-result effect that fires when the dispatch finishes
//
// All API and store calls live where they did; this hook is a colocator, not
// a behaviour change.

import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  Board,
  Branch,
  CommentTarget,
  CreateDispatchRequest,
  Dispatch,
  Frame,
} from '@foldo/protocol';
import { createDispatch as apiCreateDispatch } from '../api/dispatches';
import { boardStore } from '../state/useBoardStore';
import { selectionStore } from '../state/selectionStore';
import { findStubWorktree } from '../plugins/core-worktrees/WorktreesPanel';
import type { Route } from '../routing/Router';
import type { SelectedElement } from '../types';

export interface DispatchFlowOptions {
  board: Board | null;
  frames: Map<string, Frame>;
  branches: Map<string, Branch>;
  dispatches: Map<string, Dispatch>;
  selectedElement: SelectedElement | null;
  /** "offline" if the cloud server was unreachable on boot. */
  offline: boolean;
  /** Pan/zoom the canvas to fit this frame; the result-frame is the target. */
  fitToFrame: (frame: Frame, padding?: number) => void;
  /** Clears the selectedElement after the panel closes. */
  setSelectedElement: (sel: SelectedElement | null) => void;
  /** Resets the EditPanel's intent text on close. */
  setInitialIntent: (s: string | undefined) => void;
  /** Update the browser URL to the result frame so links share well. */
  navigate: (route: Route) => void;
  /** Show an ephemeral toast when the dispatch send fails. */
  pushToast: (msg: string) => void;
  /**
   * Offline-mode simulator — App.tsx provides this so the hook stays free
   * of the demo-user / Date.now id-generation that's App-specific. Called
   * when `offline` is true instead of POSTing to /api/dispatches.
   */
  runOffline: (
    boardId: string,
    parent: Frame,
    branch: Branch,
    intent: string,
    target: CommentTarget,
    setActiveDispatchId: (id: string) => void,
    onResultReady: (frame: Frame) => void,
  ) => void;
}

export interface DispatchFlowApi {
  activeDispatch: Dispatch | undefined;
  /** Send a new dispatch (online) or simulate one (offline). */
  sendDispatch: (intent: string) => Promise<void>;
  /** Pan to the result frame + update the URL. No-op until status === 'done'. */
  onJumpToResult: () => void;
  /** Closes the EditPanel and clears the active dispatch if it's done. */
  closeEditPanel: () => void;
}

export function useDispatchFlow({
  board,
  frames,
  branches,
  dispatches,
  selectedElement,
  offline,
  fitToFrame,
  setSelectedElement,
  setInitialIntent,
  navigate,
  pushToast,
  runOffline,
}: DispatchFlowOptions): DispatchFlowApi {
  const [activeDispatchId, setActiveDispatchId] = useState<string | null>(null);
  const activeDispatch: Dispatch | undefined = activeDispatchId
    ? dispatches.get(activeDispatchId)
    : undefined;

  const sendDispatch = useCallback(
    async (intent: string): Promise<void> => {
      if (!selectedElement || !board) return;
      const frame = frames.get(selectedElement.frameId);
      if (!frame) return;
      const branchObj = branches.get(frame.branchId);
      if (!branchObj) return;
      const target: CommentTarget = {
        elementLabel: selectedElement.label,
        elementFile: selectedElement.file,
        elementLine: selectedElement.line,
      };
      if (offline) {
        runOffline(
          board.id,
          frame,
          branchObj,
          intent,
          target,
          setActiveDispatchId,
          (childFrame) => {
            setTimeout(() => fitToFrame(childFrame, 40), 250);
          },
        );
        return;
      }
      try {
        // Read the active worktree from the selection store at dispatch
        // time (not at hook mount) so the most-recent panel selection
        // wins. The MCP bridge treats this as a hint — see CreateDispatchRequest.
        const activeWtId = selectionStore.getSnapshot().activeWorktreeId;
        const activeWt = findStubWorktree(activeWtId);
        const body: CreateDispatchRequest = {
          boardId: board.id,
          frameId: frame.id,
          branchId: frame.branchId,
          baseCommitSha: frame.commitSha,
          intent,
          target,
          ...(activeWt ? { worktreeHint: activeWt.path } : {}),
        };
        const d = await apiCreateDispatch(body);
        boardStore.upsertDispatch(d);
        setActiveDispatchId(d.id);
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn('[foldo] dispatch failed', e);
        pushToast('Failed to send dispatch');
      }
    },
    [
      selectedElement,
      board,
      frames,
      branches,
      offline,
      fitToFrame,
      pushToast,
      runOffline,
    ],
  );

  const closeEditPanel = useCallback((): void => {
    setSelectedElement(null);
    setInitialIntent(undefined);
    if (activeDispatch?.status === 'done') setActiveDispatchId(null);
  }, [activeDispatch?.status, setSelectedElement, setInitialIntent]);

  const onJumpToResult = useCallback((): void => {
    if (!activeDispatch?.resultFrameId) return;
    const child = frames.get(activeDispatch.resultFrameId);
    if (!child) return;
    fitToFrame(child, 40);
    if (board) {
      navigate({ boardId: board.id, frameId: child.id });
    }
  }, [activeDispatch, frames, board, navigate, fitToFrame]);

  // Auto-pan to the new frame once a dispatch completes — same UX as the
  // offline path, mirrors the "watch the new frame appear" demo beat. Tracked
  // by id so the same dispatch doesn't trigger twice on incidental re-renders.
  const autoJumpedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!activeDispatch) return;
    if (activeDispatch.status !== 'done') return;
    if (!activeDispatch.resultFrameId) return;
    if (autoJumpedRef.current === activeDispatch.id) return;
    const child = frames.get(activeDispatch.resultFrameId);
    if (!child) return;
    autoJumpedRef.current = activeDispatch.id;
    // Defer slightly so the frame.added entrance animation can flush first.
    const t = setTimeout(() => fitToFrame(child, 60), 300);
    return () => clearTimeout(t);
  }, [activeDispatch, frames, fitToFrame]);

  return { activeDispatch, sendDispatch, onJumpToResult, closeEditPanel };
}
