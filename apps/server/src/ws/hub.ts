import type { ServerMessage, UserId, BoardId, PresenceUser } from '@foldo/protocol';
import { PROTOCOL_VERSION } from '@foldo/protocol';
import type { WebSocket } from 'ws';
import { setWsHubSampler, wsBroadcastSeq, wsConnections, type WsHubSample } from '../metrics.ts';
import { jobLogger } from '../log.ts';

const log = jobLogger('hub');

/**
 * How often we sweep `boards` for evictable entries (empty + idle).
 */
const SWEEP_INTERVAL_MS = 5 * 60 * 1000;

/**
 * A board state is evictable when it has zero local connections AND
 * hasn't seen a touch (subscribe or broadcast) for this long. 30 days
 * matches the replay-window expectation: if nobody has touched a board
 * in a month, the in-memory replay buffer for it has zero chance of
 * being useful to a reconnecting tab.
 */
const EVICTION_IDLE_MS = 30 * 24 * 60 * 60 * 1000;

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
 * Browser-WS client connected to a board. Same record either backend
 * uses — sockets are inherently per-process, but the broadcast machinery
 * (in-memory or Redis pub/sub) is what fans the message out across them.
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

/**
 * Shared shape between the in-memory Hub and the Redis-backed RedisHub.
 * `latestSeq` / `getMissedSince` return `Promise<...>` to accommodate the
 * Redis impl; the in-memory impl returns them sync (which still satisfies a
 * Promise<T> return type because TS narrows `T` to `T | Promise<T>` at the
 * call site).
 */
export interface HubInterface {
  subscribe(conn: BrowserConn): void;
  unsubscribe(conn: BrowserConn): void;
  connectionsOnBoard(boardId: BoardId): BrowserConn[];
  findConn(boardId: BoardId, userId: UserId): BrowserConn | undefined;
  latestSeq(boardId: BoardId): number | Promise<number>;
  getMissedSince(
    boardId: BoardId,
    sinceSeq: number,
  ): ServerMessage[] | null | Promise<ServerMessage[] | null>;
  broadcast(
    boardId: BoardId,
    message: ServerMessage,
    exceptUserId?: UserId,
  ): void | Promise<void>;
}

interface BoardState {
  conns: Set<BrowserConn>;
  /** Monotonic broadcast counter. First broadcast is seq 1. */
  seq: number;
  /** Ring of the last REPLAY_BUFFER_SIZE broadcasts, oldest → newest. */
  recent: ServerMessage[];
  /**
   * Wall-clock of the last touch (subscribe or broadcast). Used by the
   * periodic sweep to evict boards that have been empty + idle for
   * {@link EVICTION_IDLE_MS}. Kept in ms-since-epoch to keep the
   * eviction predicate a plain subtraction.
   */
  lastTouchedAt: number;
  /**
   * Wall-clock when the oldest message currently in `recent` was
   * pushed. Tracked separately from `recent[0]` because messages don't
   * carry their own server-side timestamp — and we want the metric to
   * answer "how stale is anything I'd hand a reconnecting tab?".
   */
  oldestRecentPushedAt: number;
  /**
   * Rough byte-count of every payload in `recent`. Maintained as we
   * push/trim so the metrics sampler doesn't have to re-serialize.
   * Useful for "is one chatty board eating all the buffer memory?".
   */
  recentBytes: number;
}

export class Hub {
  private boards: Map<BoardId, BoardState> = new Map();
  private sweepTimer: NodeJS.Timeout | null = null;

  constructor() {
    // Wire the prom-client sampler so the gauges defined in metrics.ts
    // see this hub's current state on every scrape. Safe to call even
    // if multiple Hub instances are constructed in tests — the last one
    // wins, and tests stub out metrics anyway.
    setWsHubSampler(() => this.sampleStats());
  }

  private getBoardState(boardId: BoardId): BoardState {
    let s = this.boards.get(boardId);
    if (!s) {
      s = {
        conns: new Set(),
        seq: 0,
        recent: [],
        lastTouchedAt: Date.now(),
        oldestRecentPushedAt: 0,
        recentBytes: 0,
      };
      this.boards.set(boardId, s);
    }
    return s;
  }

  subscribe(conn: BrowserConn): void {
    const s = this.getBoardState(conn.boardId);
    s.conns.add(conn);
    s.lastTouchedAt = Date.now();
    wsConnections.inc({ boardId: conn.boardId });
  }

