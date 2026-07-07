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
import { deleteEmail, extractLink, waitForEmail } from './email-outbox';

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
  /**
   * Auto-verify the user's email by consuming the verification token from
   * the stub email outbox. Defaults to `true` because most specs don't
   * care about verification gating and email-gated routes (share mint,
   * test publish) reject unverified users with a 403. Set `false` only
   * in specs that exercise the verification flow itself
   * (e2e/auth/email-verification.spec.ts).
   */
  verified?: boolean;
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
  const user: TestUser = {
    id: json.user.id,
    email,
    password,
    name,
    token: json.token,
  };
  if (opts?.verified !== false) {
    await autoVerifyEmail(email);
  }
  return user;
}

/**
 * Consume the most recent email-verification token for the given address
 * from the stub email outbox + POST it to /api/auth/verify-email. Used by
 * createUser() when `verified: true` (the default) so downstream specs
 * can mint share links / publish tests without tripping the email gate.
 */
async function autoVerifyEmail(email: string): Promise<void> {
  // Static import above: playwright's transpiler doesn't rewrite dynamic
  // extensionless imports (broke under 1.60), and importing the module is
  // side-effect-free until a helper is actually called.
  const msg = await waitForEmail(
    { kind: 'email-verification', to: email },
    { timeoutMs: 5_000 },
  );
  const link = extractLink(msg, '/verify?');
  // The link includes the SPA's origin; we want to call the API directly.
  const tokenMatch = /[?&]token=([^&]+)/.exec(link);
  if (!tokenMatch) throw new Error(`No token query param in verify link: ${link}`);
  const token = decodeURIComponent(tokenMatch[1]!);
  const res = await fetch(`${API}/api/auth/verify-email`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token }),
  });
  if (!res.ok) {
    throw new Error(`autoVerifyEmail ${res.status}: ${await res.text()}`);
  }
  await deleteEmail(msg);
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

/**
 * Fetch a board's full payload (frames + comments). Returns the parsed JSON
 * the canvas would load — useful for asserting cleanup after a destructive
 * action without driving the UI.
 */
export async function fetchBoardDetail(
  user: TestUser,
  boardId: string,
): Promise<{
  frames: Array<{ id: string; kind: string }>;
  comments: Array<{ id: string; text: string; authorName: string; authorUserId: string }>;
}> {
  const res = await fetch(`${API}/api/boards/${encodeURIComponent(boardId)}`, {
    headers: { Authorization: `Bearer ${user.token}` },
  });
  if (!res.ok) {
    throw new Error(`fetchBoardDetail ${res.status}: ${await res.text()}`);
  }
  return (await res.json()) as {
    frames: Array<{ id: string; kind: string }>;
    comments: Array<{
      id: string;
      text: string;
      authorName: string;
      authorUserId: string;
    }>;
  };
}

export interface CreatedMarkdownFrame {
  id: string;
  boardId: string;
  branchId: string;
  docPath: string;
  body: string;
}

/**
 * Create a markdown-kind frame on `boardId` for the given user. The new
 * board's seeded `main` branch (id `${boardId}:main`) is the default branch
 * the frame is attached to — callers can override via `branchId` if they
 * want to test multi-branch behaviour.
 *
 * Used by the Step 5.5 markdown-save-roundtrip spec to arrange a frame
 * without depending on the seeded demo board's frame staying put.
 */
export async function createMarkdownFrame(
  user: TestUser,
  boardId: string,
  opts: {
    body: string;
    docPath?: string;
    title?: string;
    branchId?: string;
  },
): Promise<CreatedMarkdownFrame> {
  const stamp = Date.now().toString(36) + Math.random().toString(36).slice(2, 4);
  const docPath = opts.docPath ?? `docs/e2e/${stamp}.md`;
  const title = opts.title ?? docPath.split('/').pop() ?? 'doc.md';
  const branchId = opts.branchId ?? `${boardId}:main`;
  const res = await fetch(`${API}/api/frames`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${user.token}`,
    },
    body: JSON.stringify({
      boardId,
      branchId,
      // Branch's seeded headSha is '0000000'; frames table doesn't FK on
      // commit_sha so any string works for an isolated test fixture.
      commitSha: '0000000',
      commitMessage: 'e2e: seed markdown frame',
      kind: 'markdown',
      position: { x: 200, y: 200 },
      size: { width: 520, height: 400 },
      content: {
        kind: 'markdown',
        docPath,
        title,
        body: opts.body,
      },
    }),
  });
  if (!res.ok) {
    throw new Error(`createMarkdownFrame ${res.status}: ${await res.text()}`);
  }
  const frame = (await res.json()) as { id: string };
  return { id: frame.id, boardId, branchId, docPath, body: opts.body };
}

/**
 * Drop a comment on `frameId` (board `boardId`) as `user`. Returns the
 * comment id so specs can assert on it later.
 */
export async function createComment(
  user: TestUser,
  boardId: string,
  frameId: string,
  text: string,
): Promise<{ id: string }> {
  const res = await fetch(`${API}/api/comments`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${user.token}`,
    },
    body: JSON.stringify({ boardId, frameId, text }),
  });
  if (!res.ok) {
    throw new Error(`createComment ${res.status}: ${await res.text()}`);
  }
  const json = (await res.json()) as { id: string };
  return { id: json.id };
}

/**
 * Append a reply to an existing comment as `user`. Returns the reply id —
 * the server-side broadcast (`comment.reply.added`) is what cross-tab
 * specs assert on.
 */
export async function replyToComment(
  user: TestUser,
  commentId: string,
  text: string,
): Promise<{ id: string }> {
  const res = await fetch(
    `${API}/api/comments/${encodeURIComponent(commentId)}/replies`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${user.token}`,
      },
      body: JSON.stringify({ text }),
    },
  );
  if (!res.ok) {
    throw new Error(`replyToComment ${res.status}: ${await res.text()}`);
  }
  const json = (await res.json()) as { id: string };
  return { id: json.id };
}
