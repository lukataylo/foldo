// In-memory store of the current board's frames / comments / branches / users.
// Map-based so individual lookups are O(1); subscribe()/notify() is shallow.
// React reads via the hooks in ./useBoardStore.ts.

import type {
  Board,
  Branch,
  Comment,
  CommentReply,
  Dispatch,
  Frame,
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
  /** Most recently created/streaming dispatches; key = dispatchId */
  dispatches: Map<string, Dispatch>;
  /** mcp connection (informational) */
  mcpConnected: boolean;
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
  dispatches: new Map(),
  mcpConnected: false,
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

  /**
   * Append a reply to a comment, idempotently by reply id. A reply can reach
   * the store twice — once from the REST response and once from the WS
   * broadcast (the server doesn't except the sender) — and array appends
   * aren't idempotent like Map.set, so the dedupe lives here rather than as
   * a convention every caller must remember.
   */
  addReply(commentId: string, reply: CommentReply) {
    const c = this.snap.comments.get(commentId);
    if (!c) return;
    if (c.replies.some((r) => r.id === reply.id)) return;
    this.upsertComment({ ...c, replies: [...c.replies, reply] });
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

  setWsStatus(s: BoardSnapshot['wsStatus']) {
    if (this.snap.wsStatus !== s) this.patch({ wsStatus: s });
  }

  upsertDispatch(d: Dispatch) {
    const dispatches = new Map(this.snap.dispatches);
    dispatches.set(d.id, d);
    this.patch({ dispatches });
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
