// Boot the canvas: pick a board, hydrate the store via REST, open the WS,
// stitch in the e2e dev-only WS hooks. Returns the boot state machine, an
// `useOfflineDemo()` callback the unreachable overlay binds to its "Use
// offline demo" button, and a stable `wsRef` so App can keep dispatching
// outbound messages (`cursor.move`, `selection.update`, `viewport.update`,
// `follow.start/stop`) without rewiring the existing call-sites.
//
// Boundary: this hook owns the boot effect — the only place that mutates
// the boardStore from a network response. Reads NO store slices (only
// writes); the bootKind it returns is local state, not store-derived.
//
// Inputs:
//   - route.boardId (read once at boot to decide which board to load)
//   - navigate     (used to canonicalise the URL when boardId was absent)
//   - demoUserId / demoToken (passed to the WS client + bearer)

import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  Dispatch,
  GetBoardResponse,
  ServerMessage,
} from '@foldo/protocol';
import { boardStore } from '../state/useBoardStore';
import { applyServerMessage } from '../state/reducers';
import { listBoards, getBoard } from '../api/boards';
import { listDispatches } from '../api/dispatches';
import { FoldoWsClient, type WsStatus } from '../api/ws';
import {
  mockBoardSnapshot,
  mockPresence,
  MOCK_BOARD_ID,
  MOCK_ME_USER_ID,
} from '../data/mockData';
import type { Route } from '../routing/Router';

export type BootState =
  | { kind: 'loading' }
  | { kind: 'unreachable'; error: string }
  | { kind: 'ready' }
  | { kind: 'offline' };

export interface CanvasBootOptions {
  /** The current Route (only `boardId` is read at boot). */
  route: Route;
  /** Router's navigate(); used to replace the URL with the canonical board path. */
  navigate: (next: Route, opts?: { replace?: boolean }) => void;
  /** Demo identity passed through to the WS client. */
  demoUserId: string;
  demoToken: string;
}

export interface CanvasBootApi {
  boot: BootState;
  /** Switch to the local mock board (called by the "Use offline demo" button). */
  useOfflineDemo: () => void;
  /** Live WS client ref. `null` until boot completes; `null` again on teardown. */
  wsRef: React.MutableRefObject<FoldoWsClient | null>;
}

export function useCanvasBoot({
  route,
  navigate,
  demoUserId,
  demoToken,
}: CanvasBootOptions): CanvasBootApi {
  const [boot, setBoot] = useState<BootState>({ kind: 'loading' });
  const wsRef = useRef<FoldoWsClient | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // Determine which board to load
        let boardId = route.boardId;
        if (!boardId) {
          const list = await listBoards();
          boardId =
            list.boards[0]?.id ??
            (() => {
              throw new Error('No boards on server.');
            })();
          // replace the URL with the canonical board path
          navigate({ boardId }, { replace: true });
        }

        // Hydrate from REST
        const snapshot = await getBoard(boardId);
        if (cancelled) return;

        hydrateStoreFromRest(snapshot, demoUserId);

        // Open the WS
        let wasOpenOnce = false;
        const ws = new FoldoWsClient({
          boardId,
          userId: demoUserId,
          token: demoToken,
          onStatusChange: (s: WsStatus) => {
            boardStore.setWsStatus(s);
            // On reconnect (already had a session), pull a fresh snapshot so
            // any frames/comments created while we were offline land in the store.
            if (s === 'open') {
              if (wasOpenOnce) {
                void Promise.all([
                  getBoard(boardId!),
                  listDispatches(boardId!),
                ])
                  .then(([fresh, d]) =>
                    rehydrateStoreFromRest(fresh, d.dispatches),
                  )
                  .catch(() => {
                    /* ignore, WS will keep us live */
                  });
              }
              wasOpenOnce = true;
            }
          },
        });
        wsRef.current = ws;
        ws.subscribeAll((msg: ServerMessage) => applyServerMessage(msg));
        ws.connect();

        // Dev-only hooks for e2e specs: let Playwright force-close the WS and
        // then reconnect it to exercise the `hello.sinceSeq` replay path.
        // Gated on import.meta.env.PROD so the production bundle doesn't ship
        // these handles. Reaches into FoldoWsClient's private `ws` field via a
        // cast (rather than adding a public surface that only a test uses).
        if (!import.meta.env.PROD && typeof window !== 'undefined') {
          const w = window as unknown as {
            __foldoWsClose?: () => void;
            __foldoWsConnect?: () => void;
          };
          w.__foldoWsClose = () => {
            try {
              (ws as unknown as { ws: WebSocket | null }).ws?.close();
            } catch {
              /* ignore */
            }
          };
          w.__foldoWsConnect = () => {
            ws.connect();
          };
        }

        setBoot({ kind: 'ready' });
      } catch (err) {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : String(err);
        console.warn('[foldo] could not reach cloud:', msg);
        setBoot({ kind: 'unreachable', error: msg });
      }
    })();
    return () => {
      cancelled = true;
      wsRef.current?.close();
      wsRef.current = null;
    };
    // We only want to bootstrap once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const useOfflineDemo = useCallback(() => {
    hydrateStoreFromMock();
    navigate({ boardId: MOCK_BOARD_ID }, { replace: true });
    setBoot({ kind: 'offline' });
  }, [navigate]);

  return { boot, useOfflineDemo, wsRef };
}

