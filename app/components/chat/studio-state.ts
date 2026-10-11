import { useStore } from '@nanostores/react';
import { atom } from 'nanostores';
import { useEffect } from 'react';
import { chatStore } from '~/lib/stores/chat';
import { workbenchStore } from '~/lib/stores/workbench';

/*
 * Small pieces of studio UI state shared by the header, chat column and workbench.
 */

export type LayoutMode = 'chat' | 'both' | 'workspace';

// the Layout radiogroup maps onto the two existing switches (chat visible, workbench visible)
export function useLayout(): LayoutMode {
  const { showChat } = useStore(chatStore);
  const showWorkbench = useStore(workbenchStore.showWorkbench);

  if (!showWorkbench) {
    return 'chat';
  }

  return showChat ? 'both' : 'workspace';
}

export function setLayout(mode: LayoutMode) {
  chatStore.setKey('showChat', mode !== 'workspace');
  workbenchStore.showWorkbench.set(mode !== 'chat');
}

// the assistant message whose build hit an error and is being fixed automatically (the info banner sits under it)
export const autoFixAfter = atom<string | undefined>(undefined);

// Foldo is answering right now (the step log tells "writing…" from "not started" with it)
export const streamingNow = atom(false);

// a cut-off card is on screen: its Continue is the screen's yellow action, so Share steps back
export const cutOffShown = atom(false);

// a "Fix this error" message is being answered right now ("Foldo is already fixing this")
export const fixInFlight = atom(false);

// browser connectivity: the Offline board (strip, disabled Send) follows it
export const online = atom(true);

let listening = false;

export function useOnline() {
  useEffect(() => {
    if (listening) {
      return;
    }

    listening = true;
    online.set(navigator.onLine);
    window.addEventListener('online', () => online.set(true));
    window.addEventListener('offline', () => online.set(false));
  }, []);

  return useStore(online);
}

export const clock = (t: number) =>
  new Date(t).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }).replace(/\s?([AP])M$/, (_, x) => ` ${x.toLowerCase()}m`);
