import { useLoaderData } from '@remix-run/react';
import { atom } from 'nanostores';
import type { Message } from 'ai';
import { toast } from 'react-toastify';
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

// 'saved' | 'saving' | 'retrying' | 'failed': shown next to the project name so teams always know their work is safe
export const saveState = atom<'saved' | 'saving' | 'retrying' | 'failed'>('saved');

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
      saveState.set('retrying');
      await new Promise((r) => setTimeout(r, waits[attempt]));
    }
  }

  return undefined;
}

export function useChatHistory() {
  const data = useLoaderData() as ProjectLoaderData;

  // seed the stores once; shared links have no id, so the first edit by a signed-in viewer forks into a new project
  if (data.id !== chatId.get()) {
    chatId.set(data.id);
    description.set(data.description);
    shareId.set(data.shareId);
    listed.set(Boolean(data.listed));
    activeTemplate.set(data.template);
  }

  return {
    ready: true,
    initialMessages: data.messages ?? [],
    storeMessageHistory: (messages: Message[]) => {
      if (messages.length === 0) {
        return saving;
      }

      // serialised so the first save can't race a second one into creating two projects
      saving = saving.then(async () => {
        const { firstArtifact } = workbenchStore;

        if (!description.get() && firstArtifact?.title) {
          description.set(firstArtifact.title);
        }

        saveState.set('saving');
        const res = await putWithRetry({ id: chatId.get(), description: description.get(), messages, template: activeTemplate.get() });

        if (!res || !res.ok) {
          saveState.set('failed');
          toast.error(
            res?.status === 401
              ? 'Please sign in again to save your project. Your work is still on screen.'
              : "We couldn't save just now. Your work is still on screen; keep going and it will save when we reconnect.",
          );

          return;
        }

        saveState.set('saved');

        const { id } = (await res.json()) as { id: string };

        if (!chatId.get()) {
          chatId.set(id);

          // history.replaceState: a router navigate here re-renders <Chat /> and breaks the app (see upstream FIXME)
          window.history.replaceState({}, '', `/chat/${id}`);
        }
      });

      return saving;
    },
  };
}
