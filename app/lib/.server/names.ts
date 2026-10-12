import { eventMode } from './config';
import { db } from './db';

/*
 * User-chosen names (team names, project names): strip invisible format characters (zero-width joiners, bidi
 * overrides: \p{Cf}), collapse whitespace, trim, and cut to `max` code points (never half an emoji).
 */
export function cleanName(raw: unknown, max: number) {
  const name = String(raw ?? '')
    .replace(/\p{Cf}/gu, '')
    .replace(/\s+/g, ' ')
    .trim();

  return [...name].slice(0, max).join('').trim();
}

const fold = (s: string) => s.normalize('NFKC').toLocaleLowerCase('en');

/**
 * Validation for a team name (settings; sign-up can use it too): undefined when it's fine, otherwise the inline error.
 * Pass the already-cleaned name. Names are unique case-insensitively so the gallery and admin lists stay unambiguous.
 */
export function teamNameError(name: string, exceptUserId?: string): string | undefined {
  if ([...name].length < 2) {
    return 'Use at least 2 characters for the name.';
  }

  const others = db.prepare('SELECT name FROM users WHERE id != ?').all(exceptUserId ?? '') as { name: string }[];

  if (others.some((u) => u.name && fold(u.name) === fold(name))) {
    return eventMode() ? 'Another team already uses that name.' : 'Someone already uses that name.';
  }

  return undefined;
}
