// Central handling of an expired / revoked login session.
//
// When an authenticated request comes back 401, the stored token is no longer
// valid (the session was revoked — e.g. a password reset — or never valid).
// Leaving the app showing logged-in chrome over a dead token is the
// "in-between" state we explicitly want to avoid: a stored session is either
// honoured or cleared, never half-way.
//
// On the first such 401 we clear the stored credentials and bounce to /login.
// A demo identity (no stored token) is left alone — it has no session to expire.

const TOKEN_KEY = 'foldo:token';
const USER_KEY = 'foldo:user';

let handled = false;

/** True when the browser holds a real login (as opposed to the demo identity). */
export function hasStoredSession(): boolean {
  try {
    return !!localStorage.getItem(TOKEN_KEY);
  } catch {
    return false;
  }
}

/** Clear the stored login credentials. */
export function clearStoredSession(): void {
  try {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  } catch {
    /* localStorage unavailable — nothing to clear */
  }
}

/**
 * Handle a 401 from an authenticated request: clear the dead session and
 * redirect to /login (once per page load). No-op for a demo session and when
 * already on an auth page, so it can't loop.
 */
export function handleExpiredSession(): void {
  if (handled) return;
  // A demo identity has no stored token — a 401 there isn't a session to
  // expire, and bouncing a demo user to /login would be worse than the 401.
  if (!hasStoredSession()) return;
  handled = true;
  clearStoredSession();
  if (typeof window === 'undefined') return;
  const { pathname, search } = window.location;
  if (pathname === '/login' || pathname === '/signup') return;
  const next = encodeURIComponent(pathname + search);
  window.location.assign(`/login?expired=1&next=${next}`);
}
