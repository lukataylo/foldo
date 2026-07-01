import type { FastifyInstance } from 'fastify';
import type {
  Board,
  Branch,
  Frame,
  GetBoardResponse,
  ListBoardsResponse,
  ListBranchesResponse,
  MeResponse,
  PaginatedResponse,
} from '@foldo/protocol';
import { requireUser } from '../auth.ts';
import {
  archiveBoard,
  getBoardById,
  getBoardByRepoSlug,
  listBoardsForUser,
  restoreBoard,
  upsertBoard,
} from '../repo/boards.ts';
import {
  getBranchById,
  listBranchesForBoard,
  upsertBranch,
  upsertCommit,
} from '../repo/branches.ts';
import { listFramesForBoard, listFramesForBoardPage } from '../repo/frames.ts';
import { listCommentsForBoard } from '../repo/comments.ts';
import { listUsersForBoard } from '../repo/users.ts';
import { addBoardMember, canEditBoard, isMember } from '../repo/members.ts';
import { hub } from '../ws/hub.ts';
import { isMcpConnected } from '../ws/mcp.ts';
import { newCommitSha, newId, nowIso } from '../util.ts';

interface CreateBoardBody {
  name?: string;
  repoSlug?: string;
  devUrl?: string;
}

export async function registerBoardRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/me', async (req, reply) => {
    const user = requireUser(req);
    const token = (req.headers.authorization ?? '').replace(/^Bearer\s+/i, '');
    return reply.send({ user, token } satisfies MeResponse);
  });

  app.get<{ Querystring: { includeArchived?: string } }>(
    '/api/boards',
    async (req, reply) => {
      const me = requireUser(req);
      // ?includeArchived=true flips the soft-delete filter so the home
      // grid's "Show archived" toggle can list everything the user used to
      // see.
      const includeArchived = req.query.includeArchived === 'true';
      return reply.send({
        boards: await listBoardsForUser(me.id, { includeArchived }),
      } satisfies ListBoardsResponse);
    },
  );

  app.get<{ Params: { id: string } }>('/api/boards/:id', async (req, reply) => {
    const me = requireUser(req);
    if (!(await isMember(req.params.id, me.id))) {
      return reply.code(404).send({ error: 'Board not found', code: 'NOT_FOUND' });
    }
    const board = await getBoardById(req.params.id);
    if (!board) return reply.code(404).send({ error: 'Board not found', code: 'NOT_FOUND' });
    const [branches, frames, comments, users] = await Promise.all([
      listBranchesForBoard(board.id),
      listFramesForBoard(board.id),
      listCommentsForBoard(board.id),
      listUsersForBoard(board.id),
    ]);
    return reply.send({
      board,
      branches,
      frames,
      comments,
      users,
      mcpConnected: isMcpConnected(board.id),
    } satisfies GetBoardResponse);
  });

  // Keyset-paginated frames list. Use this in place of the all-in-one
  // GET /api/boards/:id for any board large enough to feel sluggish — the
  // monolithic endpoint still works for back-compat but loads all frames in
  // one shot.
  //
  //   /api/boards/:id/frames                              first page
  //   /api/boards/:id/frames?limit=200                    larger page
  //   /api/boards/:id/frames?cursor=<opaque>              next page
  app.get<{
    Params: { id: string };
    Querystring: { limit?: string; cursor?: string };
  }>('/api/boards/:id/frames', async (req, reply) => {
    const me = requireUser(req);
    if (!(await isMember(req.params.id, me.id))) {
      return reply.code(404).send({ error: 'Board not found', code: 'NOT_FOUND' });
    }
    const limitRaw = req.query.limit ? Number(req.query.limit) : undefined;
    const limit =
      Number.isFinite(limitRaw) && limitRaw && limitRaw > 0 ? limitRaw : undefined;
    const page = await listFramesForBoardPage(req.params.id, {
      limit,
      cursor: req.query.cursor,
    });
    const response: PaginatedResponse<Frame> = {
      items: page.items,
      hasMore: page.hasMore,
      cursor: page.cursor,
    };
    return reply.send(response);
  });

  app.get<{ Params: { id: string } }>('/api/boards/:id/branches', async (req, reply) => {
    const me = requireUser(req);
    if (!(await isMember(req.params.id, me.id))) {
      return reply.code(404).send({ error: 'Board not found', code: 'NOT_FOUND' });
    }
    const board = await getBoardById(req.params.id);
    if (!board) return reply.code(404).send({ error: 'Board not found', code: 'NOT_FOUND' });
    return reply.send({
      branches: await listBranchesForBoard(board.id),
    } satisfies ListBranchesResponse);
  });

  app.post<{ Body: CreateBoardBody }>('/api/boards', async (req, reply) => {
    const me = requireUser(req);
    const name = (req.body?.name ?? '').trim();
    const repoSlug = (req.body?.repoSlug ?? '').trim();
    const devUrl = (req.body?.devUrl ?? '').trim();
    if (!name) {
      return reply.code(400).send({ error: 'Board name required', code: 'BAD_REQUEST' });
    }
    if (!repoSlug || !/^[\w.-]+\/[\w.-]+$/.test(repoSlug)) {
      return reply.code(400).send({
        error: 'Repo slug must look like owner/repo',
        code: 'BAD_REQUEST',
      });
    }
    if (devUrl) {
      try {
        new URL(devUrl);
      } catch {
        return reply.code(400).send({
          error: 'devUrl must be an absolute URL',
          code: 'BAD_REQUEST',
        });
      }
    }
    if (await getBoardByRepoSlug(repoSlug)) {
      return reply.code(409).send({
        error: 'A board already exists for that repo',
        code: 'REPO_TAKEN',
      });
    }

    const now = nowIso();
    const id = newId('b');
    const board: Board = {
      id,
      name,
      repoSlug,
      devUrl: devUrl || undefined,
      createdAt: now,
    };
    await upsertBoard(board);
    await addBoardMember(id, me.id, 'owner');

    // Seed an empty main branch so the canvas has something to land on.
    // Branch ids are globally unique, so scope by board to avoid collisions
    // with other boards' "main" (e.g. the seeded acme/landing board).
    const mainBranch: Branch = {
      id: `${id}:main`,
      boardId: id,
      name: 'main',
      authoredBy: 'human',
      authorUserId: me.id,
      color: '#9a9a9a',
      headSha: '0000000',
      createdAt: now,
      updatedAt: now,
    };
    await upsertBranch(mainBranch);

    hub.broadcast(id, { type: 'branch.added', branch: mainBranch });

    return reply.code(201).send({ board });
  });

  // Create a new branch under a board. Branch ids are board-scoped
  // (`${boardId}:${name}`) so two boards can both have a "main", a
  // "feat/x", etc. without colliding on the globally-unique branch id.
  app.post<{
    Body: {
      boardId?: string;
      name?: string;
      color?: string;
      headSha?: string;
    };
  }>('/api/branches', async (req, reply) => {
    const me = requireUser(req);
    const boardId = (req.body?.boardId ?? '').trim();
    const rawName = (req.body?.name ?? '').trim();
    if (!boardId || !rawName) {
      return reply
        .code(400)
        .send({ error: 'boardId and name required', code: 'BAD_REQUEST' });
    }
    // Allow the same shape git uses for refs: letters, numbers, -, _, /, .
    // Reject leading/trailing slashes and `..` so the id stays well-formed.
    if (!/^[\w./-]+$/.test(rawName) || rawName.startsWith('/') || rawName.endsWith('/') || rawName.includes('..')) {
      return reply
        .code(400)
        .send({ error: 'Invalid branch name', code: 'BAD_REQUEST' });
    }
    if (!(await canEditBoard(boardId, me.id))) {
      return reply
        .code(403)
        .send({ error: 'Not a member of this board', code: 'FORBIDDEN' });
    }

    const id = `${boardId}:${rawName}`;
    const existing = await getBranchById(id);
    if (existing) {
      return reply.code(409).send({
        error: 'Branch already exists on this board',
        code: 'BRANCH_TAKEN',
      });
    }

    const now = nowIso();
    const headSha = (req.body?.headSha ?? '').trim() || newCommitSha();
    const branch: Branch = {
      id,
      boardId,
      name: rawName,
      authoredBy: 'human',
      authorUserId: me.id,
      color: (req.body?.color ?? '').trim() || '#9a9a9a',
      headSha,
      createdAt: now,
      updatedAt: now,
    };
    await upsertBranch(branch);

    // Seed an initial commit so frames created on this branch have something
    // to reference for their commitSha. Mirrors the seed/captures pattern.
    await upsertCommit({
      sha: headSha,
      branchId: id,
      message: `branch: ${rawName}`,
      authorUserId: me.id,
      createdAt: now,
    });

    hub.broadcast(boardId, { type: 'branch.added', branch });

    return reply.code(201).send({ branch });
  });

  // Soft-delete a board (archive). NOT a hard DELETE — we want the data to
  // survive an accidental click and a GDPR-compliant "I changed my mind"
  // window. The row's archived_at gets stamped; child frames / comments /
  // dispatches stay in place. Restore via POST /api/boards/:id/restore.
  // Requires owner-or-editor (canEditBoard) so a viewer can't nuke a board
  // they only have read access to.
  app.delete<{ Params: { id: string } }>(
    '/api/boards/:id',
    async (req, reply) => {
      const me = requireUser(req);
      const board = await getBoardById(req.params.id);
      if (!board || !(await canEditBoard(board.id, me.id))) {
        return reply
          .code(404)
          .send({ error: 'Board not found', code: 'NOT_FOUND' });
      }
      await archiveBoard(board.id);
      return reply.send({ ok: true, archived: true });
    },
  );

  app.post<{ Params: { id: string } }>(
    '/api/boards/:id/restore',
    async (req, reply) => {
      const me = requireUser(req);
      const board = await getBoardById(req.params.id);
      if (!board || !(await canEditBoard(board.id, me.id))) {
        return reply
          .code(404)
          .send({ error: 'Board not found', code: 'NOT_FOUND' });
      }
      await restoreBoard(board.id);
      return reply.send({ ok: true, restored: true });
    },
  );
}
