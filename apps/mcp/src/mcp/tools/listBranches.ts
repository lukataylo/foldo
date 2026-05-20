// Tool: foldo_list_branches, return branches known locally. When the MCP is
// running inside a real git repo we return its ACTUAL local branches; we fall
// back to the three seed branches the cloud knows about otherwise.

import { z } from 'zod';
import type { Branch, ListBranchesResult } from '@foldo/protocol';
import type { FoldoMcpConfig } from '../../config.ts';
import {
  isGitRepo,
  listSeedBranches,
  tryLocalBranches,
} from '../../git/ops.ts';

export const listBranchesInputSchema = z.object({}).strict();

export const listBranchesJsonSchema = {
  type: 'object',
  properties: {},
  additionalProperties: false,
} as const;

export interface ListBranchesDeps {
  config: FoldoMcpConfig;
}

/** Map a raw local branch name to the protocol `Branch` shape. */
function toBranch(name: string, boardId: string): Branch {
  const now = new Date().toISOString();
  return {
    id: name,
    boardId,
    name,
    authoredBy: 'human',
    authorUserId: 'local',
    color: '#9a9a9a',
    headSha: '',
    createdAt: now,
    updatedAt: now,
  };
}

export async function runListBranches(
  deps: ListBranchesDeps,
): Promise<ListBranchesResult> {
  const repo = deps.config.targetRepo;
  // Prefer the repo's real local branches when we're inside one.
  if (await isGitRepo(repo)) {
    const names = await tryLocalBranches(repo);
    if (names && names.length > 0) {
      return {
        branches: names.map((n) => toBranch(n, deps.config.boardId)),
      };
    }
  }
  // Fall back to the seed branches the cloud already knows about.
  return { branches: listSeedBranches(deps.config.boardId) };
}
