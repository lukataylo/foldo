import { atom } from 'nanostores';

export const menuOpen = atom(false);

// messages left today; seeded from loaders, refreshed from the X-Foldo-Remaining header on each chat response
export const quota = atom<number | undefined>(undefined);

// "Fix this error": any panel can ask the chat to send an error back to the model
export const fixRequest = atom<{ text: string; n: number } | undefined>(undefined);
export const requestFix = (text: string) => fixRequest.set({ text, n: (fixRequest.get()?.n ?? 0) + 1 });

// last uncaught error from the running preview (cleared when dismissed or the app reloads)
export const previewError = atom<string | undefined>(undefined);
