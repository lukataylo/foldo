import { useLoaderData } from '@remix-run/react';
import { atom } from 'nanostores';
import { createElement } from 'react';
import type { Message } from 'ai';
import { toast } from 'react-toastify';
import { Icon } from '~/components/ui/icons';
import { activeTemplate } from '~/lib/templates/client';
import { workbenchStore } from '~/lib/stores/workbench';

export interface ChatHistoryItem {
  id: string;
  urlId?: string;
  description?: string;
  timestamp: string;
  shareId?: string | null;
  listed?: boolean;
}

export interface ProjectLoaderData {
  email?: string;
  id?: string;
  shareId?: string | null;
  listed?: boolean;
  template?: string;
  description?: string;
  messages?: Message[];
}

export const chatId = atom<string | undefined>(undefined);
export const description = atom<string | undefined>(undefined);
export const shareId = atom<string | null | undefined>(undefined);
export const listed = atom<boolean>(false);

let saving: Promise<void> = Promise.resolve();
let seeded = false;

// 'saved' | 'saving' | 'retrying' | 'failed': shown next to the project name so teams always know their work is safe
export const saveState = atom<'saved' | 'saving' | 'retrying' | 'failed'>('saved');

// when the project last reached the server (the Offline popover shows it)
export const lastSaved = atom<number | undefined>(undefined);

// "Try now" while reconnecting: skip the rest of the current wait and retry at once
let wake: (() => void) | undefined;

const cloudOff = () => createElement(Icon.CloudOff, { size: 18 });

const SAVE_FAILED = "We couldn't save just now. Your work is still on screen; keep going and it will save when we reconnect.";

// one save with retries: a server restart or a blip on venue Wi-Fi must not lose or interrupt anyone's work
async function putWithRetry(body: unknown): Promise<Response | undefined> {
  const waits = [1000, 3000, 8000, 15000];

  for (let attempt = 0; attempt <= waits.length; attempt++) {
    try {
      const res = await fetch('/api/projects', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

      if (res.status < 500) {
        return res;
      }
    } catch {
      // network error: retry
    }

    if (attempt < waits.length) {
      if (attempt === 0) {
        // say so on the first miss (the strip and header keep showing it while we retry)
        toast.error(SAVE_FAILED, { toastId: 'save-failed', icon: cloudOff });
      }

      saveState.set('retrying');
      await new Promise<void>((r) => {
        const timer = setTimeout(r, waits[attempt]);

        wake = () => {
          clearTimeout(timer);
          r();
        };
      });
      wake = undefined;
    }
  }

  return undefined;
}

/*
 * seed the stores once; shared links have no id, so the first edit by a signed-in viewer forks into a new project.
 * a fresh load of /p/:shareId compares undefined to undefined, so always seed on first use or a remix loses its template.
 * The studio calls this before its header renders (browser only: on the server these atoms are shared by every request).
 */
export function seedProjectStores(data: ProjectLoaderData) {
  /*
   * A page without an id (`/`, a share link) gets one from its first save, without a navigation; the loader data still
   * has no id then, and must not wipe the new project's stores on the next render.
   */
  if (!seeded || (data.id !== undefined && data.id !== chatId.get())) {
    seeded = true;
    chatId.set(data.id);
    description.set(data.description);
    shareId.set(data.shareId);
    listed.set(Boolean(data.listed));
    activeTemplate.set(data.template);
  }
}

export function useChatHistory() {
  const data = useLoaderData() as ProjectLoaderData;

  seedProjectStores(data);

  return {
    ready: true,
    initialMessages: data.messages ?? [],
    storeMessageHistory: storeMessages,
  };
}

// the latest conversation that has not reached the server yet ("Try now" and reconnecting save it again)
let unsaved: Message[] | undefined;

function storeMessages(messages: Message[]) {
  if (messages.length === 0) {
    return saving;
  }

  unsaved = messages;

  // serialised so the first save can't race a second one into creating two projects
  saving = saving.then(async () => {
    if (unsaved !== messages) {
      return; // a newer save is queued behind this one and carries everything
    }

    const { firstArtifact } = workbenchStore;

    if (!description.get() && firstArtifact?.title) {
      description.set(firstArtifact.title);
    }

    saveState.set('saving');
    const res = await putWithRetry({ id: chatId.get(), description: description.get(), messages, template: activeTemplate.get() });

    if (!res || !res.ok) {
      saveState.set('failed');
      toast.error(res?.status === 401 ? 'Please sign in again to save your project. Your work is still on screen.' : SAVE_FAILED, {
        toastId: res?.status === 401 ? 'save-signin' : 'save-failed',
        icon: res?.status === 401 ? undefined : cloudOff,
      });

      return;
    }

    if (unsaved === messages) {
      unsaved = undefined;
    }

    saveState.set('saved');
    lastSaved.set(Date.now());

    const { id } = (await res.json()) as { id: string };

    if (!chatId.get()) {
      chatId.set(id);

      // history.replaceState: a router navigate here re-renders <Chat /> and breaks the app (see upstream FIXME)
      window.history.replaceState({}, '', `/chat/${id}`);
    }
  });

  return saving;
}

// "Try now" (and coming back online): retry a waiting save at once, or save again after one that gave up
export function retrySaveNow() {
  if (wake) {
    wake();
  } else if (saveState.get() === 'failed' && unsaved) {
    storeMessages(unsaved);
  }
}
