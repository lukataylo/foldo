// Test data factory for new Playwright specs. The pattern:
//
//   const u = await createUser();                    // unique email+pwd
//   const ctx = await loginAs(page, u);              // browser is now authed
//   const board = await createBoard(u, 'My board');  // server-side via API
//
// Every spec creates the data it needs and cleans up at the end (or relies
// on the test DB being isolated). No spec reuses fixtures from another spec
// — keeps failure modes localised.
//
// All helpers hit the server REST API directly when arranging state so a
// spec doesn't have to drive the UI through 5 unrelated forms just to get
// to the screen it's testing.

import type { BrowserContext, Page } from '@playwright/test';

const API = process.env.FOLDO_API ?? 'http://localhost:4000';
const WEB = process.env.FOLDO_WEB ?? 'http://localhost:5173';

export interface TestUser {
  id: string;
  email: string;
  password: string;
  name: string;
  /** Cryptographically random bearer token returned by signup/login. */
  token: string;
}

/**
 * Create a fresh, isolated user with a unique email. Returns the live
 * session token from the signup call — no second login round-trip needed.
 */
export async function createUser(opts?: {
  password?: string;
  name?: string;
}): Promise<TestUser> {
  const stamp = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const email = `e2e-${stamp}@foldo.test`;
  const password = opts?.password ?? `e2e-pw-${stamp}`;
  const name = opts?.name ?? `E2E ${stamp}`;
  const res = await fetch(`${API}/api/auth/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, name }),
  });
  if (!res.ok) {
    throw new Error(`createUser ${res.status}: ${await res.text()}`);
  }
  const json = (await res.json()) as {
    token: string;
    user: { id: string };
  };
  return { id: json.user.id, email, password, name, token: json.token };
}

/**
 * Trade a (email, password) for a fresh session token via the login endpoint.
 * Used by specs that need to assert login behaviour itself (Step 1
 * password reset, Step 2 email verification).
 */
export async function loginViaApi(
  email: string,
  password: string,
): Promise<{ token: string; user: { id: string } }> {
  const res = await fetch(`${API}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    throw new Error(`loginViaApi ${res.status}: ${await res.text()}`);
  }
  return (await res.json()) as { token: string; user: { id: string } };
}

/**
 * Inject the auth token into the browser context's localStorage so the
 * web app comes up authenticated on first paint. Mirrors the way the
 * marketing/login flow persists auth (foldo:token / foldo:user).
 */
export async function loginAs(page: Page, user: TestUser): Promise<void> {
  await page.goto(WEB + '/');
  await page.evaluate(
    ([token, userJson]) => {
      localStorage.setItem('foldo:token', token);
      localStorage.setItem('foldo:user', userJson);
    },
    [
      user.token,
      JSON.stringify({
        id: user.id,
        name: user.name,
        initial: user.name[0]?.toUpperCase() ?? '?',
        color: '#7fd49a',
        email: user.email,
        kind: 'human',
      }),
    ] as const,
  );
}

/**
 * Convenience: bind the user's bearer to every API request from a given
 * BrowserContext. Lets a spec hit our REST API from a request fixture
 * without manually setting the Authorization header each time.
 */
export async function authedContext(
  ctx: BrowserContext,
  user: TestUser,
): Promise<void> {
  await ctx.setExtraHTTPHeaders({ Authorization: `Bearer ${user.token}` });
}

export interface CreatedBoard {
  id: string;
  name: string;
}

export async function createBoard(
  user: TestUser,
  name: string,
): Promise<CreatedBoard> {
  const res = await fetch(`${API}/api/boards`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${user.token}`,
    },
    body: JSON.stringify({ name, repoSlug: `e2e/${slug(name)}` }),
  });
  if (!res.ok) {
    throw new Error(`createBoard ${res.status}: ${await res.text()}`);
  }
  const json = (await res.json()) as { board: { id: string; name: string } };
  return { id: json.board.id, name: json.board.name };
}

function slug(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}
