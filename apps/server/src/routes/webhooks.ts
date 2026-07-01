import { createHmac, timingSafeEqual } from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
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

/**
 * Verify GitHub's HMAC-SHA256 webhook signature. GitHub sends the secret-key
 * HMAC of the raw body as `X-Hub-Signature-256: sha256=<hex>`.
 *
 * Returns true if the secret is unset (dev only) or the signature matches.
 * In production a missing secret rejects every payload — an unsigned webhook
 * endpoint lets anyone who can guess a repo slug create users, branches, and
 * frames on that board.
 */
function verifyGithubSignature(
  req: FastifyRequest,
  rawBody: string,
  secret: string | undefined,
): boolean {
  if (!secret) return process.env.NODE_ENV !== 'production';
  const header = req.headers['x-hub-signature-256'];
  if (!header || Array.isArray(header)) return false;
  const expected =
    'sha256=' + createHmac('sha256', secret).update(rawBody).digest('hex');
  const a = Buffer.from(header, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function registerWebhookRoutes(app: FastifyInstance): Promise<void> {
  // The webhook lives in its own encapsulated scope so we can override the
  // JSON content-type parser for this route only: GitHub's HMAC is computed
  // over the exact bytes it sent, so we must keep the verbatim body around —
  // re-stringifying the parsed object is not byte-identical (key order,
  // unicode escaping) and makes signature verification fail for real
  // payloads whenever a secret is configured.
  await app.register(async (scope) => {
    // Delegate the actual parse to Fastify's default JSON parser so this
    // route keeps the secure-json-parse prototype-poisoning protection and
    // the standard malformed-JSON error shape every other route gets.
    const defaultJsonParser = scope.getDefaultJsonParser('error', 'error');
    scope.addContentTypeParser(
      'application/json',
      { parseAs: 'string' },
      (req, body, done) => {
        (req as unknown as { rawBody?: string }).rawBody = body as string;
        defaultJsonParser(req, body as string, done);
      },
    );

    scope.post<{ Body: GithubPushPayload }>(
      '/api/webhooks/github',
      async (req, reply) => {
        const secret = process.env.FOLDO_GITHUB_WEBHOOK_SECRET;
        const raw = (req as unknown as { rawBody?: string }).rawBody;
        if (!verifyGithubSignature(req, raw ?? '', secret)) {
          return reply
            .code(401)
            .send({ error: 'Invalid webhook signature', code: 'UNAUTHORIZED' });
        }

      const body = req.body;
      if (!body?.ref || !body?.after || !body?.repository?.full_name) {
        return reply.code(400).send({ error: 'Invalid GitHub payload', code: 'BAD_REQUEST' });
      }
      const board = await getBoardByRepoSlug(body.repository.full_name);
      if (!board) {
        return reply.code(404).send({ error: 'No board for repo', code: 'NOT_FOUND' });
      }

      const branchName = body.ref.replace(/^refs\/heads\//, '');
      // Scope by board so two repos pushing the same branch name don't collide
      // on the globally-unique branch id.
      const branchId = `${board.id}:${branchName}`;
      const pusherUserId = `u-gh-${(body.pusher.name || 'anon').toLowerCase()}`;
      await upsertUser({
        id: pusherUserId,
        name: body.pusher.name || 'GitHub Pusher',
        initial: (body.pusher.name || '?').charAt(0).toUpperCase(),
        color: '#9a9a9a',
        email: body.pusher.email,
        kind: 'human',
      });

      const now = nowIso();
      const existingBranch = await getBranchById(branchId);
      if (!existingBranch) {
        const branch = await upsertBranch({
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
        await updateBranchHead(branchId, body.after);
        const updated = await getBranchById(branchId);
        if (updated) hub.broadcast(board.id, { type: 'branch.updated', branch: updated });
      }

      for (const c of body.commits ?? []) {
        await upsertCommit({
          sha: c.id,
          branchId,
          message: c.message,
          authorUserId: pusherUserId,
          createdAt: c.timestamp ?? now,
        });
      }

      const stubContent: MarkdownFrameContent = {
        kind: 'markdown',
        docPath: `commits/${body.after}.md`,
        title: `push: ${branchName}`,
        body: (body.commits ?? [])
          .map((c) => `- \`${c.id.slice(0, 7)}\` ${c.message}`)
          .join('\n'),
      };

      const siblings = await listFramesForBoard(board.id);
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
      await insertFrame(frame);
      hub.broadcast(board.id, { type: 'frame.added', frame });

      return reply.send({ ok: true });
      },
    );
  });
}
