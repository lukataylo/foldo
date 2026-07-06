// Hub broadcast semantics — seq monotonicity, replay-buffer windowing, and
// the gap-detection path that tells clients to refetch. A regression here
// desyncs every connected canvas.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PROTOCOL_VERSION } from '@foldo/protocol';
import type { BoardId, ServerMessage, UserId } from '@foldo/protocol';
import { Hub, type BrowserConn } from '../hub.ts';

// Stub out the prom-client metrics so unit tests don't pull in the global
// registry. The hub imports `wsConnections` / `wsBroadcastSeq` from
// ../metrics, which calls collectDefaultMetrics at module load — fine for
// tests, just chatty.
vi.mock('../metrics.ts', () => ({
  wsConnections: { inc: vi.fn(), dec: vi.fn() },
  wsBroadcastSeq: { inc: vi.fn() },
  wsReplayGaps: { inc: vi.fn() },
  hubInitFallback: { inc: vi.fn() },
  setWsHubSampler: vi.fn(),
}));

const BOARD: BoardId = 'b-test';
const USER_A: UserId = 'u-anna';
const USER_M: UserId = 'u-mateo';

function fakeConn(userId: UserId): {
  conn: BrowserConn;
  sent: string[];
} {
  const sent: string[] = [];
  const conn: BrowserConn = {
    boardId: BOARD,
    userId,
    socket: {
      send(payload: string) {
        sent.push(payload);
      },
    } as unknown as BrowserConn['socket'],
  };
  return { conn, sent };
}

