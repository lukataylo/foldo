// WebSocket protocol — bidirectional, JSON-over-WS.
// Two distinct WS endpoints:
//   /ws            — browser clients (canvas)
//   /ws/mcp        — in-directory MCP servers

import type {
  Board,
  Branch,
  Comment,
  CommentReply,
  Dispatch,
  DispatchEvent,
  DispatchStatus,
  Frame,
  FrameId,
  PresenceCursor,
  PresenceSelection,
  PresenceUser,
  UserId,
  CommentId,
  BoardId,
  DispatchId,
  CommitSha,
  RecipeStep,
} from './domain.ts';

// ---------- Client → Server (browser) ----------

export type ClientMessage =
  | { type: 'hello'; boardId: BoardId; userId: UserId; token: string }
  | { type: 'cursor.move'; cursor: PresenceCursor }
  | { type: 'selection.update'; selection: PresenceSelection | null }
  | { type: 'viewport.update'; x: number; y: number; zoom: number }
  | { type: 'follow.start'; targetUserId: UserId }
  | { type: 'follow.stop' }
  | { type: 'ping'; ts: number };

// ---------- Server → Client (browser) ----------

export type ServerMessage =
  | {
      type: 'welcome';
      boardId: BoardId;
      youUserId: UserId;
      board: Board;
      users: PresenceUser[];
    }
  | { type: 'presence.join'; user: PresenceUser }
  | { type: 'presence.leave'; userId: UserId }
  | { type: 'presence.cursor'; userId: UserId; cursor: PresenceCursor }
  | {
      type: 'presence.selection';
      userId: UserId;
      selection: PresenceSelection | null;
    }
  | {
      type: 'presence.viewport';
      userId: UserId;
      x: number;
      y: number;
      zoom: number;
    }
  | { type: 'frame.added'; frame: Frame }
  | { type: 'frame.updated'; frame: Frame }
  | { type: 'frame.moved'; frameId: FrameId; x: number; y: number }
  | { type: 'frame.deleted'; frameId: FrameId }
  | { type: 'comment.added'; comment: Comment }
  | { type: 'comment.updated'; comment: Comment }
  | {
      type: 'comment.reply.added';
      commentId: CommentId;
      reply: CommentReply;
    }
  | { type: 'comment.deleted'; commentId: CommentId }
  | { type: 'dispatch.created'; dispatch: Dispatch }
  | {
      type: 'dispatch.status';
      dispatchId: DispatchId;
      status: DispatchStatus;
      event?: DispatchEvent;
    }
  | { type: 'dispatch.done'; dispatch: Dispatch }
  | { type: 'branch.added'; branch: Branch }
  | { type: 'branch.updated'; branch: Branch }
  | { type: 'mcp.online'; boardId: BoardId; agentName: string }
  | { type: 'mcp.offline'; boardId: BoardId }
  | { type: 'pong'; ts: number }
  | { type: 'error'; code: string; message: string };

// ---------- MCP ↔ Server ----------

export type McpClientMessage =
  | {
      type: 'mcp.hello';
      token: string;
      boardId: BoardId;
      agentName: string;
      version: string;
      tools: string[];
    }
  | {
      type: 'dispatch.ack';
      dispatchId: DispatchId;
    }
  | {
      type: 'dispatch.progress';
      dispatchId: DispatchId;
      event: DispatchEvent;
    }
  | {
      type: 'dispatch.completed';
      dispatchId: DispatchId;
      resultFrame: Frame;
      newCommitSha: CommitSha;
    }
  | {
      type: 'dispatch.failed';
      dispatchId: DispatchId;
      message: string;
    }
  | {
      type: 'freeze.captured';
      frame: Frame;
    }
  | {
      type: 'branches.snapshot';
      branches: Branch[];
    }
  | { type: 'pong'; ts: number };

export type McpServerMessage =
  | {
      type: 'mcp.welcome';
      boardId: BoardId;
      tokenAccepted: boolean;
    }
  | {
      type: 'dispatch.execute';
      dispatch: Dispatch;
    }
  | {
      type: 'freeze.request';
      boardId: BoardId;
      branchId: string;
      commitSha: CommitSha;
      recipe?: RecipeStep[];
      stateLabel?: string;
    }
  | { type: 'ping'; ts: number };

// ---------- Convenience ----------
export type AnyClientMessage = ClientMessage | McpClientMessage;
export type AnyServerMessage = ServerMessage | McpServerMessage;
