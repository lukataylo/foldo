// Apply a ServerMessage to the BoardStore.
// Pure patches into the store, no fetch, no DOM.

import type { ServerMessage } from '@foldo/protocol';
import { boardStore } from './BoardStore';

export function applyServerMessage(msg: ServerMessage) {
  switch (msg.type) {
    case 'welcome': {
      const users = new Map(msg.users.map((u) => [u.id, u] as const));
      boardStore.patch({
        meUserId: msg.youUserId,
        board: msg.board,
        users,
        hydrated: true,
      });
      return;
    }
    case 'frame.added':
    case 'frame.updated':
      boardStore.upsertFrame(msg.frame);
      return;
    case 'frame.moved':
      boardStore.moveFrame(msg.frameId, msg.x, msg.y);
      return;
    case 'frame.deleted':
      boardStore.removeFrame(msg.frameId);
      return;
    case 'comment.added':
    case 'comment.updated':
      boardStore.upsertComment(msg.comment);
      return;
    case 'comment.reply.added':
      // Idempotent by reply id — the author also receives this broadcast
      // after already appending the REST response.
      boardStore.addReply(msg.commentId, msg.reply);
      return;
    case 'comment.deleted':
      boardStore.removeComment(msg.commentId);
      return;
    case 'dispatch.created':
    case 'dispatch.done':
      boardStore.upsertDispatch(msg.dispatch);
      return;
    case 'dispatch.status': {
      const snap = boardStore.getSnapshot();
      const existing = snap.dispatches.get(msg.dispatchId);
      if (existing) {
        boardStore.upsertDispatch({
          ...existing,
          status: msg.status,
          events: msg.event ? [...existing.events, msg.event] : existing.events,
        });
        return;
      }
      // Race: status arrived before `dispatch.created` (typical on reconnect
      // for an in-flight dispatch). Stub a minimal record so subsequent
      // updates merge correctly; the eventual `dispatch.done` will hydrate
      // the rest.
      const now = new Date().toISOString();
      boardStore.upsertDispatch({
        id: msg.dispatchId,
        boardId: snap.board?.id ?? '',
        frameId: '',
        branchId: '',
        initiatorUserId: '',
        target: {},
        baseCommitSha: '',
        intent: '',
        status: msg.status,
        events: msg.event ? [msg.event] : [],
        createdAt: now,
      });
      return;
    }
    case 'branch.added':
    case 'branch.updated':
      boardStore.upsertBranch(msg.branch);
      return;
    case 'mcp.online':
      boardStore.patch({ mcpConnected: true });
      return;
    case 'mcp.offline':
      boardStore.patch({ mcpConnected: false });
      return;
    case 'error':
      console.warn('[foldo-ws] server error', msg);
      return;
    case 'pong':
      return;
    default: {
      // Exhaustiveness: a new ServerMessage type without a branch here is a
      // typecheck error, not a silently-dropped broadcast.
      const _exhaustive: never = msg;
      void _exhaustive;
      return;
    }
  }
}
