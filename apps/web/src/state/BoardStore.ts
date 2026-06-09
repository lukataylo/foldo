// In-memory store of the current board's frames / comments / branches / users / presence.
// Map-based so individual lookups are O(1); subscribe()/notify() is shallow.
// React reads via the hooks in ./useBoardStore.ts.

import type {
  Board,
  Branch,
  Comment,
  Dispatch,
  Frame,
  PresenceUser,
  TestId,
  User,
  UserId,
} from '@foldo/protocol';

export interface BoardSnapshot {
  /** True once the initial REST/WS welcome arrives. */
  hydrated: boolean;
  /** "offline" demo mode, using local mock data because cloud was unreachable. */
  offline: boolean;
  /** WS connection status; informs the top-bar indicator. */
  wsStatus: 'connecting' | 'open' | 'closed' | 'reconnecting' | 'offline';
  /** The "me" user id given by the server welcome (or by getMe). */
  meUserId: UserId | null;
  board: Board | null;
  frames: Map<string, Frame>;
  comments: Map<string, Comment>;
  branches: Map<string, Branch>;
  users: Map<UserId, User>;
  presence: Map<UserId, PresenceUser>;
  /** Most recently created/streaming dispatches; key = dispatchId */
  dispatches: Map<string, Dispatch>;
  /** mcp connection (informational) */
  mcpConnected: boolean;
  /**
   * Tests with a session in progress right now — a transient "someone is
   * testing" signal driven by `test.session.started` / `test.session.completed`
   * WS messages. The completed session's actual frame still arrives via the
   * normal `frame.added` path.
   */
  activeTestSessions: Set<TestId>;
  /**
   * Bumped whenever a `test.created` / `test.updated` / `test.deleted`
   * broadcast arrives. Tests themselves live in TestsPanel-local state
   * (fetched via REST); this counter just tells an open panel to refetch
   * so collaborator edits show up live.
   */
  testsRevision: number;
}

type Listener = () => void;

const empty = (): BoardSnapshot => ({
  hydrated: false,
  offline: false,
  wsStatus: 'closed',
  meUserId: null,
  board: null,
  frames: new Map(),
  comments: new Map(),
  branches: new Map(),
  users: new Map(),
  presence: new Map(),
  dispatches: new Map(),
  mcpConnected: false,
  activeTestSessions: new Set(),
  testsRevision: 0,
});

class BoardStoreImpl {
  private snap: BoardSnapshot = empty();
  private listeners = new Set<Listener>();

  getSnapshot(): BoardSnapshot {
    return this.snap;
  }

  subscribe(l: Listener): () => void {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }

  /** Replace the snapshot wholesale and notify. */
  set(next: BoardSnapshot) {
    this.snap = next;
    this.emit();
  }

  /**
   * Apply a shallow patch, frames/comments/etc Maps are kept by reference if
   * untouched so memoised selectors stay stable. Always swaps the top-level
   * snapshot object so subscribers re-evaluate.
   */
  patch(p: Partial<BoardSnapshot>) {
    this.snap = { ...this.snap, ...p };
    this.emit();
  }

  /** Replace a single frame and produce a new frames Map. */
  upsertFrame(frame: Frame) {
    const frames = new Map(this.snap.frames);
    frames.set(frame.id, frame);
    this.patch({ frames });
  }

  removeFrame(frameId: string) {
    if (!this.snap.frames.has(frameId)) return;
    const frames = new Map(this.snap.frames);
    frames.delete(frameId);
    this.patch({ frames });
  }

  moveFrame(frameId: string, x: number, y: number) {
    const f = this.snap.frames.get(frameId);
    if (!f) return;
    const frames = new Map(this.snap.frames);
    frames.set(frameId, { ...f, position: { x, y } });
    this.patch({ frames });
  }

  upsertComment(c: Comment) {
    const comments = new Map(this.snap.comments);
    comments.set(c.id, c);
    this.patch({ comments });
  }

  removeComment(commentId: string) {
    if (!this.snap.comments.has(commentId)) return;
    const comments = new Map(this.snap.comments);
    comments.delete(commentId);
    this.patch({ comments });
  }

  upsertBranch(b: Branch) {
    const branches = new Map(this.snap.branches);
    branches.set(b.id, b);
    this.patch({ branches });
  }

  upsertPresence(p: PresenceUser) {
    const presence = new Map(this.snap.presence);
    presence.set(p.userId, p);
    this.patch({ presence });
  }

  removePresence(userId: UserId) {
    if (!this.snap.presence.has(userId)) return;
    const presence = new Map(this.snap.presence);
    const existing = presence.get(userId);
    if (existing) {
      // keep the user record but mark offline for the avatar strip
      presence.set(userId, { ...existing, online: false, cursor: undefined });
    }
    this.patch({ presence });
  }

  setWsStatus(s: BoardSnapshot['wsStatus']) {
    if (this.snap.wsStatus !== s) this.patch({ wsStatus: s });
  }

  upsertDispatch(d: Dispatch) {
    const dispatches = new Map(this.snap.dispatches);
    dispatches.set(d.id, d);
    this.patch({ dispatches });
  }

  /** Mark a test as having a session in progress (transient indicator). */
  markTestSessionActive(testId: TestId) {
    if (this.snap.activeTestSessions.has(testId)) return;
    const activeTestSessions = new Set(this.snap.activeTestSessions);
    activeTestSessions.add(testId);
    this.patch({ activeTestSessions });
  }

  /** Signal that the board's User Tests changed (created/updated/deleted). */
  markTestsChanged() {
    this.patch({ testsRevision: this.snap.testsRevision + 1 });
  }

  /** Clear the in-progress indicator for a test. */
  markTestSessionInactive(testId: TestId) {
    if (!this.snap.activeTestSessions.has(testId)) return;
    const activeTestSessions = new Set(this.snap.activeTestSessions);
    activeTestSessions.delete(testId);
    this.patch({ activeTestSessions });
  }

  reset() {
    this.snap = empty();
    this.emit();
  }

  private emit() {
    for (const l of this.listeners) l();
  }
}

export const boardStore = new BoardStoreImpl();
export type BoardStore = typeof boardStore;