  unsubscribe(conn: BrowserConn): void {
    const s = this.boards.get(conn.boardId);
    if (!s) return;
    if (s.conns.delete(conn)) {
      wsConnections.dec({ boardId: conn.boardId });
    }
    // Keep the BoardState (and its replay buffer) alive even when the last
    // browser leaves — a tab that reconnects within the buffer window should
    // still be able to replay. The state is reclaimed by the periodic
    // {@link sweep} once it's been empty + idle for {@link EVICTION_IDLE_MS}.
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
   *
   * Semantics:
   *   - Board never seen / `recent` empty AND seq counter still at 0
   *     → return [] (nothing was missed, nothing to replay).
   *   - Board has `seq > sinceSeq` but `recent` is empty
   *     → return null (we know something happened but can't replay it —
   *       client must refetch). This was previously returning [] which
   *       silently swallowed events, the root cause of task #59.
   *   - `sinceSeq < oldestBufferedSeq - 1`
   *     → return null (history gap, caller refetches).
   *   - Otherwise → return every buffered message with `seq > sinceSeq`.
   *     Filtering by the stamped `seq` (not array index) is what makes the
   *     ring buffer's eviction transparent to callers.
   */
  getMissedSince(boardId: BoardId, sinceSeq: number): ServerMessage[] | null {
    const s = this.boards.get(boardId);
    if (!s) return [];
    if (s.recent.length === 0) {
      // No buffered messages. If the board's seq counter has never moved past
      // what the client says it last saw, there's genuinely nothing to
      // replay. Otherwise we lost history (e.g. server restart) — signal a
      // gap so the client refetches via REST.
      return s.seq > sinceSeq ? null : [];
    }
    const oldestSeq = s.recent[0]?.seq ?? 0;
    if (sinceSeq < oldestSeq - 1) return null; // history gap, caller refetches
    return s.recent.filter((m) => (m.seq ?? 0) > sinceSeq);
  }

  /**
   * Broadcast a message to all connections on a board, optionally excluding
   * a user. Stamps every outbound message with `PROTOCOL_VERSION` + a monotonic
   * per-board `seq`, and pushes a copy into the replay buffer so a client that
   * reconnects can ask for everything since its last-seen seq.
   *
   * Atomicity contract: the seq-increment + recent.push + fanout all happen
   * inside one synchronous call. Node.js's event loop guarantees no other
   * handler runs between these steps, so a concurrent `hello { sinceSeq }`
   * on a different socket can't observe a half-applied broadcast (e.g. the
   * counter incremented but the message not yet in the buffer).
   */
  broadcast(boardId: BoardId, message: ServerMessage, exceptUserId?: UserId): void {
    const state = this.getBoardState(boardId);
    const now = Date.now();
    state.lastTouchedAt = now;
    // Stamp + buffer atomically with the seq increment. The buffered copy is
    // what `getMissedSince` returns to a reconnecting client, so it MUST be
    // in the buffer before any other request handler can read it. The
    // single-threaded event loop guarantees that — no `await` lives between
    // these lines. We compute `seq` first, push into the buffer, THEN write
    // `state.seq` so a concurrent `hello { sinceSeq }` reading `state.seq`
    // can never see a higher seq than what's actually in `state.recent`.
    const seq = state.seq + 1;
    const stamped: ServerMessage = {
      ...message,
      version: PROTOCOL_VERSION,
      seq,
    };
    const payload = JSON.stringify(stamped);
    state.recent.push(stamped);
    state.recentBytes += payload.length;
    if (state.recent.length === 1) {
      // First entry — its push-time IS the oldest-recent age baseline.
      state.oldestRecentPushedAt = now;
    }
    state.seq = seq;
    if (state.recent.length > REPLAY_BUFFER_SIZE) {
      const dropCount = state.recent.length - REPLAY_BUFFER_SIZE;
      const dropped = state.recent.splice(0, dropCount);
      // Re-estimate by subtracting the JSON length of each dropped
      // entry — cheaper than re-summing the whole buffer.
      for (const m of dropped) state.recentBytes -= JSON.stringify(m).length;
      if (state.recentBytes < 0) state.recentBytes = 0;
      // The new head is `dropCount` away from where the buffer started
      // its life this broadcast — but each message is broadcast back to
      // back during a hot edit, so approximating "oldest push time" as
      // "now minus avg gap" would be a lie. The safest cheap proxy is
      // to set it to `now` whenever we trim: it gives a slight
      // underestimate of "oldest message age", which is fine for an
      // alerting metric.
      state.oldestRecentPushedAt = now;
    }
    wsBroadcastSeq.inc({ boardId, type: message.type });
    if (state.conns.size === 0) return;
    for (const conn of state.conns) {
      if (exceptUserId && conn.userId === exceptUserId) continue;
      try {
        conn.socket.send(payload);
      } catch (err) {
        // Don't break the broadcast loop — the connection may be
        // mid-close, or the socket may have died but Fastify hasn't
        // fired `close` yet. The hub will reap it via unsubscribe()
        // when the close handler eventually runs.
        log.warn(
          {
            boardId,
            userId: conn.userId,
            err: err instanceof Error ? err.message : String(err),
          },
          'ws send failed',
        );
      }
    }
  }

  /**
   * Reap boards that have no local connections AND haven't been
   * touched for {@link EVICTION_IDLE_MS}. Public so the periodic
   * sweep timer can call it AND so unit tests can drive it
   * deterministically without waiting on the interval.
   *
   * Returns the number of boards evicted — primarily for tests +
   * logs.
   */
  sweep(now: number = Date.now()): number {
    let evicted = 0;
    for (const [boardId, state] of this.boards) {
      if (state.conns.size > 0) continue;
      if (now - state.lastTouchedAt <= EVICTION_IDLE_MS) continue;
      this.boards.delete(boardId);
      evicted += 1;
    }
    if (evicted > 0) {
      log.info({ evicted, remaining: this.boards.size }, 'hub: evicted idle boards');
    }
    return evicted;
  }

  /**
   * Start the periodic sweep timer. Idempotent — safe to call multiple
   * times. The returned interval is `unref`-ed so it doesn't block a
   * graceful Node shutdown.
   */
  startSweep(intervalMs: number = SWEEP_INTERVAL_MS): void {
    if (this.sweepTimer) return;
    this.sweepTimer = setInterval(() => this.sweep(), intervalMs);
    this.sweepTimer.unref?.();
  }

  /** Stop the periodic sweep — used by tests + graceful shutdown. */
  stopSweep(): void {
    if (this.sweepTimer) {
      clearInterval(this.sweepTimer);
      this.sweepTimer = null;
    }
  }

  /**
   * Snapshot of stats used by the metrics gauges. Cheap O(boards) —
   * called at most once per Prometheus scrape (≤ once per 15 s).
   */
  sampleStats(): WsHubSample {
    let oldestPushedAt = 0;
    let bufferSizeBytes = 0;
    const now = Date.now();
    for (const state of this.boards.values()) {
      bufferSizeBytes += state.recentBytes;
      if (state.recent.length > 0) {
        if (oldestPushedAt === 0 || state.oldestRecentPushedAt < oldestPushedAt) {
          oldestPushedAt = state.oldestRecentPushedAt;
        }
      }
    }
    const oldestSeqAgeSeconds = oldestPushedAt === 0 ? 0 : Math.max(0, (now - oldestPushedAt) / 1000);
    return {
      boardCount: this.boards.size,
      oldestSeqAgeSeconds,
      bufferSizeBytes,
    };
  }
}

/**
 * In-memory hub instance. Always constructed at module load — even in
 * Redis-backed deploys, because it acts as a fallback if RedisHub init
 * fails. Tests import the {@link Hub} class directly and `new Hub()`.
 */
export const inMemoryHub = new Hub();
inMemoryHub.startSweep();

/**
 * Currently-active hub backing the {@link hub} proxy. Swappable at boot
 * via {@link setActiveHub}. Defaults to {@link inMemoryHub}.
 */
let activeHub: HubInterface = inMemoryHub;

export function setActiveHub(next: HubInterface): void {
  activeHub = next;
}

/**
 * Public hub handle. A thin facade that forwards every HubInterface
 * method to whichever impl is current. Existing call sites
 * (`hub.broadcast(...)`, `hub.subscribe(...)`, …) keep working
 * unmodified, but the underlying behaviour flips between in-memory and
 * Redis depending on how {@link setActiveHub} was called at boot.
 */
export const hub: HubInterface = {
  subscribe: (conn) => activeHub.subscribe(conn),
  unsubscribe: (conn) => activeHub.unsubscribe(conn),
  connectionsOnBoard: (boardId) => activeHub.connectionsOnBoard(boardId),
  findConn: (boardId, userId) => activeHub.findConn(boardId, userId),
  latestSeq: (boardId) => activeHub.latestSeq(boardId),
  getMissedSince: (boardId, sinceSeq) => activeHub.getMissedSince(boardId, sinceSeq),
  broadcast: (boardId, message, exceptUserId) => activeHub.broadcast(boardId, message, exceptUserId),
};
