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
  /** "owner/repo", the GitHub repo this board mirrors */
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
/**
 * Frame kind. Built-in kinds are listed below as the `BuiltinFrameKind` union;
 * the wire type is widened to `string` so plugins can register their own
 * (e.g. "html", "table") without protocol bumps. Servers store this opaquely;
 * the canvas renders whichever plugin claims the kind.
 */
export type BuiltinFrameKind =
  | 'app'
  | 'markdown'
  | 'sticky'
  | 'arrow'
  | 'image'
  | 'test_summary'
  | 'test_session';

export type FrameKind = BuiltinFrameKind | (string & {});

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
 * The hub frame for an unmoderated test on the canvas — aggregate stats that
 * session frames cluster beneath. Defined in full in the "Tests" section.
 */
export interface TestSummaryFrameContent {
  kind: 'test_summary';
  testId: TestId;
  testName: string;
  shareToken: string;
  status: TestStatus;
  totalSessions: number;
  completedSessions: number;
  taskStats: TestTaskStat[];
}

/** One recorded session, rendered as a frame on the canvas. */
export interface TestSessionFrameContent {
  kind: 'test_session';
  testId: TestId;
  sessionId: TestSessionId;
  testerLabel: string;
  recordingMode: RecordingMode;
  recordingUrl?: string;
  recordingDurationMs?: number;
  taskResults: TestTaskResult[];
  responses?: TestResponseAnswer[];
  transcript?: TranscriptCue[];
  transcriptStatus: TranscriptStatus;
  synthesis?: TestSessionSynthesis;
  completedAt?: string;
}

export interface HtmlFrameContent {
  kind: 'html';
  /** Sanitised HTML body (host runs DOMPurify before rendering). */
  html: string;
}

export type FrameContent =
  | AppFrameContent
  | MarkdownFrameContent
  | StickyFrameContent
  | ArrowFrameContent
  | ImageFrameContent
  | TestSummaryFrameContent
  | TestSessionFrameContent
  | HtmlFrameContent;

/**
 * Visual / layout overrides applied by the Design plugin. All fields are
 * optional; the canvas reads `frame.style` and merges it onto the outer
 * wrapper via CSS variables, so a plugin can ship without persisting style
 * and an existing frame can opt in to one field at a time.
 */
export interface FrameStyle {
  /** Background fill. Any CSS color. */
  fill?: string;
  /** Border config. `width:0` removes the border. */
  border?: {
    width?: number;
    color?: string;
    radius?: number;
    style?: 'solid' | 'dashed' | 'dotted';
  };
  /** Padding inside the frame's content box. */
  padding?: { top?: number; right?: number; bottom?: number; left?: number };
  /** Text styling applied to the frame's body (where it makes sense). */
  font?: {
    family?: string;
    size?: number;
    weight?: number;
    lineHeight?: number;
    color?: string;
  };
  /** Opacity 0..1. */
  opacity?: number;
}

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
  /** Stacking order (higher = on top of lower). Default 0. */
  z?: number;
  /** Hidden from the canvas (still in the layers panel). */
  hidden?: boolean;
  /** Pointer interaction is disabled on this frame. */
  locked?: boolean;
  /** Design-plugin styling overrides. */
  style?: FrameStyle;
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
  /** Most-recently-broadcast viewport, used by follow-me to mirror */
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

// ---------- Tests (unmoderated UX testing) ----------
export type TestId = string;
export type TestTaskId = string;
export type TestSessionId = string;

export type TestStatus = 'draft' | 'live' | 'closed';

/**
 * How a tester reaches the app under test.
 *   - `auto`         , server probes the target and resolves to iframe/handoff per session
 *   - `iframe`       , target is embedded in an iframe with the task banner around it
 *   - `handoff`      , target opens in a new tab; screen recording spans both
 *   - `dom_snapshot` , a frozen DOM snapshot is served (local-only apps a tester can't reach)
 */
export type TestTargetMode = 'auto' | 'iframe' | 'handoff' | 'dom_snapshot';

/** Resolved mode for a given session (never `auto`). */
export type TestDeliveryMode = 'iframe' | 'handoff' | 'dom_snapshot';

/** What a tester is asked to capture. The creator allows a subset; the tester picks. */
export type RecordingMode = 'screen_voice' | 'voice_only' | 'screen_only';

