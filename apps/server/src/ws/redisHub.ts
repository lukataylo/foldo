// Redis-backed sibling of the in-memory Hub. Activated automatically when
// `REDIS_URL` is set; selected at module load by `./hub.ts` so the rest of
// the server doesn't know which one it's talking to.
//
// Shape:
//   - INCR per-board seq counter for monotonic stamping across instances.
//   - ZADD per-board sorted set of recent broadcasts (score = seq, value =
//     stringified message). ZREMRANGEBYRANK trims to REPLAY_BUFFER_SIZE.
//   - PUBLISH on a per-board channel so every instance receives the
//     broadcast and forwards to its local socket set.
//
// Each instance keeps its own connection set (`BrowserConn[]` per boardId) —
// websockets can't be shared across processes, so the hub is responsible for
// forwarding the broadcast to the *local* sockets only. The pub/sub
// machinery is what makes a cross-instance broadcast reach those locals.

import { Redis } from 'ioredis';
import type {
  BoardId,
  ServerMessage,
  UserId,
} from '@foldo/protocol';
import { PROTOCOL_VERSION } from '@foldo/protocol';
import { setWsHubSampler, wsBroadcastSeq, wsConnections, type WsHubSample } from '../metrics.ts';
import { jobLogger } from '../log.ts';
import type { BrowserConn, HubInterface } from './hub.ts';

const log = jobLogger('redis-hub');

/** Same window size as the in-memory hub — see hub.ts. */
const REPLAY_BUFFER_SIZE = 256;

/**
 * How long we hold an idle pub/sub subscription open after the last
 * local connection drops. A tab reconnecting within this window pays
 * zero re-subscribe latency; past it, we unsubscribe and reclaim the
 * Redis-side channel state. 5 min matches typical "user hops between
 * tabs / closes laptop briefly" patterns.
 */
const SUBSCRIPTION_IDLE_MS = 5 * 60 * 1000;

function keys(boardId: BoardId) {
  return {
    seq: `foldo:b:${boardId}:seq`,
    recent: `foldo:b:${boardId}:recent`,
    channel: `foldo:b:${boardId}:bcast`,
  };
}

interface BroadcastEnvelope {
  origin: string;
  exceptUserId?: UserId;
  message: ServerMessage;
}

export class RedisHub implements HubInterface {
  /** Local conns per board — sockets that this process is responsible for. */
  private localConns: Map<BoardId, Set<BrowserConn>> = new Map();
  private readonly id: string;
  private readonly pub: Redis;
  /** Subscriber connection — separate per ioredis rules. */
  private readonly sub: Redis;
  /** Subscribed channels so we don't double-subscribe per board. */
  private subscribed: Set<string> = new Set();
  /**
   * Per-board "unsubscribe after idle" timers. Set when the last local
   * conn leaves; cleared if a new conn arrives within
   * {@link SUBSCRIPTION_IDLE_MS}. The Map key is boardId, not channel,
   * so cancellation is straightforward.
   */
  private idleTimers: Map<BoardId, NodeJS.Timeout> = new Map();

  constructor(url: string) {
    this.id = `${process.pid}-${Math.random().toString(36).slice(2, 8)}`;
    this.pub = new Redis(url, { lazyConnect: false });
    this.sub = new Redis(url, { lazyConnect: false });
    this.pub.on('error', (err) => log.error({ err }, 'pub error'));
    this.sub.on('error', (err) => log.error({ err }, 'sub error'));
    this.sub.on('message', (channel, raw) => {
      try {
        const env = JSON.parse(raw) as BroadcastEnvelope;
        // Drop our own echo — we already delivered locally synchronously
        // inside broadcast(), so the published message hitting us again on
        // the sub socket would double-send.
        if (env.origin === this.id) return;
        const boardId = channelToBoardId(channel);
        if (!boardId) return;
        this.deliverLocal(boardId, env.message, env.exceptUserId);
      } catch (err) {
        log.warn({ err }, 'failed to parse pubsub message');
      }
    });
    // Expose hub stats to Prometheus. RedisHub's storage is mostly on
    // the Redis side, but the local Maps still tell you "how many
    // boards is this instance forwarding for?".
    setWsHubSampler(() => this.sampleStats());
  }

