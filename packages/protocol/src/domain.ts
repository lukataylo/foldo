// ---------- Identifiers ----------
//
// Plain `string` today. See docs/PROTOCOL-DESIGN-IDEAS.md for the deferred
// branded-ID design (Phase 2 follow-up, ~280 cast sites of mechanical work).
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
  /**
   * ISO timestamp when the user clicked the verification link, or undefined
   * if they haven't yet. Agents + grandfathered demo accounts have no email
   * and are never required to verify.
   */
  emailVerifiedAt?: string;
  /** 'agent' for AI bot users (e.g. Claude Code) */
  kind: 'human' | 'agent';
}

// ---------- Boards ----------
export interface Board {
  id: BoardId;
  name: string;
  /** "owner/repo", the GitHub repo this board mirrors */
  repoSlug: string;
  /** Where the in-directory MCP for this repo serves the dev preview, if connected */
  devUrl?: string;
  createdAt: string; // ISO
  /**
   * Soft-delete marker. NULL/undefined for live boards. Set to an ISO
   * timestamp when the owner archives the board via DELETE /api/boards/:id.
   * Archived boards are filtered out of the default /api/boards and /api/home
   * responses; pass `?includeArchived=true` to see them and offer Restore.
   */
  archivedAt?: string | null;
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
export type FrameKind =
  | 'app'
  | 'markdown'
  | 'sticky'
  | 'arrow'
  | 'image'
  | 'walkthrough';

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
  /** URL the iframe should load, usually the sample app with query params */
  iframeUrl?: string;
}

export interface MarkdownFrameContent {
  kind: 'markdown';
  docPath: string;
  title: string;
  /** Inline body, used when not loading from /api/sources */
  body?: string;
  /**
   * Per-line authorship. Indexed by line number (0-based) of the body.
   * Stored sparsely, only lines that have been edited from their seeded
   * state carry an entry. Used by the canvas to draw a coloured gutter
   * marker next to each line in the author's brand colour.
   */
  lineAuthors?: Record<string, { authorUserId: string; editedAt: string }>;
  /** ISO timestamp of the last edit. Surfaced as "edited Xm ago". */
  lastEditedAt?: string;
  /** User id of the most recent editor. */
  lastEditedBy?: string;
}

/**
 * A free-text post-it the user can drop anywhere on the canvas. Five colours,
 * chosen to feel like physical Post-its over a kraft-paper background.
 */
export type StickyColor = 'yellow' | 'pink' | 'green' | 'blue' | 'lilac';

export interface StickyFrameContent {
  kind: 'sticky';
  body: string;
  color?: StickyColor;
}

/**
 * A simple straight arrow. `from`/`to` are world coordinates relative to the
 * frame's `position` (which is the top-left of the arrow's bounding box).
 * The frame's `size` is the bounding box.
 */
export interface ArrowFrameContent {
  kind: 'arrow';
  from: { x: number; y: number };
  to: { x: number; y: number };
  color?: string;
  thickness?: number;
}

/**
 * An uploaded image. The MVP stores the bytes as a base64 data URL inside the
 * frame's content_json. Production-grade storage (S3 / Railway volume) can
 * replace `dataUrl` with `url` later without changing call sites; readers
 * should prefer `url` if both are set.
 */
export interface ImageFrameContent {
  kind: 'image';
  dataUrl?: string;
  url?: string;
  alt?: string;
  caption?: string;
}

/**
 * A rendered product walkthrough on the board — the core artifact of the
 * living-documentation pivot. Each merged PR produces a new take; the frame
 * shows the take's narrated video (or stills + captions when capture had to
 * degrade) and lands beside its predecessor so a stakeholder can see what
 * changed without reading a changelog.
 */
export interface WalkthroughFrameContent {
  kind: 'walkthrough';
  walkthroughId: WalkthroughId;
  takeId: TakeId;
  title: string;
  status: TakeStatus;
  prNumber?: number;
  prTitle?: string;
  /** Director's plain-language note of what changed in this take */
  summary?: string;
  videoUrl?: string;
  posterUrl?: string;
  captionsUrl?: string;
  durationMs?: number;
  /** Per-step verdicts vs the predecessor take */
  stepDiffs?: StepDiff[];
  /** Steps whose video capture failed and degraded to a still + caption */
  degradedStepIds?: WalkthroughStepId[];
}

