// REST API, request/response schemas. All endpoints under /api.
// Auth: Authorization: Bearer <userId-token> (demo) or session cookie.
//
// Pagination contract: every list endpoint that may exceed ~100 items
// supports keyset pagination via `?limit=N&cursor=…` and responds with
// `PaginatedResponse<T>`. `cursor` is opaque to the client — it's a
// server-issued string that, when round-tripped on the next request,
// yields the page immediately after the one just received.
//
//   GET /api/boards/:id/frames?limit=100              → first page
//   GET /api/boards/:id/frames?limit=100&cursor=AB12  → next page
//
// Legacy unpaginated endpoints (e.g. the all-in-one `GET /api/boards/:id`)
// still exist for back-compat; clients should migrate as they touch them.

export interface PaginatedResponse<T> {
  items: T[];
  /** True iff a follow-up call with `cursor` would yield more rows. */
  hasMore: boolean;
  /** Opaque cursor for the next page. Omit on the last page. */
  cursor?: string;
}

export interface PageQuery {
  limit?: number;
  cursor?: string;
}

import type {
  Board,
  Branch,
  Comment,
  CommentAnchor,
  CommentPin,
  CommentTarget,
  Dispatch,
  Frame,
  SourceFile,
  Take,
  User,
  Walkthrough,
  WalkthroughAction,
  WalkthroughStep,
  AppFrameContent,
  ArrowFrameContent,
  FrameContent,
  FrameKind,
  ImageFrameContent,
  MarkdownFrameContent,
  StickyFrameContent,
} from './domain.ts';

// ---------- Auth ----------
export interface MeResponse {
  user: User;
  token: string;
}

// ---------- Boards ----------
export interface ListBoardsResponse {
  boards: Board[];
}

export interface GetBoardResponse {
  board: Board;
  branches: Branch[];
  frames: Frame[];
  comments: Comment[];
  users: User[];
  mcpConnected: boolean;
}

// ---------- Frames ----------
export interface CreateFrameRequest {
  boardId: string;
  branchId: string;
  commitSha: string;
  commitMessage: string;
  kind: FrameKind;
  position: { x: number; y: number };
  size: { width: number; height: number };
  content: FrameContent;
  parentFrameId?: string;
}

export interface MoveFrameRequest {
  position: { x: number; y: number };
}

export interface UpdateFrameRequest {
  position?: { x: number; y: number };
  size?: { width: number; height: number };
  content?:
    | Partial<AppFrameContent>
    | Partial<MarkdownFrameContent>
    | Partial<StickyFrameContent>
    | Partial<ArrowFrameContent>
    | Partial<ImageFrameContent>;
}

// ---------- Comments ----------
export interface CreateCommentRequest {
  boardId: string;
  frameId: string;
  text: string;
  pin?: CommentPin;
  anchor?: CommentAnchor;
  target?: CommentTarget;
}

export interface UpdateCommentRequest {
  text?: string;
  resolved?: boolean;
}

export interface ReplyToCommentRequest {
  text: string;
}

// ---------- Dispatches ----------
export interface CreateDispatchRequest {
  boardId: string;
  frameId: string;
  branchId: string;
  baseCommitSha: string;
  intent: string;
  target: CommentTarget;
}

export interface ListDispatchesResponse {
  dispatches: Dispatch[];
}

// ---------- Sources ----------
export interface GetSourceQuery {
  repoSlug: string;
  commitSha: string;
  path: string;
}

export type GetSourceResponse = SourceFile;

// ---------- Branches ----------
export interface ListBranchesResponse {
  branches: Branch[];
}

// ---------- Walkthroughs (living documentation) ----------

/** A step as supplied by the creator UI — server assigns ids when absent. */
export interface WalkthroughStepInput {
  id?: string;
  title: string;
  narration: string;
  actions: WalkthroughAction[];
  durationMs?: number;
}

export interface CreateWalkthroughRequest {
  boardId: string;
  title: string;
  /** Base URL of the deployed/preview app the director films */
  targetUrl: string;
  steps?: WalkthroughStepInput[];
  authActions?: WalkthroughAction[];
}

export interface UpdateWalkthroughRequest {
  title?: string;
  targetUrl?: string;
  steps?: WalkthroughStepInput[];
  authActions?: WalkthroughAction[];
}

export interface ListWalkthroughsResponse {
  walkthroughs: Walkthrough[];
}

export interface GetWalkthroughResponse {
  walkthrough: Walkthrough;
  takes: Take[];
}

export interface CreateWalkthroughResponse {
  walkthrough: Walkthrough;
}

/**
 * Manual render trigger — same path a merged PR takes, useful for the first
 * take and for retries. `diff` (unified) and PR metadata are optional; with
 * neither the director films every step.
 */
export interface RenderTakeRequest {
  prNumber?: number;
  prTitle?: string;
  diff?: string;
  summary?: string;
}

export interface RenderTakeResponse {
  take: Take;
}

export interface ProposeStepsResponse {
  steps: WalkthroughStep[];
  /** 'llm' when a model drafted them, 'heuristic' for the no-key fallback */
  proposedBy: 'llm' | 'heuristic';
}

// ---------- Billing (Stripe) ----------

export type SubscriptionStatus =
  | 'none'
  | 'trialing'
  | 'active'
  | 'past_due'
  | 'canceled';

export interface BillingStatusResponse {
  status: SubscriptionStatus;
  /** ISO timestamp; present while `status === 'trialing'` */
  trialEndsAt?: string;
  /** Products (boards) covered by the subscription */
  quantity?: number;
}

export interface CreateCheckoutSessionRequest {
  /** Where Stripe should send the user afterwards */
  successUrl?: string;
  cancelUrl?: string;
}

export interface CreateCheckoutSessionResponse {
  /** Stripe-hosted checkout URL to redirect to */
  url: string;
}

// ---------- Funnel analytics ----------

/**
 * The six funnel events instrumented server-side. Emitted once per user
 * (except walkthrough/dispatch which also carry board context).
 */
export type FunnelEventName =
  | 'signup'
  | 'first_board'
  | 'first_walkthrough'
  | 'first_comment'
  | 'first_dispatch'
  | 'conversion';

export interface FunnelSnapshotResponse {
  counts: Record<FunnelEventName, number>;
}

// ---------- GitHub webhook (passthrough types) ----------
export interface GithubPushPayload {
  ref: string;
  before: string;
  after: string;
  repository: { full_name: string };
  pusher: { name: string; email?: string };
  commits: Array<{
    id: string;
    message: string;
    author: { name: string; email: string };
    timestamp: string;
  }>;
}

/** The subset of GitHub's `pull_request` webhook payload the director needs. */
export interface GithubPullRequestPayload {
  action: string;
  number: number;
  pull_request: {
    number: number;
    title: string;
    body?: string | null;
    merged: boolean;
    merge_commit_sha?: string | null;
    base: { ref: string };
    head: { ref: string; sha: string };
    user?: { login: string };
  };
  repository: { full_name: string };
}

// ---------- Misc ----------
export interface SuccessResponse {
  ok: true;
}
