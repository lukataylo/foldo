import type { ServerMessage, UserId, BoardId, PresenceUser } from '@foldo/protocol';
import { PROTOCOL_VERSION } from '@foldo/protocol';
import type { WebSocket } from 'ws';

/**
 * How many recent broadcasts we keep per board, in memory. A client that's
 * been offline for less than this many broadcasts can replay seamlessly on
 * reconnect via `hello.sinceSeq`. Bigger window = more memory + better
 * replay; smaller = the inverse. 256 covers ~5 min of busy editing on a
 * 4-person board in practice and stays well under 1 MB even with large
 * frame payloads. The buffer is per-process and lost on restart — that's
 * fine for v1 (clients fall back to a fresh GET /api/boards if the requested
 * `sinceSeq` is no longer in the window).
 */
const REPLAY_BUFFER_SIZE = 256;

/**
 * Browser-WS client connected to a board.
 * Swap this in-process hub for a Redis pub/sub backend by re-implementing
 * subscribe/unsubscribe/broadcast and re-using the same conn lookup.
 */
export interface BrowserConn {
  socket: WebSocket;
  boardId: BoardId;
  userId: UserId;
  presence: PresenceUser;
  followingUserId?: UserId;
  /** Cursor broadcast throttling */
  lastCursorBroadcastAt: number;
}

interface BoardState {
  conns: Set<BrowserConn>;
  /** Monotonic broadcast counter. First broadcast is seq 1. */
  seq: number;
  /** Ring of the last REPLAY_BUFFER_SIZE broadcasts, oldest → newest. */
  recent: ServerMessage[];
}

class Hub {
  private boards: Map<BoardId, BoardState> = new Map();

  private getBoardState(boardId: BoardId): BoardState {
    let s = this.boards.get(boardId);
    if (!s) {
      s = { conns: new Set(), seq: 0, recent: [] };
      this.boards.set(boardId, s);
    }
    return s;
  }

  subscribe(conn: BrowserConn): void {
    this.getBoardState(conn.boardId).conns.add(conn);
  }

  unsubscribe(conn: BrowserConn): void {
    const s = this.boards.get(conn.boardId);
    if (!s) return;
    s.conns.delete(conn);
    // Keep the BoardState (and its replay buffer) alive even when the last
    // browser leaves — a tab that reconnects within the buffer window should
    // still be able to replay. The state ages out only on server restart.
  }

  /** Connections on a board, excluding nobody. */
  connectionsOnBoard(boardId: BoardId): BrowserConn[] {
    const s = this.boards.get(boardId);
    return s ? Array.from(s.conns) : [];
  }

  /** Find a single connection for a user on a board, if any. */
  findConn(boardId: BoardId, userId: UserId): BrowserConn | undefined {
    const s = this.boards.get(boardId);
    if (!s) return undefined;
    for (const c of s.conns) if (c.userId === userId) return c;
    return undefined;
  }

  /** Latest broadcast seq for the board — surfaced in the welcome message. */
  latestSeq(boardId: BoardId): number {
    return this.boards.get(boardId)?.seq ?? 0;
  }

  /**
   * Messages with `seq > sinceSeq` that we still hold in the replay buffer.
   * Returns null if the requested seq is older than our oldest cached
   * message — caller should treat that as "history lost, do a fresh fetch".
   */
  getMissedSince(boardId: BoardId, sinceSeq: number): ServerMessage[] | null {
    const s = this.boards.get(boardId);
    if (!s) return [];
    if (s.recent.length === 0) return [];
    const oldestSeq = s.recent[0]?.seq ?? 0;
    if (sinceSeq < oldestSeq - 1) return null; // history gap, caller refetches
    return s.recent.filter((m) => (m.seq ?? 0) > sinceSeq);
  }

  /**
   * Broadcast a message to all connections on a board, optionally excluding
   * a user. Stamps every outbound message with `PROTOCOL_VERSION` + a monotonic
   * per-board `seq`, and pushes a copy into the replay buffer so a client that
   * reconnects can ask for everything since its last-seen seq.
   */
  broadcast(boardId: BoardId, message: ServerMessage, exceptUserId?: UserId): void {
    const state = this.getBoardState(boardId);
    state.seq += 1;
    const stamped: ServerMessage = {
      ...message,
      version: PROTOCOL_VERSION,
      seq: state.seq,
    };
    state.recent.push(stamped);
    if (state.recent.length > REPLAY_BUFFER_SIZE) {
      state.recent.splice(0, state.recent.length - REPLAY_BUFFER_SIZE);
    }
    if (state.conns.size === 0) return;
    const payload = JSON.stringify(stamped);
    for (const conn of state.conns) {
      if (exceptUserId && conn.userId === exceptUserId) continue;
      try {
        conn.socket.send(payload);
      } catch {
        // ignore, connection may be closing
      }
    }
  }
}

export const hub = new Hub();
