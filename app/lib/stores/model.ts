import { atom } from 'nanostores';

// the model the user picked in the prompt box; server validates it against the enabled providers
export const selectedModel = atom<string | undefined>(undefined);
