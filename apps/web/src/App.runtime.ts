// Runtime helpers App.tsx and a couple of hooks share. Kept out of App.tsx
// so a hook that just needs `setDemoUserId` doesn't drag the entire canvas
// module into its import graph.
//
// Identity persistence is intentionally localStorage-only: every browser
// gets a stable demo user (default `u-you`), and the topbar "switch user"
// dropdown writes the chosen id here before reloading the page.

interface StoredUser {
  id: string;
  name?: string;
  initial?: string;
  color?: string;
  email?: string;
}

export function readStoredAuth(): { userId: string; token: string } | null {
  try {
    const token = localStorage.getItem('foldo:token');
    const userRaw = localStorage.getItem('foldo:user');
    if (!token || !userRaw) return null;
    const user = JSON.parse(userRaw) as StoredUser;
    if (!user.id) return null;
    return { userId: user.id, token };
  } catch {
    return null;
  }
}

/**
 * Demo identity picker. Defaults to `u-you` (the seeded "You" user). Open
 * multiple browsers / windows and switch to `u-anna` / `u-mateo` / `u-priya`
 * to demo multiplayer with distinct cursors. Selection persists in
 * localStorage.
 */
export function readOrCreateDemoUserId(): string {
  try {
    const KEY = 'foldo:demoUserId';
    const stored = localStorage.getItem(KEY);
    const valid = ['u-you', 'u-anna', 'u-mateo', 'u-priya'];
    if (stored && valid.includes(stored)) return stored;
    // Default to u-you so the first paint always authenticates against the seed.
    return 'u-you';
  } catch {
    return 'u-you';
  }
}

export function setDemoUserId(id: string): void {
  try {
    localStorage.setItem('foldo:demoUserId', id);
  } catch {
    /* ignore */
  }
}
