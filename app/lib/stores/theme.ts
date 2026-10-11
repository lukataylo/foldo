import { atom } from 'nanostores';

// Paper is light only (the mocks have no dark theme); the editor and terminal still read the theme from here
export type Theme = 'light';

export const themeStore = atom<Theme>('light');
