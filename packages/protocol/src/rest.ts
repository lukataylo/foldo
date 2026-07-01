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
  ArrowFrameContent,
  FrameContent,
  FrameKind,
  ImageFrameContent,
  MarkdownFrameContent,
  StickyFrameContent,
  CaptureRequest,
  Test,
  TestTask,
  TestQuestion,
  TestTargetMode,
  TestDeliveryMode,
  TestStatus,
  TestSession,
  TestSessionCounts,
  TestTaskResult,
  TestResponseAnswer,
  RecordingMode,
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

// ---------- Tests (unmoderated UX testing) ----------

/** A task as supplied by the builder UI , server assigns id/testId/orderIndex. */
export interface TestTaskInput {
  title: string;
  instruction: string;
  successHint?: string;
  startUrl?: string;
  startRecipe?: TestTask['startRecipe'];
}

export interface CreateTestRequest {
  boardId: string;
  name: string;
  targetUrl?: string;
  targetMode?: TestTargetMode;
  intro?: string;
  recordingModes?: RecordingMode[];
  responseLimit?: number;
  tasks?: TestTaskInput[];
  questionnaire?: TestQuestion[];
}

export interface UpdateTestRequest {
  name?: string;
  targetUrl?: string;
  targetMode?: TestTargetMode;
  intro?: string;
  recordingModes?: RecordingMode[];
  questionnaire?: TestQuestion[];
  responseLimit?: number | null;
  status?: TestStatus;
}

export interface ReplaceTestTasksRequest {
  tasks: TestTaskInput[];
}

/** Test plus its session tallies, for board-level list views. */
export interface TestListItem {
  test: Test;
  sessionCounts: TestSessionCounts;
}

export interface ListTestsResponse {
  tests: TestListItem[];
}

export interface GetTestResponse {
  test: Test;
  tasks: TestTask[];
  /** Absolute foldo.dev/t/:token link */
  shareUrl: string;
}

export interface CreateTestResponse {
  test: Test;
  shareUrl: string;
}

/**
 * The public, unauthenticated view a tester gets at GET /api/t/:token.
 * Deliberately omits creator-only fields (board, token internals, limits).
 */
export interface PublicTestResponse {
  id: string;
  name: string;
  intro: string;
  status: TestStatus;
  recordingModes: RecordingMode[];
  /** Resolved delivery mode for this tester (never `auto`) */
  deliveryMode: TestDeliveryMode;
  targetUrl?: string;
  questionnaire?: TestQuestion[];
  tasks: TestTask[];
}

// ---------- Test sessions (tester runtime) ----------

export interface StartTestSessionRequest {
  recordingMode: RecordingMode;
  /** Optional self-entered name; falls back to an anonymous "Tester N". */
  testerLabel?: string;
  /** UA / viewport / locale / referrer , no PII unless volunteered. */
  testerMeta?: Record<string, unknown>;
}

export interface StartTestSessionResponse {
  sessionId: string;
  /** Bearer-style secret authorising writes to this one session only. */
  sessionToken: string;
  testerLabel: string;
}

export interface UploadRecordingResponse {
  ok: true;
  recordingDurationMs: number;
}

export interface CompleteTestSessionRequest {
  taskResults: TestTaskResult[];
  /** Answers to the followup questionnaire, if the test has one. */
  responses?: TestResponseAnswer[];
  recordingDurationMs?: number;
}

export interface CompleteTestSessionResponse {
  session: TestSession;
}

/**
 * Sent (often via navigator.sendBeacon) when a tester closes the tab before
 * finishing — lets the server mark the session `abandoned` instead of leaving
 * it dangling in `started`/`recording` forever.
 */
export interface AbandonTestSessionRequest {
  /** Session-scoped write token (sendBeacon can't set custom headers). */
  sessionToken: string;
  recordingDurationMs?: number;
}

/** Creator-side: every session recorded against a test. */
export interface ListTestSessionsResponse {
  sessions: TestSession[];
}

/** Response from POST /api/tests/:id/duplicate. */
export type DuplicateTestResponse = CreateTestResponse;

// ---------- Misc ----------
export interface SuccessResponse {
  ok: true;
}
