import type { FastifyInstance } from 'fastify';
import type { Frame, GithubPushPayload, MarkdownFrameContent } from '@foldo/protocol';
import { getBoardByRepoSlug } from '../repo/boards.ts';
import {
  getBranchById,
  updateBranchHead,
  upsertBranch,
  upsertCommit,
} from '../repo/branches.ts';
import { insertFrame, listFramesForBoard } from '../repo/frames.ts';
import { hub } from '../ws/hub.ts';
import { newId, nowIso } from '../util.ts';
import { upsertUser } from '../repo/users.ts';

export async function registerWebhookRoutes(app: FastifyInstance): Promise<void> {
  app.post<{ Body: GithubPushPayload }>(
    '/api/webhooks/github',
    async (req, reply) => {
      const body = req.body;
      if (!body?.ref || !body?.after || !body?.repository?.full_name) {
        return reply.code(400).send({ error: 'Invalid GitHub payload', code: 'BAD_REQUEST' });
      }
      const board = getBoardByRepoSlug(body.repository.full_name);
      if (!board) {
        return reply.code(404).send({ error: 'No board for repo', code: 'NOT_FOUND' });
      }

      const branchName = body.ref.replace(/^refs\/heads\//, '');
      const branchId = branchName;
      const pusherUserId = `u-gh-${(body.pusher.name || 'anon').toLowerCase()}`;
      upsertUser({
        id: pusherUserId,
        name: body.pusher.name || 'GitHub Pusher',
        initial: (body.pusher.name || '?').charAt(0).toUpperCase(),
        color: '#9a9a9a',
        email: body.pusher.email,
        kind: 'human',
      });

      const now = nowIso();
      const existingBranch = getBranchById(branchId);
      if (!existingBranch) {
        const branch = upsertBranch({
          id: branchId,
          boardId: board.id,
          name: branchName,
          authoredBy: 'human',
          authorUserId: pusherUserId,
          color: '#9a9a9a',
          headSha: body.after,
          createdAt: now,
          updatedAt: now,
        });
        hub.broadcast(board.id, { type: 'branch.added', branch });
      } else {
        updateBranchHead(branchId, body.after);
        const updated = getBranchById(branchId);
        if (updated) hub.broadcast(board.id, { type: 'branch.updated', branch: updated });
      }

      // Persist commits
      for (const c of body.commits ?? []) {
        upsertCommit({
          sha: c.id,
          branchId,
          message: c.message,
          authorUserId: pusherUserId,
          createdAt: c.timestamp ?? now,
        });
      }

      // Create a stub markdown frame for the push so the canvas sees it.
      const stubContent: MarkdownFrameContent = {
        kind: 'markdown',
        docPath: `commits/${body.after}.md`,
        title: `push: ${branchName}`,
        body: (body.commits ?? [])
          .map((c) => `- \`${c.id.slice(0, 7)}\` ${c.message}`)
          .join('\n'),
      };

      const siblings = listFramesForBoard(board.id);
      const maxY = siblings.reduce(
        (m, f) => Math.max(m, f.position.y + f.size.height),
        0,
      );

      const frame: Frame = {
        id: newId('f'),
        boardId: board.id,
        kind: 'markdown',
        branchId,
        commitSha: body.after,
        commitMessage: body.commits?.[body.commits.length - 1]?.message ?? branchName,
        age: 'just now',
        position: { x: 80, y: maxY + 80 },
        size: { width: 540, height: 700 },
        content: stubContent,
        createdAt: now,
        updatedAt: now,
      };
      insertFrame(frame);
      hub.broadcast(board.id, { type: 'frame.added', frame });

      return reply.send({ ok: true });
    },
  );
}
