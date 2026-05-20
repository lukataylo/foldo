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
  deleteBoardCascade,
  getBoardById,
  getBoardByRepoSlug,
  listBoards,
  renameBoard,
  upsertBoard,
} from '../repo/boards.ts';
import {
  getBranchById,
  listBranchesForBoard,
  upsertBranch,
  upsertCommit,
} from '../repo/branches.ts';
import { listFramesForBoard } from '../repo/frames.ts';
import { listCommentsForBoard } from '../repo/comments.ts';
import { getUserByEmail, getUserById, listUsers } from '../repo/users.ts';
import {
  addBoardMember,
  canEditBoard,
  changeMemberRoleGuarded,
  isMember,
  isOwner,
  listBoardIdsForUser,
  listBoardMembers,
  removeMemberGuarded,
  type BoardRole,
} from '../repo/members.ts';
import { hub } from '../ws/hub.ts';
import { isMcpConnected } from '../ws/mcp.ts';
import { query, withTx } from '../db.ts';
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
    // Fetch users first so listCommentsForBoard can resolve comment authors
    // in memory — avoids one extra query per comment (N+1).
    const [branches, frames, users] = await Promise.all([
      listBranchesForBoard(board.id),
      listFramesForBoard(board.id),
      listUsers(),
    ]);
    const comments = await listCommentsForBoard(board.id, users);
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

    // Atomic: a crash between these writes would leave an owner-less,
    // permanently-unreadable board (every read is gated on board_members).
    await withTx(async (client) => {
      await upsertBoard(board, client);
      await addBoardMember(id, me.id, 'owner', client);
      await upsertBranch(mainBranch, client);
    });

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
    // Atomic: a branch with no head commit leaves frames on it with a
    // dangling commitSha reference.
    await withTx(async (client) => {
      await upsertBranch(branch, client);
      // Seed an initial commit so frames created on this branch have
      // something to reference for their commitSha.
      await upsertCommit(
        {
          sha: headSha,
          branchId: id,
          message: `branch: ${rawName}`,
          authorUserId: me.id,
          createdAt: now,
        },
        client,
      );
    });

    hub.broadcast(boardId, { type: 'branch.added', branch });

    return reply.code(201).send({ branch });
  });

  // -------------------------------------------------------------------------
  // Board rename / delete — owner-only.
  // -------------------------------------------------------------------------

  // PATCH the board name. Only an owner may rename.
  app.patch<{ Params: { id: string }; Body: { name?: string } }>(
    '/api/boards/:id',
    async (req, reply) => {
      const me = requireUser(req);
      const boardId = req.params.id;
      // 404 (not 403) when the caller can't even see the board — don't leak
      // existence to non-members.
      if (!(await isMember(boardId, me.id))) {
        return reply.code(404).send({ error: 'Board not found', code: 'NOT_FOUND' });
      }
      if (!(await isOwner(boardId, me.id))) {
        return reply
          .code(403)
          .send({ error: 'Only the board owner can rename it', code: 'FORBIDDEN' });
      }
      const name = (req.body?.name ?? '').trim();
      if (!name) {
        return reply
          .code(400)
          .send({ error: 'Board name required', code: 'BAD_REQUEST' });
      }
      if (name.length > 80) {
        return reply
          .code(400)
          .send({ error: 'Board name is too long (80 max)', code: 'BAD_REQUEST' });
      }
      const board = await renameBoard(boardId, name);
      if (!board) {
        return reply.code(404).send({ error: 'Board not found', code: 'NOT_FOUND' });
      }
      return reply.send({ board });
    },
  );

  // DELETE a board and all of its content. Only an owner may delete.
  app.delete<{ Params: { id: string } }>(
    '/api/boards/:id',
    async (req, reply) => {
      const me = requireUser(req);
      const boardId = req.params.id;
      if (!(await isMember(boardId, me.id))) {
        return reply.code(404).send({ error: 'Board not found', code: 'NOT_FOUND' });
      }
      if (!(await isOwner(boardId, me.id))) {
        return reply
          .code(403)
          .send({ error: 'Only the board owner can delete it', code: 'FORBIDDEN' });
      }
      await deleteBoardCascade(boardId);
      return reply.send({ ok: true });
    },
  );

  // -------------------------------------------------------------------------
  // Board members — list / invite / change role / remove. Mutations are
  // owner-only; listing is open to any member.
  // -------------------------------------------------------------------------

  // List members, hydrated with user display fields so the UI has names.
  app.get<{ Params: { id: string } }>(
    '/api/boards/:id/members',
    async (req, reply) => {
      const me = requireUser(req);
      const boardId = req.params.id;
      if (!(await isMember(boardId, me.id))) {
        return reply.code(404).send({ error: 'Board not found', code: 'NOT_FOUND' });
      }
      const [rows, users] = await Promise.all([
        listBoardMembers(boardId),
        listUsers(),
      ]);
      const byId = new Map(users.map((u) => [u.id, u]));
      const members = rows.map((r) => {
        const u = byId.get(r.userId);
        return {
          userId: r.userId,
          name: u?.name ?? 'Unknown',
          initial: u?.initial ?? '?',
          color: u?.color ?? '#999',
          email: u?.email,
          kind: u?.kind ?? 'human',
          role: r.role,
          joinedAt: r.joinedAt,
        };
      });
      return reply.send({ members });
    },
  );

  // Invite a user to the board. MVP: the invitee must already have a Foldo
  // account — we look them up by email. For demo identities (seeded users
  // without an email set) we also accept a bare user id, mirroring the
  // demo-fallthrough in auth.ts. Owner-only.
  app.post<{ Params: { id: string }; Body: { email?: string; role?: string } }>(
    '/api/boards/:id/members',
    async (req, reply) => {
      const me = requireUser(req);
      const boardId = req.params.id;
      if (!(await isMember(boardId, me.id))) {
        return reply.code(404).send({ error: 'Board not found', code: 'NOT_FOUND' });
      }
      if (!(await isOwner(boardId, me.id))) {
        return reply
          .code(403)
          .send({ error: 'Only the board owner can invite members', code: 'FORBIDDEN' });
      }
      const raw = (req.body?.email ?? '').trim();
      if (!raw) {
        return reply
          .code(400)
          .send({ error: 'An email is required', code: 'BAD_REQUEST' });
      }
      const role = normalizeInviteRole(req.body?.role);
      if (!role) {
        return reply
          .code(400)
          .send({ error: 'Role must be editor or viewer', code: 'BAD_REQUEST' });
      }
      // Look up by email first; fall back to a literal user id (demo accounts).
      const invitee =
        (await getUserByEmail(raw)) ?? (await getUserById(raw));
      if (!invitee) {
        return reply.code(404).send({
          error: `No Foldo account found for "${raw}". They need to sign up first, then you can invite them.`,
          code: 'USER_NOT_FOUND',
        });
      }
      if (await isMember(boardId, invitee.id)) {
        return reply.code(409).send({
          error: `${invitee.name} is already a member of this board`,
          code: 'ALREADY_MEMBER',
        });
      }
      await addBoardMember(boardId, invitee.id, role);
      return reply.code(201).send({
        member: {
          userId: invitee.id,
          name: invitee.name,
          initial: invitee.initial,
          color: invitee.color,
          email: invitee.email,
          kind: invitee.kind,
          role,
          joinedAt: nowIso(),
        },
      });
    },
  );

  // Change a member's role. Owner-only. Cannot demote the last owner.
  app.patch<{
    Params: { id: string; userId: string };
    Body: { role?: string };
  }>('/api/boards/:id/members/:userId', async (req, reply) => {
    const me = requireUser(req);
    const { id: boardId, userId } = req.params;
    if (!(await isMember(boardId, me.id))) {
      return reply.code(404).send({ error: 'Board not found', code: 'NOT_FOUND' });
    }
    if (!(await isOwner(boardId, me.id))) {
      return reply
        .code(403)
        .send({ error: 'Only the board owner can change roles', code: 'FORBIDDEN' });
    }
    const role = (req.body?.role ?? '').trim() as BoardRole;
    if (role !== 'owner' && role !== 'editor' && role !== 'viewer') {
      return reply
        .code(400)
        .send({ error: 'Role must be owner, editor or viewer', code: 'BAD_REQUEST' });
    }
    // Atomic: refuses to demote the final owner even under concurrent calls.
    const result = await changeMemberRoleGuarded(boardId, userId, role);
    if (result === 'not_member') {
      return reply
        .code(404)
        .send({ error: 'That user is not a member of this board', code: 'NOT_FOUND' });
    }
    if (result === 'last_owner') {
      return reply.code(409).send({
        error: 'Promote another member to owner before stepping down',
        code: 'LAST_OWNER',
      });
    }
    return reply.send({ ok: true, role });
  });

  // Remove a member. Owner-only. Cannot remove the last owner.
  app.delete<{ Params: { id: string; userId: string } }>(
    '/api/boards/:id/members/:userId',
    async (req, reply) => {
      const me = requireUser(req);
      const { id: boardId, userId } = req.params;
      if (!(await isMember(boardId, me.id))) {
        return reply.code(404).send({ error: 'Board not found', code: 'NOT_FOUND' });
      }
      if (!(await isOwner(boardId, me.id))) {
        return reply
          .code(403)
          .send({ error: 'Only the board owner can remove members', code: 'FORBIDDEN' });
      }
      // Atomic: refuses to remove the final owner; idempotent for non-members.
      const result = await removeMemberGuarded(boardId, userId);
      if (result === 'last_owner') {
        return reply.code(409).send({
          error: 'Cannot remove the last owner — transfer ownership first',
          code: 'LAST_OWNER',
        });
      }
      return reply.send({ ok: true });
    },
  );

  // -------------------------------------------------------------------------
  // Comment search — backs the home-page search box ("…repos, comments").
  // Scoped to boards the caller is a member of.
  // -------------------------------------------------------------------------
  app.get<{ Querystring: { q?: string } }>(
    '/api/boards/search/comments',
    async (req, reply) => {
      const me = requireUser(req);
      const q = (req.query?.q ?? '').trim();
      if (q.length < 2) {
        return reply.send({ results: [] });
      }
      const boardIds = await listBoardIdsForUser(me.id);
      if (boardIds.length === 0) {
        return reply.send({ results: [] });
      }
      // Escape LIKE metacharacters so a query of "%" or "_" is treated as a
      // literal substring, not a wildcard. `\` is the explicit ESCAPE char.
      const likeTerm =
        '%' + q.replace(/[\\%_]/g, (ch) => '\\' + ch) + '%';
      const rows = await query<{
        id: string;
        board_id: string;
        text: string;
      }>(
        `SELECT id, board_id, text
           FROM comments
          WHERE board_id = ANY($1::text[])
            AND text ILIKE $2 ESCAPE '\\'
          ORDER BY updated_at DESC
          LIMIT 50`,
        [boardIds, likeTerm],
      );
      return reply.send({
        results: rows.map((r) => ({
          id: r.id,
          boardId: r.board_id,
          text: r.text,
        })),
      });
    },
  );
}

/** Coerce an invite role: only editor/viewer allowed, defaulting to editor. */
function normalizeInviteRole(raw: unknown): BoardRole | null {
  const r = typeof raw === 'string' ? raw.trim() : 'editor';
  if (r === '' || r === 'editor') return 'editor';
  if (r === 'viewer') return 'viewer';
  return null;
}
