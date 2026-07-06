// WebSocket protocol, bidirectional, JSON-over-WS.
// Two distinct WS endpoints:
//   /ws           , browser clients (board viewer)
//   /ws/mcp       , in-directory MCP servers
//
// Versioning: every message carries an optional `version` field. Server
// stamps every outbound message with `PROTOCOL_VERSION`; clients are
// expected to do the same on new code. An older client that omits `version`
// is still served (treated as `PROTOCOL_VERSION` for back-compat). The major
// version bumps on any breaking change; clients and servers refuse to talk
// across a major mismatch and surface a clean error. See docs/PROTOCOL.md
// for the policy.

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
  User,
  UserId,
  CommentId,
  BoardId,
  DispatchId,
  CommitSha,
  RecipeStep,
} from './domain.ts';

/**
 * Current wire protocol version. Bump the MAJOR (first dotted segment) on any
 * breaking change to ClientMessage / ServerMessage / McpClientMessage /
 * McpServerMessage shapes. Server refuses to talk across a major mismatch.
 *
 * 1.0.0 — initial versioned release (2026-05-23, Phase 2 of the AAA roadmap).
 * 2.0.0 — living-documentation pivot (2026-07): presence/cursor/follow and
 *         user-test messages removed; `welcome.users` is now `User[]`.
 */
export const PROTOCOL_VERSION = '2.0.0';

/**
 * Adds an optional `version` field to every WS message variant without
 * disturbing the discriminated unions. The field is optional so unversioned
 * third-party clients still parse — the server treats a missing field as
 * PROTOCOL_VERSION.
 */
export type Versioned<T> = T & { version?: string };

// ---------- Client → Server (browser) ----------

export type ClientMessage = Versioned<
  | {
      type: 'hello';
      boardId: BoardId;
      userId: UserId;
      token: string;
      /**
       * Highest broadcast `seq` the client has already applied on a previous
       * connection. Server replays any broadcasts strictly greater than
       * this (up to the in-memory window cap) immediately after the welcome
       * so a brief disconnect doesn't desync the board.
       */
      sinceSeq?: number;
    }
  | { type: 'ping'; ts: number }
>;

// ---------- Server → Client (browser) ----------

/**
 * Every broadcast also carries a per-board monotonic `seq`. Server stamps it
 * automatically; the client tracks the high-watermark and replays via
 * `hello.sinceSeq` on reconnect. Optional in the type so non-broadcast
 * messages (welcome, pong, error) don't have to fabricate one.
 */
export type SeqStamped<T> = T & { seq?: number };

export type ServerMessage = SeqStamped<
  Versioned<
    | {
        type: 'welcome';
        boardId: BoardId;
        youUserId: UserId;
        board: Board;
        users: User[];
        /**
         * Current high-watermark seq for this board. Client stores it so the
         * next `hello` can carry `sinceSeq` and skip the lost-message window.
         */
        latestSeq: number;
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
    | { type: 'error'; code: string; message: string }
  >
>;

// ---------- MCP ↔ Server ----------

export type McpClientMessage = Versioned<
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
  | { type: 'pong'; ts: number }
>;

export type McpServerMessage = Versioned<
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
  | { type: 'ping'; ts: number }
>;

// ---------- Convenience ----------
export type AnyClientMessage = ClientMessage | McpClientMessage;
export type AnyServerMessage = ServerMessage | McpServerMessage;

/**
 * Two protocol versions are wire-compatible iff they share a major version
 * (the segment before the first dot). Older clients and servers can talk
 * across any minor/patch difference. A major mismatch is a hard refusal.
 */
export function isCompatibleProtocolVersion(
  v: string | undefined,
  current: string = PROTOCOL_VERSION,
): boolean {
  if (!v) return true; // unversioned = treat as current
  const ourMajor = current.split('.')[0];
  const theirMajor = v.split('.')[0];
  return ourMajor === theirMajor;
}
