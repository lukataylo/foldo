import { exec, query, queryOne, withTx, type Executor } from '../db.ts';

export type BoardRole = 'owner' | 'editor' | 'viewer';

interface MembershipRow {
  board_id: string;
  user_id: string;
  role: BoardRole;
  joined_at: string;
}

export async function addBoardMember(
  boardId: string,
  userId: string,
  role: BoardRole,
  client?: Executor,
): Promise<void> {
  await exec(
    `INSERT INTO board_members (board_id, user_id, role)
     VALUES ($1, $2, $3)
     ON CONFLICT (board_id, user_id) DO UPDATE SET role = EXCLUDED.role`,
    [boardId, userId, role],
    client,
  );
}

export async function getMembership(
  boardId: string,
  userId: string,
): Promise<MembershipRow | null> {
  return queryOne<MembershipRow>(
    `SELECT * FROM board_members WHERE board_id = $1 AND user_id = $2`,
    [boardId, userId],
  );
}

export async function listBoardIdsForUser(userId: string): Promise<string[]> {
  const rows = await query<{ board_id: string }>(
    `SELECT board_id FROM board_members WHERE user_id = $1`,
    [userId],
  );
  return rows.map((r) => r.board_id);
}

export async function isMember(boardId: string, userId: string): Promise<boolean> {
  const row = await queryOne<{ exists: boolean }>(
    `SELECT EXISTS(
       SELECT 1 FROM board_members WHERE board_id = $1 AND user_id = $2
     ) AS exists`,
    [boardId, userId],
  );
  return row?.exists === true;
}

/** Owner-or-editor, allowed to write to the board. */
export async function canEditBoard(boardId: string, userId: string): Promise<boolean> {
  const m = await getMembership(boardId, userId);
  return m?.role === 'owner' || m?.role === 'editor';
}

/** True if the user is the board's owner (the only role allowed to manage members). */
export async function isOwner(boardId: string, userId: string): Promise<boolean> {
  const m = await getMembership(boardId, userId);
  return m?.role === 'owner';
}

export interface BoardMemberRow {
  userId: string;
  role: BoardRole;
  joinedAt: string;
}

/** List a board's members (no user display fields — caller joins those). */
export async function listBoardMembers(boardId: string): Promise<BoardMemberRow[]> {
  const rows = await query<MembershipRow>(
    `SELECT * FROM board_members WHERE board_id = $1 ORDER BY joined_at`,
    [boardId],
  );
  return rows.map((r) => ({
    userId: r.user_id,
    role: r.role,
    joinedAt: r.joined_at,
  }));
}

/** Change an existing member's role. No-op (0 rows) if they aren't a member. */
export async function updateMemberRole(
  boardId: string,
  userId: string,
  role: BoardRole,
): Promise<boolean> {
  const n = await exec(
    `UPDATE board_members SET role = $3 WHERE board_id = $1 AND user_id = $2`,
    [boardId, userId, role],
  );
  return n > 0;
}

/** Remove a member from a board. Returns false if they weren't a member. */
export async function removeBoardMember(
  boardId: string,
  userId: string,
): Promise<boolean> {
  const n = await exec(
    `DELETE FROM board_members WHERE board_id = $1 AND user_id = $2`,
    [boardId, userId],
  );
  return n > 0;
}

/** Number of owners on a board — used to block removing/demoting the last one. */
export async function countOwnersForBoard(boardId: string): Promise<number> {
  const r = await queryOne<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM board_members WHERE board_id = $1 AND role = 'owner'`,
    [boardId],
  );
  return r ? Number(r.count) : 0;
}

/**
 * Outcome of a last-owner-guarded mutation. `last_owner` means the operation
 * was refused because it would have left the board with zero owners.
 */
export type OwnerGuardResult = 'ok' | 'last_owner' | 'not_member';

/**
 * Change a member's role atomically, refusing to demote the final owner.
 *
 * The count-then-update is wrapped in a transaction that `SELECT … FOR UPDATE`
 * locks the board's owner rows first, so two concurrent demotes of two
 * different owners can't both observe "2 owners" and both succeed — which
 * would orphan the board.
 */
export async function changeMemberRoleGuarded(
  boardId: string,
  userId: string,
  role: BoardRole,
): Promise<OwnerGuardResult> {
  return withTx(async (client) => {
    const owners = await query<{ user_id: string }>(
      `SELECT user_id FROM board_members
       WHERE board_id = $1 AND role = 'owner' FOR UPDATE`,
      [boardId],
      client,
    );
    const target = await queryOne<MembershipRow>(
      `SELECT * FROM board_members WHERE board_id = $1 AND user_id = $2`,
      [boardId, userId],
      client,
    );
    if (!target) return 'not_member';
    const demotingAnOwner = target.role === 'owner' && role !== 'owner';
    if (demotingAnOwner && owners.length <= 1) return 'last_owner';
    await exec(
      `UPDATE board_members SET role = $3 WHERE board_id = $1 AND user_id = $2`,
      [boardId, userId, role],
      client,
    );
    return 'ok';
  });
}

/**
 * Remove a member atomically, refusing to remove the final owner.
 * Idempotent: removing a non-member returns 'ok'.
 */
export async function removeMemberGuarded(
  boardId: string,
  userId: string,
): Promise<OwnerGuardResult> {
  return withTx(async (client) => {
    const owners = await query<{ user_id: string }>(
      `SELECT user_id FROM board_members
       WHERE board_id = $1 AND role = 'owner' FOR UPDATE`,
      [boardId],
      client,
    );
    const target = await queryOne<MembershipRow>(
      `SELECT * FROM board_members WHERE board_id = $1 AND user_id = $2`,
      [boardId, userId],
      client,
    );
    if (!target) return 'ok'; // already gone — idempotent
    if (target.role === 'owner' && owners.length <= 1) return 'last_owner';
    await exec(
      `DELETE FROM board_members WHERE board_id = $1 AND user_id = $2`,
      [boardId, userId],
      client,
    );
    return 'ok';
  });
}

export async function countOwnedBoards(userId: string): Promise<number> {
  const r = await queryOne<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM board_members WHERE user_id = $1 AND role = 'owner'`,
    [userId],
  );
  return r ? Number(r.count) : 0;
}
