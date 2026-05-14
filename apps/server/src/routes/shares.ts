import type { FastifyInstance } from 'fastify';
import { requireUser } from '../auth.ts';
import { getBoardById } from '../repo/boards.ts';
import { listBranchesForBoard } from '../repo/branches.ts';
import { listFramesForBoard } from '../repo/frames.ts';
import { listCommentsForBoard } from '../repo/comments.ts';
import { listUsers } from '../repo/users.ts';
import { canEditBoard, isMember } from '../repo/members.ts';
import {
  createShare,
  getShareByToken,
  listSharesForBoard,
  revokeShare,
  type BoardShareRow,
} from '../repo/shares.ts';

function publicWebOrigin(): string {
  return process.env.FOLDO_PUBLIC_WEB_ORIGIN ?? 'http://localhost:5173';
}

// New short share path. `/share/<token>` is kept on the SPA side as an alias
// so any links shipped before this change keep working.
function shareUrl(token: string): string {
  return `${publicWebOrigin()}/s/${token}`;
}

function shareRowToPublic(r: BoardShareRow) {
  return {
    token: r.token,
    boardId: r.board_id,
    createdByUserId: r.created_by_user_id,
    createdAt: r.created_at,
    revokedAt: r.revoked_at,
    url: shareUrl(r.token),
  };
}

export async function registerShareRoutes(app: FastifyInstance): Promise<void> {
  app.post<{ Params: { id: string } }>(
    '/api/boards/:id/shares',
    async (req, reply) => {
      const user = requireUser(req);
      const board = await getBoardById(req.params.id);
      if (!board || !(await canEditBoard(board.id, user.id))) {
        return reply
          .code(404)
          .send({ error: 'Board not found', code: 'NOT_FOUND' });
      }
      const row = await createShare(board.id, user.id);
      return reply.send({
        token: row.token,
        url: shareUrl(row.token),
        share: shareRowToPublic(row),
      });
    },
  );

  app.get<{ Params: { id: string } }>(
    '/api/boards/:id/shares',
    async (req, reply) => {
      const me = requireUser(req);
      const board = await getBoardById(req.params.id);
      if (!board || !(await isMember(board.id, me.id))) {
        return reply
          .code(404)
          .send({ error: 'Board not found', code: 'NOT_FOUND' });
      }
      const rows = await listSharesForBoard(board.id);
      return reply.send({ shares: rows.map(shareRowToPublic) });
    },
  );

  app.delete<{ Params: { id: string; token: string } }>(
    '/api/boards/:id/shares/:token',
    async (req, reply) => {
      const me = requireUser(req);
      const board = await getBoardById(req.params.id);
      if (!board || !(await canEditBoard(board.id, me.id))) {
        return reply
          .code(404)
          .send({ error: 'Board not found', code: 'NOT_FOUND' });
      }
      const existing = await getShareByToken(req.params.token);
      if (!existing || existing.board_id !== board.id) {
        return reply
          .code(404)
          .send({ error: 'Share not found', code: 'NOT_FOUND' });
      }
      await revokeShare(req.params.token);
      return reply.send({ ok: true });
    },
  );

  // Public, no auth: read-only board snapshot for share viewers.
  app.get<{ Params: { token: string } }>(
    '/api/share/:token',
    async (req, reply) => {
      const share = await getShareByToken(req.params.token);
      if (!share || share.revoked_at) {
        return reply
          .code(404)
          .send({ error: 'Share link not found', code: 'NOT_FOUND' });
      }
      const board = await getBoardById(share.board_id);
      if (!board) {
        return reply
          .code(404)
          .send({ error: 'Board not found', code: 'NOT_FOUND' });
      }
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
        readOnly: true,
      });
    },
  );
}
