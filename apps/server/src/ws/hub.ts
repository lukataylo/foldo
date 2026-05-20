import type { ServerMessage, UserId, BoardId, PresenceUser } from '@foldo/protocol';
import type { WebSocket } from 'ws';

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
  /**
   * Heartbeat liveness flag. Set false before each ping tick, set true on
   * every pong. A socket still false at the next tick is considered dead
   * (e.g. laptop sleep with no TCP FIN) and gets terminated.
   */
  isAlive: boolean;
}

/**
 * If a socket's outbound buffer exceeds this, the client can't keep up.
 * Rather than letting the buffer grow unbounded (and OOM the server) we
 * drop the message for that socket — or close it outright.
 */
const MAX_BUFFERED_BYTES = 1024 * 1024; // 1 MB

class Hub {
  private boards: Map<BoardId, Set<BrowserConn>> = new Map();

  subscribe(conn: BrowserConn): void {
    let set = this.boards.get(conn.boardId);
    if (!set) {
      set = new Set();
      this.boards.set(conn.boardId, set);
    }
    set.add(conn);
  }

  unsubscribe(conn: BrowserConn): void {
    const set = this.boards.get(conn.boardId);
    if (!set) return;
    set.delete(conn);
    if (set.size === 0) this.boards.delete(conn.boardId);
  }

  /** Connections on a board, excluding nobody. */
  connectionsOnBoard(boardId: BoardId): BrowserConn[] {
    const set = this.boards.get(boardId);
    return set ? Array.from(set) : [];
  }

  /** Find a single connection for a user on a board, if any. */
  findConn(boardId: BoardId, userId: UserId): BrowserConn | undefined {
    const set = this.boards.get(boardId);
    if (!set) return undefined;
    for (const c of set) if (c.userId === userId) return c;
    return undefined;
  }

  /**
   * Broadcast a message to all connections on a board, optionally excluding a user.
   *
   * Applies per-socket backpressure: a client whose outbound buffer is
   * already over the threshold is skipped (and closed) rather than having
   * its buffer grown — one slow client must not OOM the server.
   */
  broadcast(boardId: BoardId, message: ServerMessage, exceptUserId?: UserId): void {
    const set = this.boards.get(boardId);
    if (!set) return;
    const payload = JSON.stringify(message);
    for (const conn of set) {
      if (exceptUserId && conn.userId === exceptUserId) continue;
      try {
        if (conn.socket.bufferedAmount > MAX_BUFFERED_BYTES) {
          // Client is too far behind — terminate it so the buffer can be
          // reclaimed. The socket's `close` handler unsubscribes it.
          conn.socket.terminate();
          continue;
        }
        conn.socket.send(payload);
      } catch {
        // ignore, connection may be closing
      }
    }
  }

  /** Every connection across all boards. Used by the heartbeat sweep. */
  allConnections(): BrowserConn[] {
    const out: BrowserConn[] = [];
    for (const set of this.boards.values()) {
      for (const c of set) out.push(c);
    }
    return out;
  }
}

export const hub = new Hub();
