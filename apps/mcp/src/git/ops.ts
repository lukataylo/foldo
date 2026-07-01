// Local git operations. For the prototype most of this is mocked, we return
// the three seed branches that the cloud already knows about. The real impl
// would shell out to `git branch -a` (or use simple-git) and reconcile with
// the cloud's branch repo.

import type { Branch, BoardId } from '@foldo/protocol';

const SEED_USER = 'user-luka';

function isoDays(daysAgo: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - daysAgo);
  return d.toISOString();
}

/** Seed branches that match what the cloud server seeds, same IDs, names,
 *  colors, and head SHAs so list_branches answers consistently. */
export function listSeedBranches(boardId: BoardId): Branch[] {
  return [
    {
      id: 'main',
      boardId,
      name: 'main',
      authoredBy: 'human',
      authorUserId: SEED_USER,
      color: '#9a9a9a',
      headSha: 'a7c1d29',
      createdAt: isoDays(14),
      updatedAt: isoDays(1),
    },
    {
      id: 'feat/cta-revamp',
      boardId,
      name: 'feat/cta-revamp',
      authoredBy: 'agent',
      authorUserId: SEED_USER,
      agentName: 'Claude Code',
      color: '#b08cff',
      headSha: '4f81b62',
      createdAt: isoDays(3),
      updatedAt: isoDays(0),
    },
    {
      id: 'feat/pro-tier-highlight',
      boardId,
      name: 'feat/pro-tier-highlight',
      authoredBy: 'agent',
      authorUserId: SEED_USER,
      agentName: 'Claude Code',
      color: '#5db0ff',
      headSha: '9e0a17d',
      createdAt: isoDays(2),
      updatedAt: isoDays(0),
    },
  ];
}

/** Simulated "commit + push", returns the fake SHA we already minted. */
export async function fakeCommitAndPush(sha: string, message: string): Promise<{
  sha: string;
  message: string;
}> {
  // In real life this would: write files, `git add -A`, `git commit -m "$message"`,
  // `git push`. For the prototype we just echo the inputs back.
  return { sha, message };
}
