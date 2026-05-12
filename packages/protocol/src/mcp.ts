// MCP tool schemas — the JSON shape of tools the MCP server exposes to Claude Code.

import type {
  CommentTarget,
  CommitSha,
  Frame,
  RecipeStep,
  VariantOverrides,
  Branch,
} from './domain.ts';

/** Tool: freeze_current_state — capture a new frame from a running app */
export interface FreezeArgs {
  boardId: string;
  branchId: string;
  commitSha: CommitSha;
  route: string;
  viewport: { width: number; height: number };
  recipe?: RecipeStep[];
  stateLabel?: string;
}

export type FreezeResult = { frame: Frame };

/** Tool: replay_recipe — replay a recipe and return whether it succeeded */
export interface ReplayArgs {
  commitSha: CommitSha;
  recipe: RecipeStep[];
  url: string;
}

export type ReplayResult = {
  ok: boolean;
  endState?: string;
  error?: string;
};

/** Tool: apply_edit_prompt — edit code per a structured prompt and push */
export interface ApplyEditArgs {
  boardId: string;
  branchId: string;
  baseCommitSha: CommitSha;
  target: CommentTarget;
  intent: string;
  /** Optional recipe to verify the edit took effect at the same state */
  recipe?: RecipeStep[];
}

export type ApplyEditResult = {
  ok: boolean;
  newCommitSha?: CommitSha;
  overrides?: VariantOverrides;
  commitMessage?: string;
  diffSummary?: string;
  error?: string;
};

/** Tool: list_branches — query branches known to the local repo */
export type ListBranchesArgs = Record<string, never>;
export type ListBranchesResult = { branches: Branch[] };

/** Tool names exposed by the MCP server */
export const MCP_TOOLS = {
  FREEZE: 'foldo_freeze_current_state',
  REPLAY: 'foldo_replay_recipe',
  APPLY_EDIT: 'foldo_apply_edit_prompt',
  LIST_BRANCHES: 'foldo_list_branches',
} as const;

export type McpToolName = (typeof MCP_TOOLS)[keyof typeof MCP_TOOLS];
