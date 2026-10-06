import { atom } from 'nanostores';

export const menuOpen = atom(false);

// messages left today; seeded from loaders, refreshed from the X-Foldo-Remaining header on each chat response
export const quota = atom<number | undefined>(undefined);
