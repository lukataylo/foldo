// REST API — request/response schemas. All endpoints under /api.
// Auth: Authorization: Bearer <userId-token> (demo) or session cookie.

import type {
  Board,
  Branch,
  Comment,
  CommentAnchor,
  CommentPin,
  CommentReply,
  CommentTarget,
  Dispatch,
  Frame,
  RecipeStep,
  SourceFile,
  User,
  VariantOverrides,
  AppFrameContent,
  MarkdownFrameContent,
  CaptureRequest,
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
  kind: 'app' | 'markdown';
  position: { x: number; y: number };
  size: { width: number; height: number };
  content: AppFrameContent | MarkdownFrameContent;
  parentFrameId?: string;
}

export interface MoveFrameRequest {
  position: { x: number; y: number };
}

export interface UpdateFrameRequest {
  position?: { x: number; y: number };
  size?: { width: number; height: number };
  content?: Partial<AppFrameContent> | Partial<MarkdownFrameContent>;
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

// ---------- Captures (extension) ----------
export interface CreateCaptureRequest extends CaptureRequest {}
export interface CreateCaptureResponse {
  frame: Frame;
}

// ---------- GitHub webhook (passthrough type) ----------
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

// ---------- Misc ----------
export interface SuccessResponse {
  ok: true;
}
