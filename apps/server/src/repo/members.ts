import { exec, query, queryOne } from '../db.ts';

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
): Promise<void> {
  await exec(
    `INSERT INTO board_members (board_id, user_id, role)
     VALUES ($1, $2, $3)
     ON CONFLICT (board_id, user_id) DO UPDATE SET role = EXCLUDED.role`,
    [boardId, userId, role],
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