  /**
   * Awaitable boot — verify both Redis sockets are live (ioredis
   * connects lazily-but-eagerly with lazyConnect:false; this resolves
   * once both clients have completed their initial handshake). Throws
   * on connect failure so the bootstrap in index.ts can fall back to
   * the in-memory hub.
   */
  async waitReady(timeoutMs: number = 5000): Promise<void> {
    const ready = (r: Redis): Promise<void> =>
      new Promise((resolve, reject) => {
        if (r.status === 'ready') return resolve();
        const onReady = (): void => {
          cleanup();
          resolve();
        };
        const onError = (err: Error): void => {
          cleanup();
          reject(err);
        };
        const cleanup = (): void => {
          r.off('ready', onReady);
          r.off('error', onError);
        };
        r.once('ready', onReady);
        r.once('error', onError);
      });
    const deadline = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`redis hub connect timed out after ${timeoutMs}ms`)), timeoutMs),
    );
    await Promise.race([Promise.all([ready(this.pub), ready(this.sub)]), deadline]);
  }

  subscribe(conn: BrowserConn): void {
    let set = this.localConns.get(conn.boardId);
    if (!set) {
      set = new Set();
      this.localConns.set(conn.boardId, set);
    }
    set.add(conn);
    wsConnections.inc({ boardId: conn.boardId });
    // A new conn arrived — cancel any pending unsubscribe-after-idle
    // timer so we keep the subscription hot.
    const pending = this.idleTimers.get(conn.boardId);
    if (pending) {
      clearTimeout(pending);
      this.idleTimers.delete(conn.boardId);
    }
    void this.ensureChannelSubscribed(conn.boardId);
  }

  unsubscribe(conn: BrowserConn): void {
    const set = this.localConns.get(conn.boardId);
    if (!set) return;
    if (set.delete(conn)) wsConnections.dec({ boardId: conn.boardId });
    // Empty local set → arm an idle timer to drop the Redis-side
    // subscription. A tab reconnecting before it fires re-uses the
    // existing subscription (see subscribe()). Past the timer we
    // unsubscribe + free both Map entries; cross-instance broadcasts
    // for this board no longer reach us until the next local conn
    // re-subscribes.
    if (set.size === 0) {
      // Don't double-arm — if a previous unsubscribe is still pending
      // we let it fire on its own schedule.
      if (!this.idleTimers.has(conn.boardId)) {
        const boardId = conn.boardId;
        const t = setTimeout(() => {
          this.idleTimers.delete(boardId);
          // Re-check: a new conn may have arrived between when this
          // timer was armed and now. If so, skip.
          const current = this.localConns.get(boardId);
          if (current && current.size > 0) return;
          this.localConns.delete(boardId);
          void this.unsubscribeChannel(boardId);
        }, SUBSCRIPTION_IDLE_MS);
        t.unref?.();
        this.idleTimers.set(boardId, t);
      }
    }
  }

  connectionsOnBoard(boardId: BoardId): BrowserConn[] {
    const set = this.localConns.get(boardId);
    return set ? Array.from(set) : [];
  }

  findConn(boardId: BoardId, userId: UserId): BrowserConn | undefined {
    const set = this.localConns.get(boardId);
    if (!set) return undefined;
    for (const c of set) if (c.userId === userId) return c;
    return undefined;
  }

  async latestSeq(boardId: BoardId): Promise<number> {
    const v = await this.pub.get(keys(boardId).seq);
    return v ? Number(v) : 0;
  }

  /**
   * Messages with seq > sinceSeq still in the replay buffer. Returns null if
   * the requested seq is older than the oldest cached message — caller
   * refetches the board state via REST.
   */
  async getMissedSince(
    boardId: BoardId,
    sinceSeq: number,
  ): Promise<ServerMessage[] | null> {
    const k = keys(boardId);
    // Detect a gap: if the smallest cached score is greater than sinceSeq+1
    // we've already trimmed the requested range.
    const oldest = await this.pub.zrange(k.recent, 0, 0, 'WITHSCORES');
    if (oldest.length === 0) return [];
    const oldestSeq = Number(oldest[1] ?? '0');
    if (sinceSeq < oldestSeq - 1) return null;
    const rows = await this.pub.zrangebyscore(
      k.recent,
      `(${sinceSeq}`, // exclusive lower bound
      '+inf',
    );
    return rows.map((r) => JSON.parse(r) as ServerMessage);
  }

  async broadcast(
    boardId: BoardId,
    message: ServerMessage,
    exceptUserId?: UserId,
  ): Promise<void> {
    const k = keys(boardId);
    // Monotonic seq via INCR — works across instances; the resulting integer
    // is what stamps the message.
    const seq = await this.pub.incr(k.seq);
    const stamped: ServerMessage = {
      ...message,
      version: PROTOCOL_VERSION,
      seq,
    };
    const payload = JSON.stringify(stamped);
    // Persist into the replay buffer, then trim. Pipelined so one round-trip.
    const pipeline = this.pub.pipeline();
    pipeline.zadd(k.recent, String(seq), payload);
    pipeline.zremrangebyrank(k.recent, 0, -REPLAY_BUFFER_SIZE - 1);
    // Publish to subscribers (other instances + ourselves; we drop self in
    // the sub handler).
    pipeline.publish(
      k.channel,
      JSON.stringify({
        origin: this.id,
        exceptUserId,
        message: stamped,
      } satisfies BroadcastEnvelope),
    );
    pipeline.exec().catch((err) => log.error({ err, boardId }, 'broadcast pipeline failed'));

    wsBroadcastSeq.inc({ boardId, type: message.type });
    // Deliver to LOCAL conns synchronously — pub/sub round-trip would add ~ms
    // of latency for no benefit when the broadcaster has local subscribers.
    this.deliverLocal(boardId, stamped, exceptUserId);
  }

  private deliverLocal(
    boardId: BoardId,
    stamped: ServerMessage,
    exceptUserId?: UserId,
  ): void {
    const set = this.localConns.get(boardId);
    if (!set) return;
    const payload = JSON.stringify(stamped);
    for (const conn of set) {
      if (exceptUserId && conn.userId === exceptUserId) continue;
      try {
        conn.socket.send(payload);
      } catch (err) {
        // Log + continue: a dying socket shouldn't break the rest of
        // the fan-out. The close handler will reap it.
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

  private async ensureChannelSubscribed(boardId: BoardId): Promise<void> {
    const channel = keys(boardId).channel;
    if (this.subscribed.has(channel)) return;
    this.subscribed.add(channel);
    try {
      await this.sub.subscribe(channel);
    } catch (err) {
      this.subscribed.delete(channel);
      log.error({ err, boardId }, 'failed to subscribe to channel');
    }
  }

  private async unsubscribeChannel(boardId: BoardId): Promise<void> {
    const channel = keys(boardId).channel;
    if (!this.subscribed.has(channel)) return;
    this.subscribed.delete(channel);
    try {
      await this.sub.unsubscribe(channel);
    } catch (err) {
      // Restore optimistic state so a future subscribe() actually
      // retries instead of assuming we're already subscribed.
      this.subscribed.add(channel);
      log.warn({ err, boardId }, 'failed to unsubscribe from channel');
    }
  }

  /**
   * Snapshot for the metrics gauges. The Redis impl can't cheaply
   * answer "oldest message age" or "total buffer bytes" without an
   * extra round-trip per board, so we report 0 for those — the
   * Prometheus dashboard for a Redis-backed deploy is expected to read
   * those off Redis itself (e.g. via the ZSET memory metrics).
   */
  sampleStats(): WsHubSample {
    return {
      boardCount: this.localConns.size,
      oldestSeqAgeSeconds: 0,
      bufferSizeBytes: 0,
    };
  }

  /** Graceful shutdown — clear idle timers + close both Redis connections. */
  async close(): Promise<void> {
    for (const t of this.idleTimers.values()) clearTimeout(t);
    this.idleTimers.clear();
    await Promise.allSettled([this.pub.quit(), this.sub.quit()]);
  }
}

function channelToBoardId(channel: string): BoardId | null {
  // foldo:b:<boardId>:bcast
  const m = /^foldo:b:(.+):bcast$/.exec(channel);
  return m ? (m[1] as BoardId) : null;
}
