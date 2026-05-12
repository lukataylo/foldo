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
}

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
   */
  broadcast(boardId: BoardId, message: ServerMessage, exceptUserId?: UserId): void {
    const set = this.boards.get(boardId);
    if (!set) return;
    const payload = JSON.stringify(message);
    for (const conn of set) {
      if (exceptUserId && conn.userId === exceptUserId) continue;
      try {
        conn.socket.send(payload);
      } catch {
        // ignore — connection may be closing
      }
    }
  }
}

export const hub = new Hub();