function frameAdded(): ServerMessage {
  return {
    type: 'frame.added',
    frame: {
      id: 'f-1',
      boardId: BOARD,
      kind: 'sticky',
      branchId: 'main',
      commitSha: 'a7c1d29',
      commitMessage: 'noop',
      age: 'just now',
      position: { x: 0, y: 0 },
      size: { width: 100, height: 100 },
      content: { kind: 'sticky', body: '', color: 'yellow' },
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
  };
}

describe('Hub', () => {
  let hub: Hub;
  beforeEach(() => {
    hub = new Hub();
  });
  afterEach(() => vi.clearAllMocks());

  it('starts at seq 0 for an unknown board', () => {
    expect(hub.latestSeq('b-never-broadcast-to' as BoardId)).toBe(0);
  });

  it('stamps every broadcast with monotonic seq + protocol version', () => {
    const { conn, sent } = fakeConn(USER_A);
    hub.subscribe(conn);
    hub.broadcast(BOARD, frameAdded());
    hub.broadcast(BOARD, frameAdded());
    hub.broadcast(BOARD, frameAdded());
    expect(sent.length).toBe(3);
    const parsed = sent.map((p) => JSON.parse(p));
    expect(parsed.map((m) => m.seq)).toEqual([1, 2, 3]);
    for (const m of parsed) expect(m.version).toBe(PROTOCOL_VERSION);
    expect(hub.latestSeq(BOARD)).toBe(3);
  });

  it('skips the excluded user on broadcast ("echo" suppression)', () => {
    const a = fakeConn(USER_A);
    const m = fakeConn(USER_M);
    hub.subscribe(a.conn);
    hub.subscribe(m.conn);
    hub.broadcast(BOARD, frameAdded(), USER_A);
    expect(a.sent.length).toBe(0);
    expect(m.sent.length).toBe(1);
  });

  it('replay buffer returns messages after the requested sinceSeq', () => {
    const { conn } = fakeConn(USER_A);
    hub.subscribe(conn);
    for (let i = 0; i < 5; i++) hub.broadcast(BOARD, frameAdded());
    // Client says "I have through seq 2", expect seqs 3,4,5.
    const missed = hub.getMissedSince(BOARD, 2);
    expect(missed).not.toBeNull();
    expect(missed!.map((m) => m.seq)).toEqual([3, 4, 5]);
  });

  it('replay buffer returns empty when caller is already current', () => {
    const { conn } = fakeConn(USER_A);
    hub.subscribe(conn);
    hub.broadcast(BOARD, frameAdded());
    hub.broadcast(BOARD, frameAdded());
    expect(hub.getMissedSince(BOARD, 2)).toEqual([]);
  });

  it('replay buffer signals a gap (null) when sinceSeq is older than the window', () => {
    const { conn } = fakeConn(USER_A);
    hub.subscribe(conn);
    // Send 300 broadcasts so the first 44 fall out of the 256-slot ring.
    for (let i = 0; i < 300; i++) hub.broadcast(BOARD, frameAdded());
    // Asking for "since seq 1" — that's long gone.
    expect(hub.getMissedSince(BOARD, 1)).toBeNull();
    // But "since seq 250" is still within the window.
    expect(hub.getMissedSince(BOARD, 250)?.length).toBe(50);
  });

  it('returns [] for an unknown board (nothing was missed)', () => {
    expect(hub.getMissedSince('b-never' as BoardId, 0)).toEqual([]);
    expect(hub.getMissedSince('b-never' as BoardId, 5)).toEqual([]);
  });

  it('signals a gap when seq moved past sinceSeq but recent is empty (defensive)', () => {
    const { conn } = fakeConn(USER_A);
    hub.subscribe(conn);
    hub.broadcast(BOARD, frameAdded());
    hub.broadcast(BOARD, frameAdded());
    // Simulate a pathological state: seq counter still says 2 but the buffer
    // was wiped. A client claiming sinceSeq=1 must be told to refetch — the
    // pre-fix code returned [] here, silently dropping events.
    // @ts-expect-error: poke private state for the simulation.
    hub.boards.get(BOARD).recent = [];
    expect(hub.getMissedSince(BOARD, 1)).toBeNull();
    // Same buffer-empty state, but client already at seq 2 → genuinely
    // nothing to replay.
    expect(hub.getMissedSince(BOARD, 2)).toEqual([]);
  });

  it('keeps board state alive after the last conn leaves so replay still works', () => {
    const { conn } = fakeConn(USER_A);
    hub.subscribe(conn);
    hub.broadcast(BOARD, frameAdded());
    hub.broadcast(BOARD, frameAdded());
    hub.unsubscribe(conn);
    // Next browser tab on the same board should still see the buffer.
    expect(hub.getMissedSince(BOARD, 0)?.length).toBe(2);
    expect(hub.latestSeq(BOARD)).toBe(2);
  });

  describe('eviction sweep', () => {
    const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

    it('does not evict a board that still has live conns', () => {
      const { conn } = fakeConn(USER_A);
      hub.subscribe(conn);
      hub.broadcast(BOARD, frameAdded());
      // Pretend the board has been here for a year.
      const evicted = hub.sweep(Date.now() + 365 * 24 * 60 * 60 * 1000);
      expect(evicted).toBe(0);
      expect(hub.latestSeq(BOARD)).toBe(1);
    });

    it('does not evict a board that is empty but recently touched', () => {
      const { conn } = fakeConn(USER_A);
      hub.subscribe(conn);
      hub.broadcast(BOARD, frameAdded());
      hub.unsubscribe(conn);
      // Within the idle window — keep it so a reconnect can replay.
      const evicted = hub.sweep(Date.now() + 60 * 1000);
      expect(evicted).toBe(0);
      expect(hub.latestSeq(BOARD)).toBe(1);
    });

    it('evicts a board that is empty AND idle past the 30-day cutoff', () => {
      const { conn } = fakeConn(USER_A);
      hub.subscribe(conn);
      hub.broadcast(BOARD, frameAdded());
      hub.unsubscribe(conn);
      // Jump 30d + 1m into the future.
      const evicted = hub.sweep(Date.now() + THIRTY_DAYS_MS + 60 * 1000);
      expect(evicted).toBe(1);
      // After eviction the board's seq is forgotten (a fresh broadcast
      // would start at 1 again — by design; this is the same behaviour
      // as a server restart).
      expect(hub.latestSeq(BOARD)).toBe(0);
    });
  });

  describe('sampleStats', () => {
    it('reports zeros on an empty hub', () => {
      expect(hub.sampleStats()).toEqual({
        boardCount: 0,
        oldestSeqAgeSeconds: 0,
        bufferSizeBytes: 0,
      });
    });

    it('reports board count, buffer bytes, and a non-negative age after a broadcast', () => {
      const { conn } = fakeConn(USER_A);
      hub.subscribe(conn);
      hub.broadcast(BOARD, frameAdded());
      const stats = hub.sampleStats();
      expect(stats.boardCount).toBe(1);
      expect(stats.bufferSizeBytes).toBeGreaterThan(0);
      expect(stats.oldestSeqAgeSeconds).toBeGreaterThanOrEqual(0);
    });
  });
});
