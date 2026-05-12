// ---------- Identifiers ----------
export type BoardId = string;
export type FrameId = string;
export type CommentId = string;
export type DispatchId = string;
export type UserId = string;
export type BranchId = string;
export type CommitSha = string;

// ---------- Users ----------
export interface User {
  id: UserId;
  name: string;
  initial: string;
  color: string; // hex
  email?: string;
  /** 'agent' for AI bot users (e.g. Claude Code) */
  kind: 'human' | 'agent';
}

// ---------- Boards ----------
export interface Board {
  id: BoardId;
  name: string;
  /** "owner/repo" — the GitHub repo this board mirrors */
  repoSlug: string;
  /** Where the in-directory MCP for this repo serves the dev preview, if connected */
  devUrl?: string;
  createdAt: string; // ISO
}

// ---------- Branches ----------
export interface Branch {
  id: BranchId;
  boardId: BoardId;
  name: string;
  authoredBy: 'human' | 'agent';
  authorUserId: UserId;
  agentName?: string;
  /** Display color */
  color: string;
  /** Latest commit on this branch */
  headSha: CommitSha;
  createdAt: string;
  updatedAt: string;
}

// ---------- Commits (lightweight metadata) ----------
export interface Commit {
  sha: CommitSha;
  branchId: BranchId;
  message: string;
  authorUserId: UserId;
  parentSha?: CommitSha;
  createdAt: string;
}

// ---------- Frames ----------
export type FrameKind = 'app' | 'markdown';

export type Variant = 'baseline' | 'cta-revamp' | 'pro-highlight';

export interface RecipeStep {
  action: 'goto' | 'click' | 'fill' | 'wait' | 'hover' | 'scroll';
  target?: string;
  value?: string;
}

export interface VariantOverrides {
  ctaLabel?: string;
  ctaSubtext?: string;
  proGradientToned?: boolean;
}

export interface AppFrameContent {
  kind: 'app';
  variant: Variant;
  route: string;
  viewport: { width: number; height: number };
  recipe?: RecipeStep[];
  stateLabel?: string;
  overrides?: VariantOverrides;
  /** URL the iframe should load — usually the sample app with query params */
  iframeUrl?: string;
}

export interface MarkdownFrameContent {
  kind: 'markdown';
  docPath: string;
  title: string;
  /** Inline body, used when not loading from /api/sources */
  body?: string;
}

export type FrameContent = AppFrameContent | MarkdownFrameContent;

export interface Frame {
  id: FrameId;
  boardId: BoardId;
  kind: FrameKind;
  branchId: BranchId;
  commitSha: CommitSha;
  commitMessage: string;
  age: string;
  position: { x: number; y: number };
  size: { width: number; height: number };
  content: FrameContent;
  parentFrameId?: FrameId;
  /** Frame produced by a Claude Code dispatch */
  generatedByDispatchId?: DispatchId;
  /** Coming from extension capture, no repo origin */
  capturedFromUrl?: string;
  createdAt: string;
  updatedAt: string;
}

// ---------- Comments ----------
export interface CommentPin {
  /** Fractional coords relative to frame interior, in [0..1] */
  x: number;
  y: number;
}

export interface CommentAnchor {
  /** For markdown frames */
  sectionId: string;
  lineStart?: number;
  lineEnd?: number;
}

export interface CommentTarget {
  /** Component / DOM target, for app frames */
  elementLabel?: string;
  elementSelector?: string;
  elementFile?: string;
  elementLine?: number;
}

export interface CommentReply {
  id: string;
  authorUserId: UserId;
  authorName: string;
  authorInitial: string;
  authorColor: string;
  text: string;
  createdAt: string;
}

export interface Comment {
  id: CommentId;
  boardId: BoardId;
  frameId: FrameId;
  authorUserId: UserId;
  authorName: string;
  authorInitial: string;
  authorColor: string;
  text: string;
  createdAt: string;
  updatedAt: string;
  resolved: boolean;
  resolvedByUserId?: UserId;
  resolvedAt?: string;
  pin?: CommentPin;
  anchor?: CommentAnchor;
  target?: CommentTarget;
  replies: CommentReply[];
}

// ---------- Dispatches ----------
export type DispatchStatus =
  | 'queued'
  | 'sending'
  | 'running'
  | 'done'
  | 'error'
  | 'cancelled';

export interface DispatchEvent {
  ts: string;
  level: 'info' | 'warn' | 'error';
  message: string;
}

export interface Dispatch {
  id: DispatchId;
  boardId: BoardId;
  frameId: FrameId;
  branchId: BranchId;
  /** The user who initiated the edit */
  initiatorUserId: UserId;
  /** Selected element for app frames; doc target for markdown frames */
  target: CommentTarget;
  /** Optional commitSha if a specific state-replay is required */
  baseCommitSha: CommitSha;
  intent: string;
  status: DispatchStatus;
  /** Streaming log lines */
  events: DispatchEvent[];
  /** Resulting frame produced after success */
  resultFrameId?: FrameId;
  resultCommitSha?: CommitSha;
  createdAt: string;
  startedAt?: string;
  finishedAt?: string;
  errorMessage?: string;
}

// ---------- Presence (multiplayer) ----------
export interface PresenceUser {
  userId: UserId;
  name: string;
  initial: string;
  color: string;
  online: boolean;
  lastSeenAt: string;
  cursor?: PresenceCursor;
  selection?: PresenceSelection;
  /** When following another user's viewport */
  followingUserId?: UserId;
  /** Most-recently-broadcast viewport — used by follow-me to mirror */
  viewport?: { x: number; y: number; zoom: number };
}

export interface PresenceCursor {
  /** World coordinates on the canvas */
  x: number;
  y: number;
  /** If hovering over a frame */
  frameId?: FrameId;
}

export interface PresenceSelection {
  frameId: FrameId;
  elementSelector?: string;
}

// ---------- Sources (markdown / code at a commit) ----------
export interface SourceFile {
  repoSlug: string;
  commitSha: CommitSha;
  path: string;
  body: string;
  contentType: 'markdown' | 'tsx' | 'ts' | 'jsx' | 'js' | 'css' | 'json' | 'other';
  updatedAt: string;
}

// ---------- Captures (extension) ----------
export interface CaptureRequest {
  url: string;
  viewport: { width: number; height: number };
  title: string;
  /** Base64 PNG, optional */
  screenshot?: string;
  /** Serialised HTML, optional */
  domSnapshot?: string;
  capturedByUserId: UserId;
  boardId: BoardId;
}

// ---------- API errors ----------
export interface ApiError {
  error: string;
  code: string;
  details?: Record<string, unknown>;
}