export type FrameContent =
  | AppFrameContent
  | MarkdownFrameContent
  | StickyFrameContent
  | ArrowFrameContent
  | ImageFrameContent
  | WalkthroughFrameContent;

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

// ---------- Sources (markdown / code at a commit) ----------
export interface SourceFile {
  repoSlug: string;
  commitSha: CommitSha;
  path: string;
  body: string;
  contentType: 'markdown' | 'tsx' | 'ts' | 'jsx' | 'js' | 'css' | 'json' | 'other';
  updatedAt: string;
}

// ---------- Walkthroughs (living documentation) ----------
//
// A Walkthrough is the maintained artifact of the pivot: a spec of narrated
// steps filmed against a running deployment of the product. The director
// service re-films it on every merged PR, re-rendering only the steps the
// diff touched (unchanged segments are reused byte-for-byte) and posting the
// result to the board as a `walkthrough` frame beside its predecessor.

export type WalkthroughId = string;
export type WalkthroughStepId = string;
export type TakeId = string;

/**
 * One Playwright action inside a step. Selectors are visible-text locators
 * only ("grounded" capture) — never CSS/XPath — so the spec survives markup
 * refactors and stays writable by non-engineers.
 */
export type WalkthroughAction =
  | { kind: 'goto'; url: string }
  | { kind: 'click'; text: string }
  | { kind: 'fill'; label: string; value: string }
  | { kind: 'hover'; text: string }
  | { kind: 'press'; key: string }
  | { kind: 'scroll'; y: number }
  | { kind: 'wait'; ms: number };

export interface WalkthroughStep {
  id: WalkthroughStepId;
  title: string;
  /** Narration script for this step; spoken by TTS and shown as captions */
  narration: string;
  actions: WalkthroughAction[];
  /** Target duration of the rendered segment */
  durationMs: number;
}

export interface Walkthrough {
  id: WalkthroughId;
  boardId: BoardId;
  title: string;
  /** Base URL of the deployed/preview app the director films */
  targetUrl: string;
  steps: WalkthroughStep[];
  /** Optional auth recipe run before the first step (login walls) */
  authActions?: WalkthroughAction[];
  createdAt: string;
  updatedAt: string;
}

export type StepDiffStatus = 'unchanged' | 'changed' | 'added' | 'removed';

/** The director's per-step verdict for one merged PR. */
export interface StepDiff {
  stepId: WalkthroughStepId;
  status: StepDiffStatus;
  /** One-line reason a stakeholder can read ("CTA label changed to …") */
  reason: string;
}

export type TakeStatus =
  | 'queued'
  | 'capturing'
  | 'rendering'
  | 'ready'
  | 'degraded'
  | 'error';

/** How one step's segment in a take was produced. */
export interface TakeSegment {
  stepId: WalkthroughStepId;
  /** Content fingerprint of the step spec (id+narration+actions+duration) */
  fingerprint: string;
  /** sha256 of the segment bytes; equal shas ⇒ byte-identical reuse */
  segmentSha256?: string;
  /** reused = copied from parent take; still = degraded to poster+caption */
  source: 'reused' | 'rebuilt' | 'still';
  captureWarnings?: string[];
}

/** One rendering of a walkthrough, usually triggered by a merged PR. */
export interface Take {
  id: TakeId;
  walkthroughId: WalkthroughId;
  parentTakeId?: TakeId;
  prNumber?: number;
  prTitle?: string;
  /** Director's plain-language summary of what changed */
  summary?: string;
  status: TakeStatus;
  stepDiffs: StepDiff[];
  segments: TakeSegment[];
  masterSha256?: string;
  videoUrl?: string;
  posterUrl?: string;
  captionsUrl?: string;
  durationMs?: number;
  /** The board frame this take rendered into */
  frameId?: FrameId;
  createdAt: string;
  finishedAt?: string;
  errorMessage?: string;
}

// ---------- API errors ----------
export interface ApiError {
  error: string;
  code: string;
  details?: Record<string, unknown>;
}
