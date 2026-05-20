// Dispatch lifecycle, extracted from App.tsx: send a dispatch, the offline
// dispatch simulation, the auto-jump-to-result effect, and the edit-panel
// open/close glue.

import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  Branch,
  CommentTarget,
  CreateDispatchRequest,
  Dispatch,
  Frame,
} from '@foldo/protocol';
import { boardStore } from '../state/useBoardStore';
import type { BoardSnapshot } from '../state/BoardStore';
import type { Route } from '../routing/Router';
import { createDispatch as apiCreateDispatch } from '../api/dispatches';
import type { SelectedElement } from '../types';
import type { BootState } from './useBoardBootstrap';
import { DEMO_USER_ID } from './useBoardBootstrap';

// ----- offline dispatch simulation -----

function trimCommit(s: string) {
  return s.split('\n')[0].slice(0, 60) || 'apply canvas edit';
}

function runOfflineDispatch(
  boardId: string,
  parent: Frame,
  branch: Branch,
  intent: string,
  target: CommentTarget,
  setActiveDispatchId: (id: string) => void,
  onResultReady: (frame: Frame) => void,
) {
  const id = `d-local-${Date.now()}`;
  const start = new Date().toISOString();
  const d0: Dispatch = {
    id,
    boardId,
    frameId: parent.id,
    branchId: branch.id,
    initiatorUserId: DEMO_USER_ID,
    target,
    baseCommitSha: parent.commitSha,
    intent,
    status: 'sending',
    events: [
      { ts: start, level: 'info', message: 'Queued dispatch to local MCP…' },
    ],
    createdAt: start,
    startedAt: start,
  };
  boardStore.upsertDispatch(d0);
  setActiveDispatchId(id);

  setTimeout(() => {
    const existing = boardStore.getSnapshot().dispatches.get(id);
    if (!existing) return;
    boardStore.upsertDispatch({
      ...existing,
      status: 'running',
      events: [
        ...existing.events,
        {
          ts: new Date().toISOString(),
          level: 'info',
          message: 'Claude Code running…',
        },
      ],
    });
  }, 700);

  setTimeout(() => {
    const existing = boardStore.getSnapshot().dispatches.get(id);
    if (!existing) return;
    const finishedAt = new Date().toISOString();
    const sha = Math.random().toString(16).slice(2, 9);

    let result: Frame;
    if (parent.kind === 'markdown' && parent.content.kind === 'markdown') {
      // Update the doc in place rather than spawning a sibling markdown frame;
      // keeps the row's "docs left, screens right" shape intact.
      result = {
        ...parent,
        commitSha: sha,
        commitMessage: 'docs: applied edit from canvas',
        age: 'just now',
        content: {
          ...parent.content,
          body:
            (parent.content.body ?? '') +
            `\n\n## Update (from canvas)\n\n${intent}`,
        },
        updatedAt: finishedAt,
      };
    } else {
      const sameRow: Frame[] = [];
      for (const f of boardStore.getSnapshot().frames.values()) {
        if (
          Math.abs(f.position.y - parent.position.y) <
            parent.size.height / 2 &&
          f.branchId === parent.branchId
        ) {
          sameRow.push(f);
        }
      }
      const rightmost = sameRow.reduce(
        (acc, f) => Math.max(acc, f.position.x + f.size.width),
        parent.position.x + parent.size.width,
      );
      const newX = rightmost + 100;
      const childId = `f-local-${Date.now()}`;
      result = {
        id: childId,
        boardId,
        kind: 'app',
        branchId: parent.branchId,
        commitSha: sha,
        commitMessage: trimCommit(intent),
        age: 'just now',
        position: { x: newX, y: parent.position.y },
        size: parent.size,
        content: {
          kind: 'app',
          variant:
            parent.content.kind === 'app'
              ? parent.content.variant
              : 'baseline',
          route: parent.content.kind === 'app' ? parent.content.route : '/',
          viewport:
            parent.content.kind === 'app'
              ? parent.content.viewport
              : { width: 1280, height: 900 },
          recipe:
            parent.content.kind === 'app' ? parent.content.recipe : undefined,
          stateLabel:
            parent.content.kind === 'app'
              ? parent.content.stateLabel
              : undefined,
          overrides:
            parent.content.kind === 'app'
              ? parent.content.overrides
              : undefined,
        },
        parentFrameId: parent.id,
        generatedByDispatchId: id,
        createdAt: finishedAt,
        updatedAt: finishedAt,
      };
    }

    boardStore.upsertFrame(result);
    boardStore.upsertDispatch({
      ...existing,
      status: 'done',
      finishedAt,
      resultFrameId: result.id,
      resultCommitSha: sha,
      events: [
        ...existing.events,
        { ts: finishedAt, level: 'info', message: 'Done.' },
      ],
    });
    onResultReady(result);
  }, 2200);
}

