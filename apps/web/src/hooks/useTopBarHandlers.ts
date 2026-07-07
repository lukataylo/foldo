// Stable handler bundle for the TopBar component. These are the inline
// arrow-functions App.tsx used to pass straight into <TopBar>; hoisting
// them into a hook gives them stable identities (so TopBar's eventual
// React.memo wraps land cleanly) and lets App's render tree breathe.

import { useCallback, useState } from 'react';
import { setDemoUserId } from '../App.runtime';

export interface TopBarHandlersApi {
  /** TopBar's onSwitchUser: persists choice + reloads to re-handshake the WS. */
  onSwitchUser: (uid: string) => void;
  /** Walkthroughs ("Docs") modal — open state lives here so App.tsx stays thin. */
  docsOpen: boolean;
  onOpenDocs: () => void;
  onCloseDocs: () => void;
}

export function useTopBarHandlers(): TopBarHandlersApi {
  const [docsOpen, setDocsOpen] = useState(false);

  const onSwitchUser = useCallback((uid: string): void => {
    setDemoUserId(uid);
    // Reload so the new identity propagates to bearer + WS handshake.
    window.location.reload();
  }, []);

  const onOpenDocs = useCallback((): void => setDocsOpen(true), []);
  const onCloseDocs = useCallback((): void => setDocsOpen(false), []);

  return { onSwitchUser, docsOpen, onOpenDocs, onCloseDocs };
}
