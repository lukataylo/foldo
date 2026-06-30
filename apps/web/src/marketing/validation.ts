// /* A+W1 features */ — shared client-side input validators for the
// marketing auth flows. The server is the source of truth (and matches
// these regexes — see apps/server/src/routes/auth.ts), but mirroring on
// the client avoids unnecessary round-trips and gives sub-second feedback.

/**
 * RFC-5322-ish "good enough" email check. Matches the server-side regex
 * verbatim so the two layers agree on which addresses are acceptable.
 * Not a substitute for a real deliverability check — that lives in the
 * verify-email roundtrip.
 */
export function isValidEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());
}

/**
 * Minimum password length we accept on the client. The server also
 * enforces this; this is purely a UX guard so the user gets feedback
 * before hitting submit.
 */
export const MIN_PASSWORD_LENGTH = 8;

export function isValidPassword(s: string): boolean {
  return typeof s === 'string' && s.length >= MIN_PASSWORD_LENGTH;
}
