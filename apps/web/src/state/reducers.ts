// Apply a ServerMessage to the BoardStore.
// Pure patches into the store, no fetch, no DOM.

import type { ServerMessage } from '@foldo/protocol';
import { boardStore } from './BoardStore';

export function applyServerMessage(msg: ServerMessage) {
  switch (msg.type) {
    case 'welcome': {
      const presence = new Map(
        msg.users.map((u) => [u.userId, u] as const),
      );
      boardStore.patch({
        meUserId: msg.youUserId,
        board: msg.board,
        presence,
        hydrated: true,
      });
      return;
    }
    case 'presence.join':
      boardStore.upsertPresence(msg.user);
      return;
    case 'presence.leave':
      boardStore.removePresence(msg.userId);
      return;
    case 'presence.cursor': {
      const snap = boardStore.getSnapshot();
      const existing = snap.presence.get(msg.userId);
      if (!existing) return;
      boardStore.upsertPresence({
        ...existing,
        cursor: msg.cursor,
        online: true,
        lastSeenAt: new Date().toISOString(),
      });
      return;
    }
    case 'presence.selection': {
      const snap = boardStore.getSnapshot();
      const existing = snap.presence.get(msg.userId);
      if (!existing) return;
      boardStore.upsertPresence({
        ...existing,
        selection: msg.selection ?? undefined,
      });
      return;
    }
    case 'presence.viewport': {
      const snap = boardStore.getSnapshot();
      const existing = snap.presence.get(msg.userId);
      if (!existing) return;
      boardStore.upsertPresence({
        ...existing,
        viewport: { x: msg.x, y: msg.y, zoom: msg.zoom },
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
    case 'comment.reply.added': {
      const snap = boardStore.getSnapshot();
      const c = snap.comments.get(msg.commentId);
      if (!c) return;
      boardStore.upsertComment({
        ...c,
        replies: [...c.replies, msg.reply],
      });
      return;
    }
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
    case 'test.session.started':
      // Transient "someone is testing now" signal. The completed session's
      // frame still arrives via the normal `frame.added` path below.
      boardStore.markTestSessionActive(msg.testId);
      return;
    case 'test.session.completed':
      boardStore.markTestSessionInactive(msg.testId);
      return;
    case 'error':
      console.warn('[foldo-ws] server error', msg);
      return;
    case 'pong':
      return;
  }
}