export interface TestTask {
  id: TestTaskId;
  testId: TestId;
  /** 0-based position in the task list */
  orderIndex: number;
  title: string;
  /** Banner text shown to the tester while doing this task */
  instruction: string;
  /** Optional , what "done" looks like, a creator analysis aid */
  successHint?: string;
  /** Optional per-task starting route */
  startUrl?: string;
  /** Optional , reuses the recipe system to set up starting state */
  startRecipe?: RecipeStep[];
}

export type TestQuestionKind =
  | 'short_text'
  | 'long_text'
  | 'single_choice'
  | 'multi_choice'
  | 'rating';

export interface TestQuestion {
  id: string;
  kind: TestQuestionKind;
  prompt: string;
  /** For single_choice / multi_choice */
  choices?: string[];
  required?: boolean;
}

export interface Test {
  id: TestId;
  boardId: BoardId;
  name: string;
  /** The deployed app URL; absent for `dom_snapshot` mode */
  targetUrl?: string;
  targetMode: TestTargetMode;
  /** Probe result , whether the target allows being iframed. null = unknown/not probed */
  frameable?: boolean | null;
  /** Object-storage key of the frozen DOM (dom_snapshot mode) */
  domSnapshotKey?: string;
  /** Welcome / context shown to the tester before the task loop */
  intro: string;
  /** Recording modes the tester may choose from */
  recordingModes: RecordingMode[];
  questionnaire?: TestQuestion[];
  status: TestStatus;
  /** Short base62 token , foldo.dev/t/:token */
  shareToken: string;
  /** Optional cap on sessions; auto-closes when reached */
  responseLimit?: number;
  /** The hub frame on the canvas that results cluster under */
  summaryFrameId?: FrameId;
  createdByUserId: UserId;
  createdAt: string;
  updatedAt: string;
}

export interface TestSessionCounts {
  total: number;
  completed: number;
}

export type TestSessionStatus =
  | 'started'
  | 'recording'
  | 'completed'
  | 'abandoned';

export type TestTaskOutcome = 'completed' | 'skipped' | 'gave_up';

export interface TestTaskResult {
  taskId: TestTaskId;
  outcome: TestTaskOutcome;
  durationMs: number;
  /** Offset into the recording where this task starts */
  recordingOffsetMs: number;
}

/** Aggregate outcome of one task across every completed session of a test. */
export interface TestTaskStat {
  taskId: TestTaskId;
  title: string;
  completed: number;
  skipped: number;
  gaveUp: number;
  /** Median time-on-task across sessions, ms. 0 when there's no data. */
  medianDurationMs: number;
}

export interface TranscriptCue {
  startMs: number;
  endMs: number;
  text: string;
}

export interface TestResponseAnswer {
  questionId: string;
  /** string for text/rating, string[] for multi_choice */
  value: string | string[];
}

export type TranscriptStatus =
  | 'pending'
  | 'processing'
  | 'done'
  | 'failed'
  | 'skipped';

export type IssueSeverity = 'low' | 'medium' | 'high';

/** One problem an AI pass extracted from a session, anchored to the recording. */
export interface TestSessionIssue {
  severity: IssueSeverity;
  text: string;
  taskId?: TestTaskId;
  /** Offset into the recording the issue refers to, ms. */
  atMs?: number;
}

/** AI-generated synthesis of a single session. */
export interface TestSessionSynthesis {
  summary: string;
  issues: TestSessionIssue[];
  /** Provider/model that produced this, or 'stub' when no provider is configured. */
  generatedBy: string;
  generatedAt: string;
}

export interface TestSession {
  id: TestSessionId;
  testId: TestId;
  status: TestSessionStatus;
  recordingMode: RecordingMode;
  /** Anonymous label , "Tester 4" , or an optional self-entered name */
  testerLabel: string;
  /** UA / viewport / locale / referrer. No PII unless volunteered */
  testerMeta?: Record<string, unknown>;
  consentAt?: string;
  /** Playback URL for the recording (signed); absent until upload completes */
  recordingUrl?: string;
  recordingDurationMs?: number;
  transcript?: TranscriptCue[];
  transcriptStatus: TranscriptStatus;
  responses?: TestResponseAnswer[];
  taskResults?: TestTaskResult[];
  /** AI synthesis of this session, once a synthesis pass has run. */
  synthesis?: TestSessionSynthesis;
  resultFrameId?: FrameId;
  startedAt: string;
  completedAt?: string;
}

// ---------- API errors ----------
export interface ApiError {
  error: string;
  code: string;
  details?: Record<string, unknown>;
}