// ----- hydration helpers -----
// Identical bodies to the inlines App.tsx used to carry; live here so the
// boot hook is self-contained.

/** Build the Map-shaped slices shared by boot- and reconnect-hydration. */
function snapshotSlices(snapshot: GetBoardResponse) {
  return {
    board: snapshot.board,
    frames: new Map(snapshot.frames.map((f) => [f.id, f])),
    comments: new Map(snapshot.comments.map((c) => [c.id, c])),
    branches: new Map(snapshot.branches.map((b) => [b.id, b])),
    users: new Map(snapshot.users.map((u) => [u.id, u])),
    mcpConnected: snapshot.mcpConnected,
  };
}

function hydrateStoreFromRest(snapshot: GetBoardResponse, meUserId: string): void {
  const slices = snapshotSlices(snapshot);
  // Presence will be supplied by the WS welcome; seed a basic record for ourselves.
  const me = slices.users.get(meUserId);
  const presence = new Map<string, import('@foldo/protocol').PresenceUser>();
  if (me) {
    presence.set(meUserId, {
      userId: me.id,
      name: me.name,
      initial: me.initial,
      color: me.color,
      online: true,
      lastSeenAt: new Date().toISOString(),
    });
  }
  boardStore.set({
    hydrated: true,
    offline: false,
    wsStatus: 'connecting',
    meUserId,
    ...slices,
    presence,
    dispatches: new Map(),
    activeTestSessions: new Set(),
    testsRevision: 0,
  });
}

/**
 * Reconnect-time rehydrate. Unlike the boot-time {@link hydrateStoreFromRest}
 * this must NOT reset the slices the WS connection owns: the `welcome` that
 * just arrived seeded the full presence list (a wholesale `set` would wipe
 * remote peers, and the presence reducers drop updates for unknown users),
 * and `wsStatus` was just set to 'open' by the status callback.
 *
 * Slices the REST board payload doesn't carry get refreshed explicitly:
 * `dispatches` from the freshly-fetched list (so in-flight progress UI stays
 * accurate instead of stale or blank), `activeTestSessions` cleared (it's a
 * transient signal — a `test.session.completed` missed past the replay
 * buffer would otherwise stick the "testing now" badge forever), and
 * `testsRevision` bumped so an open TestsPanel refetches anything it missed.
 */
function rehydrateStoreFromRest(
  snapshot: GetBoardResponse,
  dispatches: Dispatch[],
): void {
  boardStore.patch({
    hydrated: true,
    offline: false,
    ...snapshotSlices(snapshot),
    dispatches: new Map(dispatches.map((d) => [d.id, d])),
    activeTestSessions: new Set(),
  });
  boardStore.markTestsChanged();
}

function hydrateStoreFromMock(): void {
  const s = mockBoardSnapshot;
  const frameMap = new Map(s.frames.map((f) => [f.id, f]));
  const commentMap = new Map(s.comments.map((c) => [c.id, c]));
  const branchMap = new Map(s.branches.map((b) => [b.id, b]));
  const userMap = new Map(s.users.map((u) => [u.id, u]));
  const presence = new Map(mockPresence().map((p) => [p.userId, p]));
  boardStore.set({
    hydrated: true,
    offline: true,
    wsStatus: 'closed',
    meUserId: MOCK_ME_USER_ID,
    board: s.board,
    frames: frameMap,
    comments: commentMap,
    branches: branchMap,
    users: userMap,
    presence,
    dispatches: new Map(),
    mcpConnected: false,
    activeTestSessions: new Set(),
    testsRevision: 0,
  });
}
