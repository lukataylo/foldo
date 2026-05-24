// Stable handler bundle for the TopBar component. These are the inline
// arrow-functions App.tsx used to pass straight into <TopBar>; hoisting
// them into a hook gives them stable identities (so TopBar's eventual
// React.memo wraps land cleanly) and lets App's render tree breathe.
//
// Boundary: doesn't subscribe to the store. Takes setters + the WS ref
// from the caller, then closes over them in useCallbacks. Owns the
// follow-target id state (which only TopBar reads) and the open/close
// flags for the capture + tests modals; App used to scatter those across
// three useState hooks at the top of the render tree.

import { useCallback, useState } from 'react';
import type { UserId } from '@foldo/protocol';
import type { FoldoWsClient } from '../api/ws';
import { setDemoUserId } from '../App.runtime';

export interface TopBarHandlersOptions {
  /** WS client ref (held by useCanvasBoot). Null before boot completes. */
  wsRef: React.MutableRefObject<FoldoWsClient | null>;
}

export interface TopBarHandlersApi {
  /** Currently-followed user id (`follow.start` / `follow.stop` payload). */
  followingUserId: UserId | null;
  /** Capture modal open flag — TopBar's "Capture" button drives this. */
  captureOpen: boolean;
  setCaptureOpen: (v: boolean) => void;
  /** Tests panel open flag — TopBar's "Tests" button drives this. */
  testsOpen: boolean;
  setTestsOpen: (v: boolean) => void;
  /** TopBar's onFollow: toggles the follow target + WS `follow.*` messages. */
  onFollow: (uid: UserId | null) => void;
  /** TopBar's onSwitchUser: persists choice + reloads to re-handshake the WS. */
  onSwitchUser: (uid: string) => void;
  /** Open the capture modal — bound to TopBar's Capture button. */
  onCapture: () => void;
  /** Open the tests panel — bound to TopBar's Tests button. */
  onOpenTests: () => void;
}

export function useTopBarHandlers({
  wsRef,
}: TopBarHandlersOptions): TopBarHandlersApi {
  const [followingUserId, setFollowingUserId] = useState<UserId | null>(null);
  const [captureOpen, setCaptureOpen] = useState(false);
  const [testsOpen, setTestsOpen] = useState(false);

  const onFollow = useCallback(
    (uid: UserId | null): void => {
      setFollowingUserId(uid);
      const ws = wsRef.current;
      if (!ws) return;
      if (uid) ws.send({ type: 'follow.start', targetUserId: uid });
      else ws.send({ type: 'follow.stop' });
    },
    [wsRef],
  );

  const onSwitchUser = useCallback((uid: string): void => {
    setDemoUserId(uid);
    // Reload so the new identity propagates to bearer + WS handshake.
    window.location.reload();
  }, []);

  const onCapture = useCallback((): void => setCaptureOpen(true), []);
  const onOpenTests = useCallback((): void => setTestsOpen(true), []);

  return {
    followingUserId,
    captureOpen,
    setCaptureOpen,
    testsOpen,
    setTestsOpen,
    onFollow,
    onSwitchUser,
    onCapture,
    onOpenTests,
  };
}
