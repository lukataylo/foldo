// Tool: foldo_list_branches — return branches known locally. For the prototype
// we return the three seed branches; a real impl would shell out to git and
// reconcile with the cloud's branch repo.

import { z } from 'zod';
import type { ListBranchesResult } from '@foldo/protocol';
import type { FoldoMcpConfig } from '../../config.ts';
import { listSeedBranches } from '../../git/ops.ts';

export const listBranchesInputSchema = z.object({}).strict();

export const listBranchesJsonSchema = {
  type: 'object',
  properties: {},
  additionalProperties: false,
} as const;

export interface ListBranchesDeps {
  config: FoldoMcpConfig;
}

export async function runListBranches(
  deps: ListBranchesDeps,
): Promise<ListBranchesResult> {
  const branches = listSeedBranches(deps.config.boardId);
  return { branches };
}
