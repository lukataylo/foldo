// Comment handlers + popover state, extracted from App.tsx.

import { useCallback, useState } from 'react';
import type {
  Comment,
  CreateCommentRequest,
  Frame,
  TestSessionIssue,
} from '@foldo/protocol';
import { boardStore } from '../state/useBoardStore';
import type { BoardSnapshot } from '../state/BoardStore';
import type { Route } from '../routing/Router';
import {
  createComment as apiCreateComment,
  deleteComment as apiDeleteComment,
  replyToComment as apiReplyToComment,
} from '../api/comments';
import { MOCK_BOARD_ID } from '../data/mockData';
import { updateComment as apiUpdateComment } from '../api/comments';
import type { SelectedElement, Tool } from '../types';
import type { BootState } from './useBoardBootstrap';
import { DEMO_USER_ID } from './useBoardBootstrap';

export interface CommentPopoverState {
  frameId: string;
  commentId: string;
  /** Open in compose mode (auto-focused empty textarea) for newly-dropped pins. */
  composing?: boolean;
}

interface UseCommentsArgs {
  snap: BoardSnapshot;
  boot: BootState;
  navigate: (next: Route, opts?: { replace?: boolean }) => void;
  setTool: (t: Tool) => void;
  setSelectedElement: (sel: SelectedElement | null) => void;
  toast: (msg: string) => void;
}

export interface UseCommentsResult {
  commentPopover: CommentPopoverState | null;
  setCommentPopover: (p: CommentPopoverState | null) => void;
  initialIntent: string | undefined;
  setInitialIntent: (s: string | undefined) => void;
  handleDropPin: (
    frameId: string,
    xRel: number,
    yRel: number,
  ) => Promise<void>;
  handleCommentClick: (frameId: string, comment: Comment) => void;
  onReplyToComment: (commentId: string, text: string) => Promise<void>;
  onResolveComment: (commentId: string) => Promise<void>;
  onDeleteComment: (commentId: string) => Promise<void>;
  onMakeEditFromComment: () => void;
  onMakeEditFromIssue: (
    frame: Frame,
    issue: TestSessionIssue,
  ) => Promise<void>;
}

