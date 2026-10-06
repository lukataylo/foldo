import { useLoaderData } from '@remix-run/react';
import { atom } from 'nanostores';
import type { Message } from 'ai';
import { toast } from 'react-toastify';
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
  description?: string;
  messages?: Message[];
}

export const chatId = atom<string | undefined>(undefined);
export const description = atom<string | undefined>(undefined);
export const shareId = atom<string | null | undefined>(undefined);
export const listed = atom<boolean>(false);

let saving: Promise<void> = Promise.resolve();

export function useChatHistory() {
  const data = useLoaderData() as ProjectLoaderData;

  // seed the stores once; shared links have no id, so the first edit by a signed-in viewer forks into a new project
  if (data.id !== chatId.get()) {
    chatId.set(data.id);
    description.set(data.description);
    shareId.set(data.shareId);
    listed.set(Boolean(data.listed));
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

        const res = await fetch('/api/projects', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: chatId.get(), description: description.get(), messages }),
        });

        if (!res.ok) {
          toast.error(res.status === 401 ? 'Sign in to save your project' : 'Failed to save project');
          return;
        }

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
