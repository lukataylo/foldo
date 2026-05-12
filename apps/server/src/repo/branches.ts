import type { Branch, Commit } from '@foldo/protocol';
import { db } from '../db.ts';
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

export function listBranchesForBoard(boardId: string): Branch[] {
  const rows = db
    .prepare(`SELECT * FROM branches WHERE board_id = ? ORDER BY created_at`)
    .all(boardId) as BranchRow[];
  return rows.map(rowToBranch);
}

export function getBranchById(id: string): Branch | null {
  const r = db.prepare(`SELECT * FROM branches WHERE id = ?`).get(id) as
    | BranchRow
    | undefined;
  return r ? rowToBranch(r) : null;
}

export function upsertBranch(b: Branch): Branch {
  db.prepare(
    `INSERT INTO branches (id, board_id, name, authored_by, author_user_id, agent_name, color, head_sha, created_at, updated_at)
     VALUES (@id, @board_id, @name, @authored_by, @author_user_id, @agent_name, @color, @head_sha, @created_at, @updated_at)
     ON CONFLICT(id) DO UPDATE SET
       name = excluded.name,
       authored_by = excluded.authored_by,
       author_user_id = excluded.author_user_id,
       agent_name = excluded.agent_name,
       color = excluded.color,
       head_sha = excluded.head_sha,
       updated_at = excluded.updated_at`,
  ).run({
    id: b.id,
    board_id: b.boardId,
    name: b.name,
    authored_by: b.authoredBy,
    author_user_id: b.authorUserId,
    agent_name: b.agentName ?? null,
    color: b.color,
    head_sha: b.headSha,
    created_at: b.createdAt,
    updated_at: b.updatedAt,
  });
  return b;
}

export function updateBranchHead(branchId: string, sha: string): void {
  db.prepare(
    `UPDATE branches SET head_sha = ?, updated_at = ? WHERE id = ?`,
  ).run(sha, nowIso(), branchId);
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

export function upsertCommit(c: Commit): Commit {
  db.prepare(
    `INSERT INTO commits (sha, branch_id, message, author_user_id, parent_sha, created_at)
     VALUES (@sha, @branch_id, @message, @author_user_id, @parent_sha, @created_at)
     ON CONFLICT(sha) DO UPDATE SET
       message = excluded.message,
       author_user_id = excluded.author_user_id,
       parent_sha = excluded.parent_sha`,
  ).run({
    sha: c.sha,
    branch_id: c.branchId,
    message: c.message,
    author_user_id: c.authorUserId,
    parent_sha: c.parentSha ?? null,
    created_at: c.createdAt,
  });
  return c;
}

export function getCommit(sha: string): Commit | null {
  const r = db.prepare(`SELECT * FROM commits WHERE sha = ?`).get(sha) as
    | CommitRow
    | undefined;
  return r ? rowToCommit(r) : null;
}
