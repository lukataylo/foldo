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
import { wsBroadcastSeq, wsConnections } from '../metrics.ts';
import { jobLogger } from '../log.ts';
import type { BrowserConn, HubInterface } from './hub.ts';

const log = jobLogger('redis-hub');

/** Same window size as the in-memory hub — see hub.ts. */
const REPLAY_BUFFER_SIZE = 256;

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
  }

  subscribe(conn: BrowserConn): void {
    let set = this.localConns.get(conn.boardId);
    if (!set) {
      set = new Set();
      this.localConns.set(conn.boardId, set);
    }
    set.add(conn);
    wsConnections.inc({ boardId: conn.boardId });
    void this.ensureChannelSubscribed(conn.boardId);
  }

  unsubscribe(conn: BrowserConn): void {
    const set = this.localConns.get(conn.boardId);
    if (!set) return;
    if (set.delete(conn)) wsConnections.dec({ boardId: conn.boardId });
    // Note: we deliberately keep the Redis channel subscription alive even if
    // the local set is empty — a tab reconnecting within seconds is the
    // common case, and the cost of an empty subscription is one TCP message
    // per broadcast for this board.
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
      } catch {
        // ignore, connection may be closing
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

  /** Graceful shutdown — close both Redis connections. */
  async close(): Promise<void> {
    await Promise.allSettled([this.pub.quit(), this.sub.quit()]);
  }
}

function channelToBoardId(channel: string): BoardId | null {
  // foldo:b:<boardId>:bcast
  const m = /^foldo:b:(.+):bcast$/.exec(channel);
  return m ? (m[1] as BoardId) : null;
}
