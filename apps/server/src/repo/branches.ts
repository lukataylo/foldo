import type { Branch, Commit } from '@foldo/protocol';
import { query, queryOne, exec } from '../db.ts';
import { nowIso } from '../util.ts';

interface BranchRow {
  id: string;
  board_id: string;
  name: string;
  authored_by: 'human' | 'agent';
  author_user_id: string;
  agent_name: string | null;
  color: string;
  head_sha: string;
  created_at: string;
  updated_at: string;
}

function rowToBranch(r: BranchRow): Branch {
  return {
    id: r.id,
    boardId: r.board_id,
    name: r.name,
    authoredBy: r.authored_by,
    authorUserId: r.author_user_id,
    agentName: r.agent_name ?? undefined,
    color: r.color,
    headSha: r.head_sha,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export async function listBranchesForBoard(boardId: string): Promise<Branch[]> {
  const rows = await query<BranchRow>(
    `SELECT * FROM branches WHERE board_id = $1 ORDER BY created_at`,
    [boardId],
  );
  return rows.map(rowToBranch);
}

/**
 * Every branch authored by `userId`, across every board. Used by the GDPR
 * data-export endpoint.
 */
export async function listBranchesAuthoredBy(userId: string): Promise<Branch[]> {
  const rows = await query<BranchRow>(
    `SELECT * FROM branches WHERE author_user_id = $1 ORDER BY created_at`,
    [userId],
  );
  return rows.map(rowToBranch);
}

export async function getBranchById(id: string): Promise<Branch | null> {
  const r = await queryOne<BranchRow>(`SELECT * FROM branches WHERE id = $1`, [id]);
  return r ? rowToBranch(r) : null;
}

export async function upsertBranch(b: Branch): Promise<Branch> {
  await exec(
    `INSERT INTO branches (id, board_id, name, authored_by, author_user_id, agent_name, color, head_sha, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     ON CONFLICT(id) DO UPDATE SET
       board_id = EXCLUDED.board_id,
       name = EXCLUDED.name,
       authored_by = EXCLUDED.authored_by,
       author_user_id = EXCLUDED.author_user_id,
       agent_name = EXCLUDED.agent_name,
       color = EXCLUDED.color,
       head_sha = EXCLUDED.head_sha,
       updated_at = EXCLUDED.updated_at`,
    [
      b.id,
      b.boardId,
      b.name,
      b.authoredBy,
      b.authorUserId,
      b.agentName ?? null,
      b.color,
      b.headSha,
      b.createdAt,
      b.updatedAt,
    ],
  );
  return b;
}

export async function updateBranchHead(branchId: string, sha: string): Promise<void> {
  await exec(`UPDATE branches SET head_sha = $1, updated_at = $2 WHERE id = $3`, [
    sha,
    nowIso(),
    branchId,
  ]);
}

interface CommitRow {
  sha: string;
  branch_id: string;
  message: string;
  author_user_id: string;
  parent_sha: string | null;
  created_at: string;
}

function rowToCommit(r: CommitRow): Commit {
  return {
    sha: r.sha,
    branchId: r.branch_id,
    message: r.message,
    authorUserId: r.author_user_id,
    parentSha: r.parent_sha ?? undefined,
    createdAt: r.created_at,
  };
}

export async function upsertCommit(c: Commit): Promise<Commit> {
  await exec(
    `INSERT INTO commits (sha, branch_id, message, author_user_id, parent_sha, created_at)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT(sha) DO UPDATE SET
       message = EXCLUDED.message,
       author_user_id = EXCLUDED.author_user_id,
       parent_sha = EXCLUDED.parent_sha`,
    [c.sha, c.branchId, c.message, c.authorUserId, c.parentSha ?? null, c.createdAt],
  );
  return c;
}

export async function getCommit(sha: string): Promise<Commit | null> {
  const r = await queryOne<CommitRow>(`SELECT * FROM commits WHERE sha = $1`, [sha]);
  return r ? rowToCommit(r) : null;
}
