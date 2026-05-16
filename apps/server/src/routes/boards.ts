import type { FastifyInstance } from 'fastify';
import type {
  Board,
  Branch,
  GetBoardResponse,
  ListBoardsResponse,
  ListBranchesResponse,
  MeResponse,
} from '@foldo/protocol';
import { requireUser } from '../auth.ts';
import {
  getBoardById,
  getBoardByRepoSlug,
  listBoards,
  upsertBoard,
} from '../repo/boards.ts';
import { listBranchesForBoard, upsertBranch } from '../repo/branches.ts';
import { listFramesForBoard } from '../repo/frames.ts';
import { listCommentsForBoard } from '../repo/comments.ts';
import { listUsers } from '../repo/users.ts';
import { addBoardMember, isMember, listBoardIdsForUser } from '../repo/members.ts';
import { hub } from '../ws/hub.ts';
import { isMcpConnected } from '../ws/mcp.ts';
import { newId, nowIso } from '../util.ts';

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

  app.get('/api/boards', async (req, reply) => {
    const me = requireUser(req);
    const ids = new Set(await listBoardIdsForUser(me.id));
    const all = await listBoards();
    return reply.send({
      boards: all.filter((b) => ids.has(b.id)),
    } satisfies ListBoardsResponse);
  });

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
      listUsers(),
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
}
