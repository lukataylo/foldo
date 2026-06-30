// Step 7 — GDPR data-export + account-delete routes.
//
// Runs against a real Postgres in `process.env.DATABASE_URL` (CI provides one,
// dev uses the local Foldo DB). The lazy pool in db.ts means we only attempt
// to connect when a route actually issues SQL — so the suite is auto-skipped
// in environments without a DB without polluting the rest of the file.
//
// Coverage pinned by this file:
//   * export response shape (profile + own comment, NEVER another user's row)
//   * export never leaks the password_hash
//   * delete clears password + email and frees the unique-email index
//   * delete returns 401 when the current password is wrong
//   * post-delete login attempt 401s (the row no longer has an email or hash)
//   * comments authored by the deleted user re-point at the `u-deleted` sentinel

import { randomBytes } from 'node:crypto';
import Fastify, { type FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { closePool, exec, initSchema, queryOne } from '../db.ts';
import { registerAuth } from '../auth.ts';
import { registerAuthRoutes } from '../routes/auth.ts';
import { registerMeRoutes } from '../routes/me.ts';
import { registerCommentRoutes } from '../routes/comments.ts';
import { registerBoardRoutes } from '../routes/boards.ts';
import { registerFrameRoutes } from '../routes/frames.ts';
import { DELETED_USER_ID, getUserEmailHash } from '../repo/users.ts';
import { addBoardMember } from '../repo/members.ts';
import { upsertBoard } from '../repo/boards.ts';
import { upsertBranch, upsertCommit } from '../repo/branches.ts';
import { insertFrame } from '../repo/frames.ts';
import { addReply, insertComment } from '../repo/comments.ts';
import { nowIso } from '../util.ts';

const HAS_DB = !!process.env.DATABASE_URL;
const d = HAS_DB ? describe : describe.skip;

// ----- helpers -------------------------------------------------------------

interface SignedUpUser {
  id: string;
  email: string;
  password: string;
  name: string;
  token: string;
}

function unique(): string {
  return Date.now().toString(36) + randomBytes(3).toString('hex');
}

async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  // Mirror the error handler the production index.ts installs so 401s thrown
  // by requireUser surface as JSON status codes the tests can assert on.
  app.setErrorHandler((err, _req, reply) => {
    const status = (err as { statusCode?: number }).statusCode ?? 500;
    const message = err instanceof Error ? err.message : 'Internal error';
    reply.code(status).send({
      error: message,
      code: status === 401 ? 'UNAUTHORIZED' : 'INTERNAL',
    });
  });
  await registerAuth(app);
  await registerAuthRoutes(app);
  await registerMeRoutes(app);
  await registerCommentRoutes(app);
  await registerBoardRoutes(app);
  await registerFrameRoutes(app);
  return app;
}

async function signupViaApi(app: FastifyInstance): Promise<SignedUpUser> {
  const u = unique();
  const email = `me-export-${u}@foldo.test`;
  const password = `pw-${u}-aaaaaa`;
  const name = `Tester ${u}`;
  const res = await app.inject({
    method: 'POST',
    url: '/api/auth/signup',
    payload: { email, password, name },
  });
  expect(res.statusCode).toBe(200);
  const body = res.json() as { token: string; user: { id: string } };
  return { id: body.user.id, email, password, name, token: body.token };
}

async function seedBoardWithCommentBy(
  user: SignedUpUser,
  text: string,
): Promise<{ boardId: string; frameId: string; commentId: string }> {
  const stamp = unique();
  const boardId = `board-me-${stamp}`;
  const branchId = `br-me-${stamp}`;
  const frameId = `f-me-${stamp}`;
  const commentId = `c-me-${stamp}`;
  const commitSha = `sha-${stamp}`;
  await upsertBoard({
    id: boardId,
    name: `Test board ${stamp}`,
    repoSlug: `test/${stamp}`,
    createdAt: nowIso(),
  });
  await addBoardMember(boardId, user.id, 'owner');
  await upsertBranch({
    id: branchId,
    boardId,
    name: 'main',
    authoredBy: 'human',
    authorUserId: user.id,
    color: '#5db0ff',
    headSha: commitSha,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  });
  await upsertCommit({
    sha: commitSha,
    branchId,
    message: 'seed',
    authorUserId: user.id,
    createdAt: nowIso(),
  });
  await insertFrame({
    id: frameId,
    boardId,
    kind: 'markdown',
    branchId,
    commitSha,
    commitMessage: 'seed',
    age: '0s',
    position: { x: 0, y: 0 },
    size: { width: 400, height: 200 },
    content: {
      kind: 'markdown',
      docPath: 'README.md',
      title: 'README.md',
      body: '# hi',
    },
    createdAt: nowIso(),
    updatedAt: nowIso(),
  });
  await insertComment({
    id: commentId,
    boardId,
    frameId,
    authorUserId: user.id,
    text,
  });
  return { boardId, frameId, commentId };
}

