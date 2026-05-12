import type { FastifyInstance } from 'fastify';
import type {
  GetBoardResponse,
  ListBoardsResponse,
  ListBranchesResponse,
  MeResponse,
} from '@foldo/protocol';
import { requireUser } from '../auth.ts';
import { getBoardById, listBoards } from '../repo/boards.ts';
import { listBranchesForBoard } from '../repo/branches.ts';
import { listFramesForBoard } from '../repo/frames.ts';
import { listCommentsForBoard } from '../repo/comments.ts';
import { listUsers } from '../repo/users.ts';
import { isMcpConnected } from '../ws/mcp.ts';

export async function registerBoardRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/me', async (req, reply) => {
    const user = requireUser(req);
    const token = (req.headers.authorization ?? '').replace(/^Bearer\s+/i, '');
    return reply.send({ user, token } satisfies MeResponse);
  });

  app.get('/api/boards', async (_req, reply) => {
    return reply.send({ boards: listBoards() } satisfies ListBoardsResponse);
  });

  app.get<{ Params: { id: string } }>('/api/boards/:id', async (req, reply) => {
    const board = getBoardById(req.params.id);
    if (!board) return reply.code(404).send({ error: 'Board not found', code: 'NOT_FOUND' });
    const branches = listBranchesForBoard(board.id);
    const frames = listFramesForBoard(board.id);
    const comments = listCommentsForBoard(board.id);
    const users = listUsers();
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
    const board = getBoardById(req.params.id);
    if (!board) return reply.code(404).send({ error: 'Board not found', code: 'NOT_FOUND' });
    return reply.send({
      branches: listBranchesForBoard(board.id),
    } satisfies ListBranchesResponse);
  });
}
