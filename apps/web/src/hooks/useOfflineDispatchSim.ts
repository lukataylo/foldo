// Offline dispatch simulator. When the cloud is unreachable, useDispatchFlow
// still needs a way to "execute" a dispatch and produce a result frame so
// the demo flow stays end-to-end. This is the local stand-in that mocks
// Claude Code: queue → running → done, with a synthesised sibling frame.
//
// Boundary: pure module — no React, no hooks. Reads/writes boardStore for
// dispatch + frame state. Lives in /hooks/ alongside its sole consumer
// (App.tsx wires it into useDispatchFlow.runOffline).

import type {
  Branch,
  CommentTarget,
  Dispatch,
  Frame,
} from '@foldo/protocol';
import { boardStore } from '../state/useBoardStore';

export function makeOfflineDispatchSim(
  demoUserId: string,
): (
  boardId: string,
  parent: Frame,
  branch: Branch,
  intent: string,
  target: CommentTarget,
  setActiveDispatchId: (id: string) => void,
  onResultReady: (frame: Frame) => void,
) => void {
  return function runOfflineDispatch(
    boardId,
    parent,
    branch,
    intent,
    target,
    setActiveDispatchId,
    onResultReady,
  ) {
    const id = `d-local-${Date.now()}`;
    const start = new Date().toISOString();
    const d0: Dispatch = {
      id,
      boardId,
      frameId: parent.id,
      branchId: branch.id,
      initiatorUserId: demoUserId,
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
            Math.abs(f.position.y - parent.position.y) < parent.size.height / 2 &&
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
              parent.content.kind === 'app' ? parent.content.variant : 'baseline',
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
              parent.content.kind === 'app' ? parent.content.overrides : undefined,
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
  };
}

function trimCommit(s: string): string {
  return s.split('\n')[0].slice(0, 60) || 'apply canvas edit';
}