// ----- suite ---------------------------------------------------------------

d('me-export-delete routes', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    await initSchema();
    app = await buildApp();
    await app.ready();
  });

  beforeEach(async () => {
    // Stale `u-deleted` rows from a previous run would mask test failures, so
    // wipe it between tests; ensureDeletedSentinelUser() re-creates as needed.
    await exec(`DELETE FROM users WHERE id = $1`, [DELETED_USER_ID]);
  });

  afterAll(async () => {
    if (app) await app.close();
    await closePool();
  });

  it('export returns the requester\'s comment but never another user\'s row', async () => {
    const alice = await signupViaApi(app);
    const bob = await signupViaApi(app);

    const aliceText = `alice-comment-${unique()}`;
    const bobText = `bob-comment-${unique()}`;
    const aliceBoard = await seedBoardWithCommentBy(alice, aliceText);
    // Drop a comment by Bob on Alice's board (add Bob as a member first so
    // there's a realistic same-board collision to test the author filter).
    await addBoardMember(aliceBoard.boardId, bob.id, 'editor');
    await insertComment({
      id: `c-bob-${unique()}`,
      boardId: aliceBoard.boardId,
      frameId: aliceBoard.frameId,
      authorUserId: bob.id,
      text: bobText,
    });

    const res = await app.inject({
      method: 'POST',
      url: '/api/me/export',
      headers: { Authorization: `Bearer ${alice.token}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      profile: { id: string; email: string; name: string };
      comments: Array<{ text: string; authorUserId: string }>;
      boards: Array<{ id: string }>;
      format: string;
    };
    expect(body.format).toBe('foldo-export@1');
    expect(body.profile.id).toBe(alice.id);
    expect(body.profile.email).toBe(alice.email);

    const texts = body.comments.map((c) => c.text);
    expect(texts).toContain(aliceText);
    expect(texts).not.toContain(bobText);
    for (const c of body.comments) {
      expect(c.authorUserId).toBe(alice.id);
    }

    // Boards Alice owns include the seeded one.
    expect(body.boards.some((b) => b.id === aliceBoard.boardId)).toBe(true);

    // Defense-in-depth: nothing in the export should look like a stored hash.
    const flattened = JSON.stringify(body);
    expect(flattened).not.toMatch(/password_hash/);
    expect(flattened).not.toMatch(/scrypt:/);
  });

  it('delete with wrong password returns 401 and leaves the account intact', async () => {
    const user = await signupViaApi(app);
    const res = await app.inject({
      method: 'POST',
      url: '/api/me/delete',
      headers: { Authorization: `Bearer ${user.token}` },
      payload: { currentPassword: 'definitely-wrong-' + unique() },
    });
    expect(res.statusCode).toBe(401);

    // Account still works: login still succeeds.
    const login = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: user.email, password: user.password },
    });
    expect(login.statusCode).toBe(200);
  });

  it('delete with the correct password wipes email + password and anonymises comments', async () => {
    const user = await signupViaApi(app);
    const text = `survive-after-delete-${unique()}`;
    const seeded = await seedBoardWithCommentBy(user, text);

    const res = await app.inject({
      method: 'POST',
      url: '/api/me/delete',
      headers: { Authorization: `Bearer ${user.token}` },
      payload: { currentPassword: user.password },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });

    // The user row is anonymised: email + password_hash are null, name is the
    // sentinel, and email_hash is a 64-char hex sha256.
    const row = await queryOne<{
      email: string | null;
      password_hash: string | null;
      name: string;
    }>(
      `SELECT email, password_hash, name FROM users WHERE id = $1`,
      [user.id],
    );
    expect(row?.email).toBeNull();
    expect(row?.password_hash).toBeNull();
    expect(row?.name).toBe('deleted user');
    const hash = await getUserEmailHash(user.id);
    expect(hash).toMatch(/^[a-f0-9]{64}$/);

    // The comment row survives but its author is now the deleted-user sentinel.
    const cmt = await queryOne<{ author_user_id: string; text: string }>(
      `SELECT author_user_id, text FROM comments WHERE id = $1`,
      [seeded.commentId],
    );
    expect(cmt?.text).toBe(text);
    expect(cmt?.author_user_id).toBe(DELETED_USER_ID);

    // Login attempts with the old credentials are rejected.
    const login = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: user.email, password: user.password },
    });
    expect(login.statusCode).toBe(401);

    // The previously-issued session token is dead — every session row was
    // dropped in the delete.
    const after = await app.inject({
      method: 'GET',
      url: '/api/auth/sessions',
      headers: { Authorization: `Bearer ${user.token}` },
    });
    expect(after.statusCode).toBe(401);

    // The freed email is re-usable for a fresh signup — proves the unique
    // index is no longer holding the original lower(email) entry.
    const fresh = await app.inject({
      method: 'POST',
      url: '/api/auth/signup',
      payload: {
        email: user.email,
        password: user.password,
        name: 'Reborn',
      },
    });
    expect(fresh.statusCode).toBe(200);
  });

  it('delete is rejected for an account with no password on file', async () => {
    // Mint a passwordless user directly (matches the demo / agent shape).
    const id = `u-nopw-${unique()}`;
    await exec(
      `INSERT INTO users (id, name, initial, color, email, kind, created_at)
       VALUES ($1, 'Nopw', 'N', '#999', NULL, 'human', $2)`,
      [id, nowIso()],
    );
    // Forge a session row so requireUser accepts the bearer.
    const token = `sk_nopw_${unique()}`;
    await exec(
      `INSERT INTO sessions (token, user_id, kind) VALUES ($1, $2, 'browser')`,
      [token, id],
    );

    const res = await app.inject({
      method: 'POST',
      url: '/api/me/delete',
      headers: { Authorization: `Bearer ${token}` },
      payload: { currentPassword: 'anything' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ code: 'NO_PASSWORD' });

    // Cleanup
    await exec(`DELETE FROM sessions WHERE user_id = $1`, [id]);
    await exec(`DELETE FROM users WHERE id = $1`, [id]);
  });

  it('delete anonymises nested replies authored by the deleted user', async () => {
    // Two users on one board: alice owns a comment, bob replies to it. After
    // bob deletes his account, bob's reply on alice's comment must lose its
    // identity (authorUserId / authorName / authorColor) — otherwise an
    // exported board still leaks bob's name forever.
    const alice = await signupViaApi(app);
    const bob = await signupViaApi(app);
    const seeded = await seedBoardWithCommentBy(alice, `parent-${unique()}`);
    await addBoardMember(seeded.boardId, bob.id, 'editor');
    // Bob replies on alice's comment.
    const bobReplyId = `cr-bob-${unique()}`;
    await addReply(seeded.commentId, {
      id: bobReplyId,
      authorUserId: bob.id,
      authorName: bob.name,
      authorInitial: bob.name[0] ?? 'B',
      authorColor: '#ff00aa',
      text: `bob-reply-${unique()}`,
      createdAt: nowIso(),
    });

    // Bob deletes his account.
    const res = await app.inject({
      method: 'POST',
      url: '/api/me/delete',
      headers: { Authorization: `Bearer ${bob.token}` },
      payload: { currentPassword: bob.password },
    });
    expect(res.statusCode).toBe(200);

    // The reply row survives but its identity fields are the sentinel's.
    const row = await queryOne<{ replies_json: Array<{
      id: string;
      authorUserId: string;
      authorName: string;
      authorColor: string;
      text: string;
    }> }>(
      `SELECT replies_json FROM comments WHERE id = $1`,
      [seeded.commentId],
    );
    expect(row).not.toBeNull();
    const reply = row!.replies_json.find((r) => r.id === bobReplyId);
    expect(reply).toBeDefined();
    expect(reply!.authorUserId).toBe(DELETED_USER_ID);
    expect(reply!.authorName).toBe('deleted user');
    expect(reply!.authorColor).toBe('#999');
    // Text + id are preserved so thread continuity reads correctly.
    expect(reply!.text).toMatch(/^bob-reply-/);
  });

  it('export rejects unauthenticated requests', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/me/export' });
    expect(res.statusCode).toBe(401);
  });

  it('delete rejects unauthenticated requests', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/me/delete',
      payload: { currentPassword: 'x' },
    });
    expect(res.statusCode).toBe(401);
  });
});
