// Comment-thread handlers extracted from App.tsx. The popover *state* still
// lives in App because it's read from ~8 places (Esc key, route deep-links,
// background click, etc.); the *handlers* are colocated here. App passes the
// setters in so this hook stays decoupled from App's other state.
//
// Phase-4 plan: this becomes the implementation of the `core/comments`
// plugin once the plugin substrate lands.

import { useCallback } from 'react';
import type {
  Board,
  Comment,
  CreateCommentRequest,
  Frame,
  TestSessionIssue,
  User,
  UserId,
} from '@foldo/protocol';
import {
  createComment as apiCreateComment,
  deleteComment as apiDeleteComment,
  replyToComment as apiReplyToComment,
  updateComment as apiUpdateComment,
} from '../api/comments';
import { boardStore } from '../state/useBoardStore';
import type { Route } from '../routing/Router';
import type { SelectedElement, Tool } from '../types';

const MOCK_BOARD_FALLBACK = 'board-acme-landing';

export interface PopoverState {
  frameId: string;
  commentId: string;
  composing?: boolean;
}

export interface CommentHandlersOptions {
  board: Board | null;
  frames: Map<string, Frame>;
  comments: Map<string, Comment>;
  users: Map<UserId, User>;
  meUserId: UserId | null;
  /** Demo user id used when no real account is in scope. */
  demoUserId: string;
  /** "offline" if the cloud server was unreachable on boot. */
  offline: boolean;

  // Setters into App's state.
  setCommentPopover: (p: PopoverState | null) => void;
  setSelectedElement: (sel: SelectedElement | null) => void;
  setInitialIntent: (s: string | undefined) => void;
  setTool: (t: Tool) => void;

  // For comment-popover deep-linking.
  navigate: (route: Route) => void;

  /** Show an ephemeral toast (used on network failures). */
  pushToast: (msg: string) => void;

  /** Read by handleDropPin to know the current popover (the open one already). */
  commentPopover: PopoverState | null;
}

export interface CommentHandlersApi {
  handleDropPin: (frameId: string, xRel: number, yRel: number) => Promise<void>;
  handleCommentClick: (frameId: string, comment: Comment) => void;
  onMakeEditFromComment: () => void;
  onMakeEditFromIssue: (frame: Frame, issue: TestSessionIssue) => Promise<void>;
  onReplyToComment: (commentId: string, text: string) => Promise<void>;
  onResolveComment: (commentId: string) => Promise<void>;
  onDeleteComment: (commentId: string) => Promise<void>;
}

