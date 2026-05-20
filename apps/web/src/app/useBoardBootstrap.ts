// Boot sequence + WebSocket lifecycle, extracted from App.tsx.
//
// Boot sequence:
//   1. Parse the URL to find the desired board / frame / comment.
//   2. Authenticate (demo: use a stable per-browser userId+token).
//   3. GET /api/boards to discover an active board (if none specified).
//   4. GET /api/boards/:id to hydrate the store.
//   5. Open the canvas WebSocket and apply incoming ServerMessages.
//
// Fallback: if step 3 or 4 fails (server not running), the host shows the
// offline panel with a "Use offline demo" button (useOfflineDemo).

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Branch, Comment, Frame, ServerMessage } from '@foldo/protocol';
import { boardStore } from '../state/useBoardStore';
import { applyServerMessage } from '../state/reducers';
import { setAuth } from '../api/client';
import { listBoards, getBoard } from '../api/boards';
import { FoldoWsClient, type WsStatus } from '../api/ws';
import {
  mockBoardSnapshot,
  mockPresence,
  MOCK_BOARD_ID,
  MOCK_ME_USER_ID,
} from '../data/mockData';
import type { Route } from '../routing/Router';

interface StoredUser {
  id: string;
  name?: string;
  initial?: string;
  color?: string;
  email?: string;
}

function readStoredAuth(): { userId: string; token: string } | null {
  try {
    const token = localStorage.getItem('foldo:token');
    const userRaw = localStorage.getItem('foldo:user');
    if (!token || !userRaw) return null;
    const user = JSON.parse(userRaw) as StoredUser;
    if (!user.id) return null;
    return { userId: user.id, token };
  } catch {
    return null;
  }
}

/**
 * Demo identity picker. Defaults to `u-you` (the seeded "You" user). Open multiple
 * browsers / windows and switch to `u-anna` / `u-mateo` / `u-priya` to demo
 * multiplayer with distinct cursors. Selection persists in localStorage.
 */
function readOrCreateDemoUserId(): string {
  try {
    const KEY = 'foldo:demoUserId';
    const stored = localStorage.getItem(KEY);
    const valid = ['u-you', 'u-anna', 'u-mateo', 'u-priya'];
    if (stored && valid.includes(stored)) return stored;
    // Default to u-you so the first paint always authenticates against the seed.
    return 'u-you';
  } catch {
    return 'u-you';
  }
}

export function setDemoUserId(id: string): void {
  try {
    localStorage.setItem('foldo:demoUserId', id);
  } catch {
    /* ignore */
  }
}

const REAL_AUTH = readStoredAuth();
export const DEMO_USER_ID = REAL_AUTH?.userId ?? readOrCreateDemoUserId();
export const DEMO_TOKEN = REAL_AUTH?.token ?? DEMO_USER_ID; // demo: token == userId
setAuth(DEMO_USER_ID, DEMO_TOKEN);

export type BootState =
  | { kind: 'loading' }
  | { kind: 'unreachable'; error: string }
  | { kind: 'ready' }
  | { kind: 'offline' };

// ----- bootstrapping helpers -----

export function hydrateStoreFromRest(
  snapshot: {
    board: import('@foldo/protocol').Board;
    branches: Branch[];
    frames: Frame[];
    comments: Comment[];
    users: import('@foldo/protocol').User[];
    mcpConnected: boolean;
  },
  meUserId: string,
) {
  const frameMap = new Map(snapshot.frames.map((f) => [f.id, f]));
  const commentMap = new Map(snapshot.comments.map((c) => [c.id, c]));
  const branchMap = new Map(snapshot.branches.map((b) => [b.id, b]));
  const userMap = new Map(snapshot.users.map((u) => [u.id, u]));
  // Presence will be supplied by the WS welcome; seed a basic record for ourselves.
  const me = userMap.get(meUserId);
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
    board: snapshot.board,
    frames: frameMap,
    comments: commentMap,
    branches: branchMap,
    users: userMap,
    presence,
    dispatches: new Map(),
    mcpConnected: snapshot.mcpConnected,
    activeTestSessions: new Set(),
  });
}

export function hydrateStoreFromMock() {
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
  });
}

export interface BoardBootstrap {
  boot: BootState;
  setBoot: (s: BootState) => void;
  useOfflineDemo: () => void;
  wsRef: React.RefObject<FoldoWsClient | null>;
}

export function useBoardBootstrap(
  route: Route,
  navigate: (next: Route, opts?: { replace?: boolean }) => void,
): BoardBootstrap {
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

        hydrateStoreFromRest(snapshot, DEMO_USER_ID);

        // Open the WS
        let wasOpenOnce = false;
        const ws = new FoldoWsClient({
          boardId,
          userId: DEMO_USER_ID,
          token: DEMO_TOKEN,
          onStatusChange: (s: WsStatus) => {
            boardStore.setWsStatus(s);
            // On reconnect (already had a session), pull a fresh snapshot so
            // any frames/comments created while we were offline land in the store.
            if (s === 'open') {
              if (wasOpenOnce) {
                void getBoard(boardId!)
                  .then((fresh) => hydrateStoreFromRest(fresh, DEMO_USER_ID))
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

  return { boot, setBoot, useOfflineDemo, wsRef };
}
