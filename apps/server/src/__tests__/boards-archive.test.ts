// A+ W2 product gaps — board archive (soft-delete) + restore + filter.
//
// Runs against a real Postgres in process.env.DATABASE_URL (CI provides one,
// dev uses the local Foldo DB). Auto-skipped when DATABASE_URL is unset so
// the suite stays cheap to run in environments without a DB.
//
// Coverage:
//   * DELETE /api/boards/:id sets archived_at on the row
//   * archived boards drop out of the default /api/boards response
//   * ?includeArchived=true brings them back
//   * POST /api/boards/:id/restore clears archived_at and the board reappears
//   * DELETE without canEditBoard (no membership) returns 404 (not 403, to
//     avoid leaking which board ids exist — matches existing route semantics)
//   * Restore requires canEditBoard for the same reason

import { randomBytes } from 'node:crypto';
import Fastify, { type FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { closePool, initSchema, queryOne } from '../db.ts';
import { registerAuth } from '../auth.ts';
import { registerAuthRoutes } from '../routes/auth.ts';
import { registerBoardRoutes } from '../routes/boards.ts';

const HAS_DB = !!process.env.DATABASE_URL;
const d = HAS_DB ? describe : describe.skip;

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
  await registerBoardRoutes(app);
  return app;
}

async function signupViaApi(app: FastifyInstance): Promise<SignedUpUser> {
  const u = unique();
  const email = `archive-${u}@foldo.test`;
  const password = `pw-${u}-aaaaaa`;
  const name = `Archiver ${u}`;
  const res = await app.inject({
    method: 'POST',
    url: '/api/auth/signup',
    payload: { email, password, name },
  });
  expect(res.statusCode).toBe(200);
  const body = res.json() as { token: string; user: { id: string } };
  return { id: body.user.id, email, password, name, token: body.token };
}

async function createBoardViaApi(
  app: FastifyInstance,
  user: SignedUpUser,
  name: string,
): Promise<{ id: string }> {
  const stamp = unique();
  const res = await app.inject({
    method: 'POST',
    url: '/api/boards',
    headers: { Authorization: `Bearer ${user.token}` },
    payload: { name, repoSlug: `archive-test/${stamp}` },
  });
  expect(res.statusCode).toBe(201);
  const body = res.json() as { board: { id: string } };
  return { id: body.board.id };
}

d('boards: archive + restore', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    await initSchema();
    app = await buildApp();
    await app.ready();
  });

  afterAll(async () => {
    if (app) await app.close();
    await closePool();
  });

  it('DELETE archives the board, clearing it from the default list', async () => {
    const user = await signupViaApi(app);
    const board = await createBoardViaApi(app, user, 'archive-me');

    // Before: the board is in the default list (which excludes archived).
    const listBefore = await app.inject({
      method: 'GET',
      url: '/api/boards',
      headers: { Authorization: `Bearer ${user.token}` },
    });
    expect(listBefore.statusCode).toBe(200);
    const beforeBody = listBefore.json() as {
      boards: Array<{ id: string }>;
    };
    expect(beforeBody.boards.some((b) => b.id === board.id)).toBe(true);

    // Archive.
    const del = await app.inject({
      method: 'DELETE',
      url: `/api/boards/${board.id}`,
      headers: { Authorization: `Bearer ${user.token}` },
    });
    expect(del.statusCode).toBe(200);
    expect(del.json()).toMatchObject({ ok: true, archived: true });

    // The archived_at column is now stamped.
    const row = await queryOne<{ archived_at: string | null }>(
      `SELECT archived_at FROM boards WHERE id = $1`,
      [board.id],
    );
    expect(row?.archived_at).toBeTruthy();

    // Default list no longer contains the board.
    const listAfter = await app.inject({
      method: 'GET',
      url: '/api/boards',
      headers: { Authorization: `Bearer ${user.token}` },
    });
    expect(listAfter.statusCode).toBe(200);
    const afterBody = listAfter.json() as { boards: Array<{ id: string }> };
    expect(afterBody.boards.some((b) => b.id === board.id)).toBe(false);

    // includeArchived=true brings it back, with the archivedAt marker set.
    const listArchived = await app.inject({
      method: 'GET',
      url: '/api/boards?includeArchived=true',
      headers: { Authorization: `Bearer ${user.token}` },
    });
    expect(listArchived.statusCode).toBe(200);
    const archBody = listArchived.json() as {
      boards: Array<{ id: string; archivedAt?: string | null }>;
    };
    const hit = archBody.boards.find((b) => b.id === board.id);
    expect(hit).toBeTruthy();
    expect(hit?.archivedAt).toBeTruthy();
  });

  it('POST /restore clears archived_at and the board returns to the default list', async () => {
    const user = await signupViaApi(app);
    const board = await createBoardViaApi(app, user, 'restore-me');

    // Archive first.
    const del = await app.inject({
      method: 'DELETE',
      url: `/api/boards/${board.id}`,
      headers: { Authorization: `Bearer ${user.token}` },
    });
    expect(del.statusCode).toBe(200);

    // Restore.
    const restore = await app.inject({
      method: 'POST',
      url: `/api/boards/${board.id}/restore`,
      headers: { Authorization: `Bearer ${user.token}` },
    });
    expect(restore.statusCode).toBe(200);
    expect(restore.json()).toMatchObject({ ok: true, restored: true });

    const row = await queryOne<{ archived_at: string | null }>(
      `SELECT archived_at FROM boards WHERE id = $1`,
      [board.id],
    );
    expect(row?.archived_at).toBeNull();

    // Default list contains it again.
    const list = await app.inject({
      method: 'GET',
      url: '/api/boards',
      headers: { Authorization: `Bearer ${user.token}` },
    });
    expect(list.statusCode).toBe(200);
    const body = list.json() as { boards: Array<{ id: string }> };
    expect(body.boards.some((b) => b.id === board.id)).toBe(true);
  });

  it('DELETE on a board the user does not own returns 404 (no info leak)', async () => {
    const owner = await signupViaApi(app);
    const stranger = await signupViaApi(app);
    const board = await createBoardViaApi(app, owner, 'not-yours');

    const del = await app.inject({
      method: 'DELETE',
      url: `/api/boards/${board.id}`,
      headers: { Authorization: `Bearer ${stranger.token}` },
    });
    expect(del.statusCode).toBe(404);

    // Board still alive.
    const row = await queryOne<{ archived_at: string | null }>(
      `SELECT archived_at FROM boards WHERE id = $1`,
      [board.id],
    );
    expect(row?.archived_at).toBeNull();
  });

  it('Restore on a board the user does not own returns 404', async () => {
    const owner = await signupViaApi(app);
    const stranger = await signupViaApi(app);
    const board = await createBoardViaApi(app, owner, 'not-yours-restore');

    // Owner archives.
    await app.inject({
      method: 'DELETE',
      url: `/api/boards/${board.id}`,
      headers: { Authorization: `Bearer ${owner.token}` },
    });

    // Stranger tries to restore — 404 (same shape as the other no-info-leak
    // paths in this codebase).
    const restore = await app.inject({
      method: 'POST',
      url: `/api/boards/${board.id}/restore`,
      headers: { Authorization: `Bearer ${stranger.token}` },
    });
    expect(restore.statusCode).toBe(404);

    // Still archived.
    const row = await queryOne<{ archived_at: string | null }>(
      `SELECT archived_at FROM boards WHERE id = $1`,
      [board.id],
    );
    expect(row?.archived_at).toBeTruthy();
  });
});