export function useCommentHandlers({
  board,
  frames,
  comments,
  users,
  meUserId,
  demoUserId,
  offline,
  setCommentPopover,
  setSelectedElement,
  setInitialIntent,
  setTool,
  navigate,
  pushToast,
  commentPopover,
}: CommentHandlersOptions): CommentHandlersApi {
  const handleDropPin = useCallback(
    async (frameId: string, xRel: number, yRel: number): Promise<void> => {
      // Render optimistically so the pin appears under the cursor instantly,
      // before any network round-trip. The popover opens in compose mode so the
      // user can type the body straight away.
      const me = meUserId ? users.get(meUserId) : undefined;
      const now = new Date().toISOString();
      const tempId = `c-local-${Date.now()}`;
      const optimistic: Comment = {
        id: tempId,
        boardId: board?.id ?? MOCK_BOARD_FALLBACK,
        frameId,
        authorUserId: me?.id ?? demoUserId,
        authorName: me?.name ?? 'You',
        authorInitial: me?.initial ?? 'Y',
        authorColor: me?.color ?? '#7fd49a',
        text: '',
        createdAt: now,
        updatedAt: now,
        resolved: false,
        pin: { x: xRel, y: yRel },
        replies: [],
      };
      boardStore.upsertComment(optimistic);
      setCommentPopover({ frameId, commentId: tempId, composing: true });
      setTool('select');

      if (offline) return; // local-only, no swap needed.
      try {
        const body: CreateCommentRequest = {
          boardId: board?.id ?? '',
          frameId,
          text: '',
          pin: { x: xRel, y: yRel },
        };
        const c = await apiCreateComment(body);
        // Swap the optimistic comment for the server-issued one.
        boardStore.removeComment(tempId);
        boardStore.upsertComment(c);
        setCommentPopover({ frameId, commentId: c.id, composing: true });
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn('[foldo] create comment failed', e);
        boardStore.removeComment(tempId);
        setCommentPopover(null);
        pushToast('Failed to add comment');
      }
    },
    [
      offline,
      board,
      meUserId,
      users,
      demoUserId,
      setCommentPopover,
      setTool,
      pushToast,
    ],
  );

  const handleCommentClick = useCallback(
    (frameId: string, comment: Comment): void => {
      setCommentPopover({ frameId, commentId: comment.id });
      if (board) {
        navigate({
          boardId: board.id,
          frameId,
          commentId: comment.id,
        });
      }
    },
    [navigate, board, setCommentPopover],
  );

  const onMakeEditFromComment = useCallback((): void => {
    if (!commentPopover) return;
    const c = comments.get(commentPopover.commentId);
    if (!c) return;
    const f = frames.get(c.frameId);
    if (!f) return;
    if (c.target?.elementLabel && f.kind === 'app') {
      // Synthesise a small highlight rect around the pin if we have one.
      const rect = c.pin
        ? {
            x: c.pin.x * f.size.width - 18,
            y: c.pin.y * f.size.height - 18,
            width: 36,
            height: 36,
          }
        : { x: 0, y: 0, width: 0, height: 0 };
      setSelectedElement({
        frameId: f.id,
        label: c.target.elementLabel,
        file: c.target.elementFile ?? 'src/components/Pricing.tsx',
        line: c.target.elementLine ?? 0,
        currentSource: c.target.elementLabel,
        rect,
      });
    } else if (
      c.anchor &&
      f.kind === 'markdown' &&
      f.content.kind === 'markdown'
    ) {
      setSelectedElement({
        frameId: f.id,
        label: `${f.content.docPath} · ${c.anchor.sectionId} · L${c.anchor.lineStart ?? 1}`,
        file: f.content.docPath,
        line: c.anchor.lineStart ?? 1,
        currentSource: c.text,
        rect: { x: 0, y: 0, width: 0, height: 0 },
      });
    }
    setInitialIntent(c.text);
    setCommentPopover(null);
  }, [
    commentPopover,
    comments,
    frames,
    setSelectedElement,
    setInitialIntent,
    setCommentPopover,
  ]);

  // "Make this an edit" from a test_session synthesis issue: drop a comment on
  // the session frame carrying the issue text so it flows into the existing
  // comment → dispatch loop.
  const onMakeEditFromIssue = useCallback(
    async (frame: Frame, issue: TestSessionIssue): Promise<void> => {
      const text = `From testing — ${issue.text}`;
      if (offline) {
        const optimistic: Comment = {
          id: `c-local-${Date.now()}`,
          boardId: board?.id ?? MOCK_BOARD_FALLBACK,
          frameId: frame.id,
          authorUserId: demoUserId,
          authorName: 'You',
          authorInitial: 'Y',
          authorColor: '#7fd49a',
          text,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          resolved: false,
          replies: [],
        };
        boardStore.upsertComment(optimistic);
        pushToast('Issue added as a comment');
        return;
      }
      try {
        const body: CreateCommentRequest = {
          boardId: board?.id ?? '',
          frameId: frame.id,
          text,
        };
        const c = await apiCreateComment(body);
        boardStore.upsertComment(c);
        pushToast('Issue added as a comment');
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn('[foldo] make-edit-from-issue failed', e);
        pushToast('Failed to add comment');
      }
    },
    [offline, board, demoUserId, pushToast],
  );

  const onReplyToComment = useCallback(
    async (commentId: string, text: string): Promise<void> => {
      if (offline) {
        const c = comments.get(commentId);
        if (!c) return;
        const reply = {
          id: `r-local-${Date.now()}`,
          authorUserId: demoUserId,
          authorName: 'You',
          authorInitial: 'Y',
          authorColor: '#7fd49a',
          text,
          createdAt: new Date().toISOString(),
        };
        boardStore.upsertComment({
          ...c,
          replies: [...c.replies, reply],
        });
        return;
      }
      try {
        const r = await apiReplyToComment(commentId, { text });
        const c = boardStore.getSnapshot().comments.get(commentId);
        if (c) boardStore.upsertComment({ ...c, replies: [...c.replies, r] });
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn('[foldo] reply failed', e);
      }
    },
    [offline, comments, demoUserId],
  );

  const onResolveComment = useCallback(
    async (commentId: string): Promise<void> => {
      const c = boardStore.getSnapshot().comments.get(commentId);
      if (!c) return;
      const next = !c.resolved;
      if (offline) {
        boardStore.upsertComment({ ...c, resolved: next });
        return;
      }
      try {
        const updated = await apiUpdateComment(commentId, { resolved: next });
        boardStore.upsertComment(updated);
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn('[foldo] resolve failed', e);
      }
    },
    [offline],
  );

  const onDeleteComment = useCallback(
    async (commentId: string): Promise<void> => {
      const c = boardStore.getSnapshot().comments.get(commentId);
      if (!c) return;
      boardStore.removeComment(commentId);
      setCommentPopover(null);
      if (offline) return;
      try {
        await apiDeleteComment(commentId);
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn('[foldo] delete comment failed', e);
        // Re-insert on failure so UI doesn't silently lose state.
        boardStore.upsertComment(c);
      }
    },
    [offline, setCommentPopover],
  );

  return {
    handleDropPin,
    handleCommentClick,
    onMakeEditFromComment,
    onMakeEditFromIssue,
    onReplyToComment,
    onResolveComment,
    onDeleteComment,
  };
}