export function useComments({
  snap,
  boot,
  navigate,
  setTool,
  setSelectedElement,
  toast,
}: UseCommentsArgs): UseCommentsResult {
  const [commentPopover, setCommentPopover] =
    useState<CommentPopoverState | null>(null);
  const [initialIntent, setInitialIntent] = useState<string | undefined>(
    undefined,
  );

  const handleDropPin = useCallback(
    async (frameId: string, xRel: number, yRel: number) => {
      // Always render optimistically: the pin should appear under the cursor
      // the instant the user clicks, before any network round-trip. The popover
      // opens in compose mode so the user can type the actual body straight
      // away (no "New comment" placeholder, no extra click into Reply).
      const me = snap.meUserId ? snap.users.get(snap.meUserId) : undefined;
      const now = new Date().toISOString();
      const tempId = `c-local-${Date.now()}`;
      const optimistic: Comment = {
        id: tempId,
        boardId: snap.board?.id ?? MOCK_BOARD_ID,
        frameId,
        authorUserId: me?.id ?? DEMO_USER_ID,
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

      if (boot.kind === 'offline') return; // local-only, no swap needed.
      try {
        const body: CreateCommentRequest = {
          boardId: snap.board?.id ?? '',
          frameId,
          text: '',
          pin: { x: xRel, y: yRel },
        };
        const c = await apiCreateComment(body);
        // Swap the temp comment for the server-issued one, then point the
        // popover at the real id so subsequent edits PATCH the right row.
        boardStore.removeComment(tempId);
        boardStore.upsertComment(c);
        setCommentPopover({ frameId, commentId: c.id, composing: true });
      } catch (e) {
        console.warn('[foldo] create comment failed', e);
        boardStore.removeComment(tempId);
        setCommentPopover(null);
        toast('Failed to add comment');
      }
    },
    [boot.kind, snap.board?.id, snap.meUserId, snap.users, setTool, toast],
  );

  const handleCommentClick = useCallback(
    (frameId: string, comment: Comment) => {
      setCommentPopover({ frameId, commentId: comment.id });
      // Update URL deep-link
      if (snap.board) {
        navigate({
          boardId: snap.board.id,
          frameId,
          commentId: comment.id,
        });
      }
    },
    [navigate, snap.board],
  );

  const onMakeEditFromComment = useCallback(() => {
    if (!commentPopover) return;
    const c = snap.comments.get(commentPopover.commentId);
    if (!c) return;
    const f = snap.frames.get(c.frameId);
    if (!f) return;
    if (c.target?.elementLabel && f.kind === 'app') {
      // Synthesise a small highlight rect around the comment's pin if we have one.
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
  }, [commentPopover, snap.comments, snap.frames, setSelectedElement]);

  // "Make this an edit" from a test_session synthesis issue: drop a comment on
  // the session frame carrying the issue text, so it flows into the existing
  // comment → dispatch loop.
  const onMakeEditFromIssue = useCallback(
    async (frame: Frame, issue: TestSessionIssue) => {
      const text = `From testing — ${issue.text}`;
      if (boot.kind === 'offline') {
        const optimistic: Comment = {
          id: `c-local-${Date.now()}`,
          boardId: snap.board?.id ?? MOCK_BOARD_ID,
          frameId: frame.id,
          authorUserId: DEMO_USER_ID,
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
        toast('Issue added as a comment');
        return;
      }
      try {
        const body: CreateCommentRequest = {
          boardId: snap.board?.id ?? '',
          frameId: frame.id,
          text,
        };
        const c = await apiCreateComment(body);
        boardStore.upsertComment(c);
        toast('Issue added as a comment');
      } catch (e) {
        console.warn('[foldo] make-edit-from-issue failed', e);
        toast('Failed to add comment');
      }
    },
    [boot.kind, snap.board?.id, toast],
  );

  const onReplyToComment = useCallback(
    async (commentId: string, text: string) => {
      if (boot.kind === 'offline') {
        const c = snap.comments.get(commentId);
        if (!c) return;
        const reply = {
          id: `r-local-${Date.now()}`,
          authorUserId: DEMO_USER_ID,
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
        if (c) {
          boardStore.upsertComment({ ...c, replies: [...c.replies, r] });
        }
      } catch (e) {
        console.warn('[foldo] reply failed', e);
      }
    },
    [boot.kind, snap.comments],
  );

  const onResolveComment = useCallback(
    async (commentId: string) => {
      const c = boardStore.getSnapshot().comments.get(commentId);
      if (!c) return;
      const next = !c.resolved;
      if (boot.kind === 'offline') {
        boardStore.upsertComment({ ...c, resolved: next });
        return;
      }
      try {
        const updated = await apiUpdateComment(commentId, { resolved: next });
        boardStore.upsertComment(updated);
      } catch (e) {
        console.warn('[foldo] resolve failed', e);
      }
    },
    [boot.kind],
  );

  const onDeleteComment = useCallback(
    async (commentId: string) => {
      const c = boardStore.getSnapshot().comments.get(commentId);
      if (!c) return;
      boardStore.removeComment(commentId);
      setCommentPopover(null);
      if (boot.kind === 'offline') return;
      try {
        await apiDeleteComment(commentId);
      } catch (e) {
        console.warn('[foldo] delete comment failed', e);
        // Re-insert on failure so UI doesn't silently lose state.
        boardStore.upsertComment(c);
      }
    },
    [boot.kind],
  );

  return {
    commentPopover,
    setCommentPopover,
    initialIntent,
    setInitialIntent,
    handleDropPin,
    handleCommentClick,
    onReplyToComment,
    onResolveComment,
    onDeleteComment,
    onMakeEditFromComment,
    onMakeEditFromIssue,
  };
}