interface UseDispatchesArgs {
  snap: BoardSnapshot;
  boot: BootState;
  selectedElement: SelectedElement | null;
  navigate: (next: Route, opts?: { replace?: boolean }) => void;
  setSelectedElement: (sel: SelectedElement | null) => void;
  setInitialIntent: (s: string | undefined) => void;
  fitToFrame: (frame: Frame, padding?: number) => void;
  toast: (msg: string) => void;
}

export interface UseDispatchesResult {
  activeDispatch: Dispatch | undefined;
  sendDispatch: (intent: string) => Promise<void>;
  closeEditPanel: () => void;
  onJumpToResult: () => void;
}

export function useDispatches({
  snap,
  boot,
  selectedElement,
  navigate,
  setSelectedElement,
  setInitialIntent,
  fitToFrame,
  toast,
}: UseDispatchesArgs): UseDispatchesResult {
  const [activeDispatchId, setActiveDispatchId] = useState<string | null>(
    null,
  );

  const sendDispatch = useCallback(
    async (intent: string) => {
      if (!selectedElement || !snap.board) return;
      const f = snap.frames.get(selectedElement.frameId);
      if (!f) return;
      const branchObj = snap.branches.get(f.branchId);
      if (!branchObj) return;
      const target: CommentTarget = {
        elementLabel: selectedElement.label,
        elementFile: selectedElement.file,
        elementLine: selectedElement.line,
      };
      if (boot.kind === 'offline') {
        // Synthesise dispatch lifecycle locally
        runOfflineDispatch(
          snap.board.id,
          f,
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
        const body: CreateDispatchRequest = {
          boardId: snap.board.id,
          frameId: f.id,
          branchId: f.branchId,
          baseCommitSha: f.commitSha,
          intent,
          target,
        };
        const d = await apiCreateDispatch(body);
        boardStore.upsertDispatch(d);
        setActiveDispatchId(d.id);
      } catch (e) {
        console.warn('[foldo] dispatch failed', e);
        toast('Failed to send dispatch');
      }
    },
    [
      selectedElement,
      snap.board,
      snap.frames,
      snap.branches,
      boot.kind,
      fitToFrame,
      toast,
    ],
  );

  const activeDispatch: Dispatch | undefined = activeDispatchId
    ? snap.dispatches.get(activeDispatchId)
    : undefined;

  const closeEditPanel = useCallback(() => {
    setSelectedElement(null);
    setInitialIntent(undefined);
    if (activeDispatch?.status === 'done') setActiveDispatchId(null);
  }, [activeDispatch?.status, setSelectedElement, setInitialIntent]);

  const onJumpToResult = useCallback(() => {
    if (!activeDispatch?.resultFrameId) return;
    const child = snap.frames.get(activeDispatch.resultFrameId);
    if (!child) return;
    fitToFrame(child, 40);
    if (snap.board) {
      navigate({ boardId: snap.board.id, frameId: child.id });
    }
  }, [activeDispatch, snap.frames, snap.board, navigate, fitToFrame]);

  // Auto-pan to the new frame once a dispatch completes, mirrors the
  // offline-mode behavior so the demo's "watch new frame appear" beat works
  // without the user clicking "Jump to it".
  const autoJumpedDispatchRef = useRef<string | null>(null);
  useEffect(() => {
    if (!activeDispatch) return;
    if (activeDispatch.status !== 'done') return;
    if (!activeDispatch.resultFrameId) return;
    if (autoJumpedDispatchRef.current === activeDispatch.id) return;
    const child = snap.frames.get(activeDispatch.resultFrameId);
    if (!child) return;
    autoJumpedDispatchRef.current = activeDispatch.id;
    // Defer slightly so the frame.added animation can flush first.
    const t = setTimeout(() => fitToFrame(child, 60), 300);
    return () => clearTimeout(t);
  }, [activeDispatch, snap.frames, fitToFrame]);

  return { activeDispatch, sendDispatch, closeEditPanel, onJumpToResult };
}
