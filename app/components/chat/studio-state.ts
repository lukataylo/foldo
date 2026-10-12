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

// marks a reply the team stopped (kept in the saved messages; the model never sees annotations)
export const STOPPED = 'foldo:stopped';

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

interface PauseInfo {
  paused: boolean;
  message: string;
  since?: number | null;
}

// the organizer pause as last polled (/api/status); undefined until the first poll, then it wins over the loader's copy
const livePause = atom<PauseInfo | undefined>(undefined);

export function usePause(fromLoader?: PauseInfo) {
  return useStore(livePause) ?? fromLoader;
}

const POLL_MS = 20_000;

/*
 * A pause (or the end of one) reaches open studios within 20s, and the messages-left count stays honest. Only while the
 * tab is visible; a hidden tab catches up the moment it is shown again.
 */
export function useStatusPoll(enabled: boolean, onRemaining: (left: number) => void) {
  useEffect(() => {
    if (!enabled) {
      return undefined;
    }

    let timer: ReturnType<typeof setTimeout> | undefined;
    let stopped = false;
    let inFlight = false;

    // one tick at a time, and the next one is scheduled only here
    const tick = async () => {
      if (inFlight || stopped) {
        return;
      }

      inFlight = true;
      clearTimeout(timer);

      try {
        if (document.visibilityState === 'visible' && navigator.onLine) {
          const res = await fetch('/api/status', { cache: 'no-store' });

          if (res.ok) {
            const s = (await res.json()) as PauseInfo & { remaining: number };

            livePause.set({ paused: s.paused, message: s.message, since: s.since });
            onRemaining(s.remaining);
          }
        }
      } catch {
        // offline or a server restart: the next tick tries again
      } finally {
        inFlight = false;

        if (!stopped) {
          timer = setTimeout(tick, POLL_MS);
        }
      }
    };

    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        void tick();
      }
    };

    timer = setTimeout(tick, POLL_MS);
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      stopped = true;
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [enabled]);
}
