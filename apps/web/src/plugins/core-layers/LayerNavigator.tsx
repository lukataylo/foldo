// The Layer Navigator panel body. Renders a three-level tree of
// branches → frames → comments backed by the BoardStore snapshot, plus a
// small header toolbar with create/rename/delete affordances.
//
// Selecting a frame row drives the canvas via `window.__foldoSelectFrame`
// (registered by App.tsx). The plugin context's `notify()` is the toast
// channel for the toolbar's create/rename/delete buttons.
//
// Frames without a known branch land in a synthetic "Unassigned" group so
// nothing gets dropped from the tree.
//
// A+W1: actions are now wired —
//   - Delete: optimistic remove from the store, then DELETE /api/frames/:id.
//     Rolled back on failure.
//   - Rename: inline edit on the focused row. Only frames whose `content.title`
//     (markdown) or `content.body` (sticky) we can update via UpdateFrameRequest
//     are editable; other frame kinds get a disabled tooltip explaining why.
//   - Drag-reorder within a branch group: optimistic position swap, then a
//     PATCH /api/frames/:id with the new {position}. Vertical-only inside the
//     branch (frames keep their X). HTML5 drag-and-drop, gated to mouse-style
//     pointers — on touch the rows scroll instead, which matches iPad
//     expectations for vertical lists.
//
// A+W4: production-grade polish —
//   - Keyboard navigation: ArrowUp/Down moves focus, Right/Left expands /
//     collapses, Enter activates, Delete/Backspace deletes, F2 / Cmd+R renames,
//     Cmd+F focuses search, Cmd+A selects all visible, Escape backs out.
//   - Search/filter via the LayerSearch input. Matches collapse the rest of
//     the tree to just the matching frames + their branches.
//   - Multi-select with Cmd/Ctrl+click (toggle) and Shift+click (range). The
//     toolbar Delete button switches to "Delete N" + a confirm dialog; Rename
//     disables while multiple rows are selected.
//   - Right-click context menu via LayerContextMenu — mirrors Rename / Delete
//     and adds Duplicate (placeholder) + Copy link to frame.
//   - Comment count badge per row; red for unresolved, gray when all resolved.
//   - Canvas-selection indicator: blue 4px left border on whichever row matches
//     the route's frameId (route updates live as the canvas selects).
//   - a11y: tree container has role=tree + aria-label summary, each row is a
//     treeitem with aria-level, aria-expanded, aria-current. Roving tabIndex
//     so Tab cycles to the navigator and Arrow keys move within it.
//   - Loading / empty / error states: skeleton rows while !hydrated, friendly
//     empty hint when frames.size === 0, per-row red dot for 5s when a delete
//     / rename / reorder API call fails (in addition to the toast).

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type DragEvent,
  type KeyboardEvent,
  type MouseEvent,
} from 'react';
import type { Branch, Comment, Frame } from '@foldo/protocol';
import { useBoardSnapshot } from '../../state/useBoardStore';
import { boardStore } from '../../state/BoardStore';
import { deleteFrame as apiDeleteFrame, updateFrame as apiUpdateFrame } from '../../api/frames';
import { getSelectFrameHook } from '../registry';
import { LayerNode, type CommentBadgeInfo } from './LayerNode';
import { LayerSearch, matchFrame, type LayerSearchHandle } from './LayerSearch';
import { LayerContextMenu } from './LayerContextMenu';

// ---------- styles ----------

const containerStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
  height: '100%',
  position: 'relative', // anchor the absolute-positioned context menu
};

const toolbarStyle: CSSProperties = {
  display: 'flex',
  gap: 4,
  paddingBottom: 6,
  borderBottom: '1px solid #323232',
};

const toolbarBtn: CSSProperties = {
  flex: 1,
  padding: '4px 6px',
  height: 24,
  background: 'rgba(255,255,255,0.03)',
  color: '#e8e8ea',
  border: '1px solid #323232',
  borderRadius: 3,
  cursor: 'pointer',
  fontSize: 11,
  fontWeight: 500,
};

const toolbarBtnDisabled: CSSProperties = {
  ...toolbarBtn,
  opacity: 0.4,
  cursor: 'not-allowed',
};

const emptyStyle: CSSProperties = {
  color: '#9a9a9a',
  fontSize: 11,
  padding: '14px 8px',
  textAlign: 'center',
  lineHeight: 1.4,
};

const treeStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 1,
  overflow: 'auto',
  flex: 1,
  outline: 'none',
};

const groupHeaderDot: CSSProperties = {
  width: 8,
  height: 8,
  borderRadius: '50%',
  display: 'inline-block',
};

// A+W1: inline rename input — 16px font so iOS doesn't auto-zoom on focus.
const renameInputStyle: CSSProperties = {
  flex: 1,
  background: 'rgba(0,0,0,0.4)',
  color: '#e8e8ea',
  border: '1px solid rgba(255,255,255,0.18)',
  borderRadius: 4,
  padding: '4px 6px',
  fontSize: 16,
  fontFamily: 'inherit',
  outline: 'none',
};

// A+W1: drop-indicator line shown between rows during drag-reorder.
const dropIndicator: CSSProperties = {
  height: 2,
  background: '#ff7849',
  margin: '0 6px',
  borderRadius: 1,
};

// A+W4: skeleton loading row — three of these render while !hydrated.
const skeletonRow: CSSProperties = {
  height: 32,
  margin: '4px 6px',
  borderRadius: 4,
  background:
    'linear-gradient(90deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.10) 50%, rgba(255,255,255,0.04) 100%)',
  backgroundSize: '200% 100%',
  animation: 'foldo-layer-skeleton 1200ms linear infinite',
};

// ---------- helpers ----------

/** Human-friendly label for a frame row. Falls back to id when nothing else fits. */
export function frameDisplayName(frame: Frame): string {
  const c = frame.content;
  if (c.kind === 'markdown' && c.title) return c.title;
  if (c.kind === 'sticky') {
    const body = c.body?.trim();
    if (body) return body.length > 32 ? `${body.slice(0, 29)}…` : body;
    return 'Sticky note';
  }
  if (c.kind === 'app') return `${c.variant} · ${c.route}`;
  if (c.kind === 'image') return 'Image';
  if (c.kind === 'arrow') return 'Arrow';
  if (c.kind === 'test_summary') return 'Test summary';
  if (c.kind === 'test_session') return 'Test session';
  return frame.commitMessage || frame.id;
}

/** Tiny icon for each frame kind. Plain emoji to keep the bundle dep-free. */
function frameIcon(frame: Frame): string {
  switch (frame.kind) {
    case 'app':
      return '◧';
    case 'markdown':
      return '¶';
    case 'sticky':
      return '◇';
    case 'arrow':
      return '→';
    case 'image':
      return '▣';
    case 'test_summary':
    case 'test_session':
      return '✓';
    default:
      return '·';
  }
}

interface BranchGroup {
  branch: Branch | null; // null = synthetic "unassigned" group
  frames: Frame[];
}

/** Bucket frames by branch in a stable order (branches in install order, frames by createdAt). */
function groupFrames(frames: Map<string, Frame>, branches: Map<string, Branch>): BranchGroup[] {
  const byBranch = new Map<string, Frame[]>();
  const orphans: Frame[] = [];
  for (const f of frames.values()) {
    if (branches.has(f.branchId)) {
      const arr = byBranch.get(f.branchId) ?? [];
      arr.push(f);
      byBranch.set(f.branchId, arr);
    } else {
      orphans.push(f);
    }
  }
  // A+W1: sort by Y position (the canvas's natural reading order) then by
  // createdAt as a stable tiebreaker. This makes drag-reorder predictable —
  // moving a row up in the list = moving its frame up on the canvas.
  const sortByPosition = (a: Frame, b: Frame): number => {
    if (a.position.y !== b.position.y) return a.position.y - b.position.y;
    return (a.createdAt ?? '').localeCompare(b.createdAt ?? '');
  };
  const groups: BranchGroup[] = [];
  for (const branch of branches.values()) {
    const list = (byBranch.get(branch.id) ?? []).slice().sort(sortByPosition);
    groups.push({ branch, frames: list });
  }
  if (orphans.length) {
    groups.push({ branch: null, frames: orphans.slice().sort(sortByPosition) });
  }
  return groups;
}

function commentsForFrame(comments: Map<string, Comment>, frameId: string): Comment[] {
  const out: Comment[] = [];
  for (const c of comments.values()) {
    if (c.frameId === frameId) out.push(c);
  }
  out.sort((a, b) => (a.createdAt ?? '').localeCompare(b.createdAt ?? ''));
  return out;
}

function commentBadgeFor(
  comments: Map<string, Comment>,
  frameId: string,
): CommentBadgeInfo | undefined {
  let count = 0;
  let unresolved = 0;
  for (const c of comments.values()) {
    if (c.frameId !== frameId) continue;
    count += 1;
    if (!c.resolved) unresolved += 1;
  }
  if (count === 0) return undefined;
  return { count, unresolved };
}

// A+W1: which frame kinds can we rename via the existing protocol? Markdown
// has a `title` field and sticky has a `body` field — both are part of the
// UpdateFrameRequest content union, so a PATCH lands cleanly. App / arrow /
// image / test_* frames don't carry a user-visible name, so we gray those
// out with an explanatory tooltip rather than promising something we can't
// deliver.
function canRenameFrame(frame: Frame): boolean {
  return frame.content.kind === 'markdown' || frame.content.kind === 'sticky';
}

function currentRenameValue(frame: Frame): string {
  if (frame.content.kind === 'markdown') return frame.content.title ?? '';
  if (frame.content.kind === 'sticky') return frame.content.body ?? '';
  return frameDisplayName(frame);
}

function makeRenamePatch(frame: Frame, next: string): Parameters<typeof apiUpdateFrame>[1] | null {
  if (frame.content.kind === 'markdown') {
    return { content: { kind: 'markdown', title: next } };
  }
  if (frame.content.kind === 'sticky') {
    return { content: { kind: 'sticky', body: next } };
  }
  return null;
}

function applyRenameToStore(frame: Frame, next: string): Frame {
  if (frame.content.kind === 'markdown') {
    return { ...frame, content: { ...frame.content, title: next } };
  }
  if (frame.content.kind === 'sticky') {
    return { ...frame, content: { ...frame.content, body: next } };
  }
  return frame;
}

// ---------- toast ----------

function notify(msg: string): void {
  const fn = (window as unknown as { __foldoToast?: (m: string) => void }).__foldoToast;
  if (fn) fn(msg);
  // Silently swallow when no toast hook is installed (unit tests, SSR).
}

// A+W4: read the route's frameId from the URL on every render. We avoid
// importing useRoute so this stays decoupled from App.tsx wiring. The
// listener (mounted in the component effect below) refreshes on popstate
// and when the canvas pushes a new frame URL.
function readSelectedFrameIdFromUrl(): string | null {
  if (typeof location === 'undefined') return null;
  const m = /\/board\/[^/]+\/frame\/([^/]+)/.exec(location.pathname);
  return m ? decodeURIComponent(m[1]!) : null;
}

function readBoardIdFromUrl(): string | null {
  if (typeof location === 'undefined') return null;
  const m = /\/board\/([^/]+)/.exec(location.pathname);
  return m ? decodeURIComponent(m[1]!) : null;
}

// ---------- component ----------

export function LayerNavigator(): JSX.Element {
  const snap = useBoardSnapshot();
  const groups = useMemo(
    () => groupFrames(snap.frames, snap.branches),
    [snap.frames, snap.branches],
  );

  const [collapsedBranches, setCollapsedBranches] = useState<Set<string>>(
    () => new Set(),
  );
  const [expandedFrames, setExpandedFrames] = useState<Set<string>>(
    () => new Set(),
  );
  const [focusedFrameId, setFocusedFrameId] = useState<string | null>(null);

  // A+W1: rename state — when set we render an inline input on the focused row.
  const [renamingFrameId, setRenamingFrameId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState<string>('');
  const renameInputRef = useRef<HTMLInputElement | null>(null);

  // A+W1: drag-reorder state. We track which frame is being dragged + which
  // sibling we'd drop before. Both are reset on dragend or successful drop.
  const [dragFrameId, setDragFrameId] = useState<string | null>(null);
  const [dropTargetFrameId, setDropTargetFrameId] = useState<string | null>(null);

  // A+W4: search query (controlled by the LayerSearch component).
  const [query, setQuery] = useState('');
  const searchRef = useRef<LayerSearchHandle | null>(null);

  // A+W4: multi-select state. The "anchor" is the last single-clicked row;
  // Shift+click uses it as the start of a range select.
  const [selectedFrameIds, setSelectedFrameIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [selectionAnchor, setSelectionAnchor] = useState<string | null>(null);

  // A+W4: context menu — null when closed.
  const [contextMenu, setContextMenu] = useState<{
    frameId: string;
    x: number;
    y: number;
  } | null>(null);

  // A+W4: transient per-row error indicator (clears after 5s).
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});

  // A+W4: live route-driven canvas selection so the navigator can paint
  // the selected frame even when another panel drove the selection.
  const [canvasSelectedFrameId, setCanvasSelectedFrameId] = useState<string | null>(
    () => readSelectedFrameIdFromUrl(),
  );
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const sync = (): void => {
      setCanvasSelectedFrameId(readSelectedFrameIdFromUrl());
    };
    window.addEventListener('popstate', sync);
    // pushState doesn't dispatch popstate; the canvas's navigate() uses
    // pushState. A short interval is the lowest-risk way to keep this in
    // sync without monkey-patching history globally. 200ms is below the
    // perceptual threshold for "selection moved".
    const t = window.setInterval(sync, 200);
    return () => {
      window.removeEventListener('popstate', sync);
      window.clearInterval(t);
    };
  }, []);

  // A+W4: visible frames (after the search filter) and the corresponding
  // visible groups. We hide a branch entirely once all its frames have
  // been filtered out so the tree doesn't show empty group headers.
  const visibleGroups = useMemo<BranchGroup[]>(() => {
    if (!query.trim()) return groups;
    const out: BranchGroup[] = [];
    for (const g of groups) {
      const matches = g.frames.filter((f) => matchFrame(f, query));
      if (matches.length) out.push({ branch: g.branch, frames: matches });
    }
    return out;
  }, [groups, query]);

  // A+W4: flat order of visible frames — drives keyboard ArrowUp/Down and
  // Cmd+A. Branches that are collapsed contribute zero frames to the flow,
  // matching the visual reality of the tree.
  const flatVisibleFrames = useMemo<Frame[]>(() => {
    const out: Frame[] = [];
    for (const g of visibleGroups) {
      const branchId = g.branch?.id ?? '__unassigned__';
      if (collapsedBranches.has(branchId)) continue;
      for (const f of g.frames) out.push(f);
    }
    return out;
  }, [visibleGroups, collapsedBranches]);

  // A+W4: refs onto each rendered row so the parent can call .focus() on it
  // when keyboard navigation moves focus.
  const rowRefs = useRef<Map<string, HTMLDivElement | null>>(new Map());
  const setRowRef = useCallback((id: string, node: HTMLDivElement | null) => {
    if (node) rowRefs.current.set(id, node);
    else rowRefs.current.delete(id);
  }, []);

  const toggleBranch = (id: string): void => {
    setCollapsedBranches((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleFrame = (id: string): void => {
    setExpandedFrames((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // A+W4: bring a row into view + focus it.
  const focusRow = useCallback((frameId: string): void => {
    setFocusedFrameId(frameId);
    // Defer so the row exists after a state change (e.g. expanding a branch).
    setTimeout(() => {
      const el = rowRefs.current.get(frameId);
      if (el) {
        el.focus({ preventScroll: false });
        // The native scrollIntoView is the most reliable cross-browser way
        // to make sure a freshly-focused row is visible after Arrow nav.
        try {
          el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        } catch {
          /* Safari < 14 fallback — no-op, .focus() already scrolled. */
        }
      }
    }, 0);
  }, []);

  /* A+W4: multi-select click handler. The modifier flags drive three modes:
     - Shift: range select from anchor → current.
     - Cmd/Ctrl: toggle current row in the set; updates anchor.
     - plain: clears multi-set, selects only current row. */
  const onFrameClick = (frame: Frame, e?: MouseEvent<HTMLElement>): void => {
    // A+W1: clicking a different row cancels any in-progress rename so the
    // edit doesn't silently get lost as focus moves away.
    if (renamingFrameId && renamingFrameId !== frame.id) {
      setRenamingFrameId(null);
    }

    const shift = e?.shiftKey ?? false;
    const meta = (e?.metaKey ?? false) || (e?.ctrlKey ?? false);
    if (shift && selectionAnchor) {
      // Range select across the visible flat frame order.
      const flat = flatVisibleFrames;
      const a = flat.findIndex((f) => f.id === selectionAnchor);
      const b = flat.findIndex((f) => f.id === frame.id);
      if (a >= 0 && b >= 0) {
        const lo = Math.min(a, b);
        const hi = Math.max(a, b);
        const range = new Set<string>();
        for (let i = lo; i <= hi; i += 1) range.add(flat[i]!.id);
        setSelectedFrameIds(range);
      } else {
        setSelectedFrameIds(new Set([frame.id]));
      }
    } else if (meta) {
      setSelectedFrameIds((prev) => {
        const next = new Set(prev);
        if (next.has(frame.id)) next.delete(frame.id);
        else next.add(frame.id);
        return next;
      });
      setSelectionAnchor(frame.id);
    } else {
      // Plain click: collapse to a single-row selection and fire the
      // canvas select hook.
      setSelectedFrameIds(new Set([frame.id]));
      setSelectionAnchor(frame.id);
      const hook = getSelectFrameHook();
      if (hook) hook(frame.id);
      else notify(`Selected ${frameDisplayName(frame)}`);
    }
    setFocusedFrameId(frame.id);
  };

  const onCommentClick = (comment: Comment): void => {
    setFocusedFrameId(comment.frameId);
    const hook = getSelectFrameHook();
    if (hook) hook(comment.frameId);
    notify(`Comment by ${comment.authorName}`);
  };

  // ---------- toolbar handlers ----------

  const focusedFrame = focusedFrameId
    ? snap.frames.get(focusedFrameId) ?? null
    : null;

  // A+W4: a delete from the toolbar applies to the entire selection set
  // when more than one row is selected. The focused row is always implicitly
  // included so the existing single-row behaviour still works.
  const effectiveSelection = useMemo<string[]>(() => {
    const out = new Set<string>(selectedFrameIds);
    if (focusedFrameId) out.add(focusedFrameId);
    return Array.from(out);
  }, [selectedFrameIds, focusedFrameId]);

  const onCreate = (): void => {
    notify('Create a frame from the toolbar at the bottom of the canvas.');
  };

  /* A+W1: start an inline rename for the focused frame. Bails early when the
     frame kind doesn't carry a renameable field — the button is also disabled
     in that case, but this is the second line of defence for keyboard users. */
  const beginRename = useCallback((frameOverride?: Frame): void => {
    const frame = frameOverride ?? focusedFrame;
    if (!frame) {
      notify('Pick a frame in the tree first, then rename.');
      return;
    }
    if (!canRenameFrame(frame)) {
      notify('Rename only works on doc + sticky frames for now.');
      return;
    }
    setFocusedFrameId(frame.id);
    setRenamingFrameId(frame.id);
    setRenameDraft(currentRenameValue(frame));
    // Defer focus so the input has mounted.
    setTimeout(() => {
      const el = renameInputRef.current;
      if (el) {
        el.focus();
        el.select();
      }
    }, 30);
  }, [focusedFrame]);

  const cancelRename = useCallback((): void => {
    setRenamingFrameId(null);
    setRenameDraft('');
  }, []);

  // A+W4: surface a transient error pill on a specific row. Auto-clears
  // after 5s; the toast pipeline (window.__foldoToast) covers the long-form
  // copy.
  const flagRowError = useCallback((frameId: string, message: string): void => {
    setRowErrors((prev) => ({ ...prev, [frameId]: message }));
    setTimeout(() => {
      setRowErrors((prev) => {
        if (!(frameId in prev)) return prev;
        const next = { ...prev };
        delete next[frameId];
        return next;
      });
    }, 5_000);
  }, []);

  const commitRename = useCallback(async (): Promise<void> => {
    const id = renamingFrameId;
    if (!id) return;
    const frame = boardStore.getSnapshot().frames.get(id);
    if (!frame) {
      cancelRename();
      return;
    }
    const next = renameDraft.trim();
    const current = currentRenameValue(frame);
    if (!next || next === current) {
      cancelRename();
      return;
    }
    const patch = makeRenamePatch(frame, next);
    if (!patch) {
      cancelRename();
      return;
    }
    // Optimistic store update so the UI reflects the new name immediately.
    boardStore.upsertFrame(applyRenameToStore(frame, next));
    setRenamingFrameId(null);
    setRenameDraft('');
    try {
      const updated = await apiUpdateFrame(id, patch);
      boardStore.upsertFrame(updated);
    } catch (err) {
      // Roll back to the pre-edit frame so the user sees the failure.
      boardStore.upsertFrame(frame);
      notify('Failed to rename frame.');
      flagRowError(id, 'Rename failed');
      // eslint-disable-next-line no-console
      console.error('[core/layers] rename failed', err);
    }
  }, [renamingFrameId, renameDraft, cancelRename, flagRowError]);

  const onRename = (): void => beginRename();

  /* A+W1/A+W4: delete the focused frame, or the entire selection set when
     multi-select is active. Confirms when comments are attached or when
     more than one frame is being removed. Errors fall back to a row pill +
     toast and the optimistic state is rolled back. */
  const deleteFrameWithRollback = useCallback(
    async (frame: Frame): Promise<boolean> => {
      const snapshotFrame = frame;
      boardStore.removeFrame(snapshotFrame.id);
      try {
        await apiDeleteFrame(snapshotFrame.id);
        return true;
      } catch (err) {
        boardStore.upsertFrame(snapshotFrame);
        notify('Failed to delete frame.');
        flagRowError(snapshotFrame.id, 'Delete failed');
        // eslint-disable-next-line no-console
        console.error('[core/layers] delete failed', err);
        return false;
      }
    },
    [flagRowError],
  );

  const onDelete = useCallback(async (): Promise<void> => {
    const ids = effectiveSelection;
    if (ids.length === 0) {
      notify('Pick a frame in the tree first, then delete.');
      return;
    }
    if (ids.length > 1) {
      const ok = window.confirm(`Delete ${ids.length} frames?`);
      if (!ok) return;
      const frames = ids
        .map((id) => snap.frames.get(id))
        .filter((f): f is Frame => !!f);
      setFocusedFrameId(null);
      setSelectedFrameIds(new Set());
      for (const f of frames) {
        // eslint-disable-next-line no-await-in-loop
        await deleteFrameWithRollback(f);
      }
      return;
    }
    const frame = snap.frames.get(ids[0]!);
    if (!frame) return;
    const frameComments = commentsForFrame(snap.comments, frame.id);
    if (frameComments.length > 0) {
      const ok = window.confirm(
        `Delete this frame? It has ${frameComments.length} comment${
          frameComments.length === 1 ? '' : 's'
        } that will go with it.`,
      );
      if (!ok) return;
    }
    setFocusedFrameId(null);
    setSelectedFrameIds(new Set());
    await deleteFrameWithRollback(frame);
  }, [effectiveSelection, snap.frames, snap.comments, deleteFrameWithRollback]);

  // ---------- drag-reorder ----------

  /* A+W1: HTML5 drag-and-drop reorder, scoped to siblings within the same
     branch group. On drop we compute a new Y position by averaging the two
     adjacent siblings' Ys (or extending past the edge), PATCH the frame, and
     let the WS round-trip reconcile. The Y becomes the new sort key on the
     next render because groupFrames orders by position.y. */
  const findGroupOfFrame = useCallback(
    (frameId: string): BranchGroup | null => {
      for (const g of groups) {
        if (g.frames.some((f) => f.id === frameId)) return g;
      }
      return null;
    },
    [groups],
  );

  const handleReorder = useCallback(
    async (sourceId: string, targetId: string): Promise<void> => {
      if (sourceId === targetId) return;
      const sourceGroup = findGroupOfFrame(sourceId);
      const targetGroup = findGroupOfFrame(targetId);
      if (!sourceGroup || !targetGroup) return;
      // Cross-branch reorder is out of scope for v1; the canvas's branch
      // ownership is sticky and changing it deserves its own affordance.
      if (sourceGroup !== targetGroup) {
        notify('Reorder is restricted to within a branch for now.');
        return;
      }
      const siblings = sourceGroup.frames;
      const targetIndex = siblings.findIndex((f) => f.id === targetId);
      if (targetIndex < 0) return;
      const source = siblings.find((f) => f.id === sourceId);
      if (!source) return;
      // Compute the new Y as the midpoint between the target's predecessor
      // (or -200) and the target itself. That places the source row directly
      // above the target on the canvas, mirroring the tree.
      const target = siblings[targetIndex]!;
      const beforeTarget = siblings
        .filter((f) => f.id !== sourceId)
        .filter((f) => siblings.indexOf(f) < targetIndex);
      const predecessor = beforeTarget[beforeTarget.length - 1];
      const predecessorY = predecessor ? predecessor.position.y : target.position.y - 200;
      const newY = (predecessorY + target.position.y) / 2;
      if (newY === source.position.y) return;
      const original = source;
      const optimistic: Frame = {
        ...source,
        position: { ...source.position, y: newY },
      };
      boardStore.upsertFrame(optimistic);
      try {
        const updated = await apiUpdateFrame(source.id, {
          position: { x: source.position.x, y: newY },
        });
        boardStore.upsertFrame(updated);
      } catch (err) {
        boardStore.upsertFrame(original);
        notify('Failed to reorder frame.');
        flagRowError(source.id, 'Reorder failed');
        // eslint-disable-next-line no-console
        console.error('[core/layers] reorder failed', err);
      }
    },
    [findGroupOfFrame, flagRowError],
  );

  // A+W1: keyboard handler for the inline rename input.
  const onRenameKeyDown = (e: KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'Enter') {
      e.preventDefault();
      void commitRename();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      cancelRename();
    }
  };

  // A+W1: keep the rename input focused if the focused frame changes between
  // renders due to a store update arriving while editing.
  useEffect(() => {
    if (renamingFrameId && renameInputRef.current) {
      renameInputRef.current.focus();
    }
  }, [renamingFrameId]);

  // ---------- A+W4 context menu / copy link ----------

  const closeContextMenu = useCallback((): void => setContextMenu(null), []);

  const openContextMenuAt = useCallback(
    (frameId: string, e: MouseEvent<HTMLElement>): void => {
      e.preventDefault();
      // Position the menu relative to the panel container so it tracks with
      // scrolling. Falls back to the page coords when offsetParent is gone.
      const container = (e.currentTarget as HTMLElement).closest(
        '[data-testid="foldo-layer-navigator"]',
      ) as HTMLElement | null;
      const rect = container?.getBoundingClientRect();
      const x = rect ? e.clientX - rect.left : e.clientX;
      const y = rect ? e.clientY - rect.top : e.clientY;
      setContextMenu({ frameId, x, y });
      setFocusedFrameId(frameId);
    },
    [],
  );

  const onCopyFrameLink = useCallback(
    async (frameId: string): Promise<void> => {
      const boardId = snap.board?.id ?? readBoardIdFromUrl();
      if (!boardId) {
        notify('Copy link needs a board context.');
        return;
      }
      const origin =
        typeof window !== 'undefined' && window.location?.origin
          ? window.location.origin
          : '';
      const url = `${origin}/board/${boardId}/frame/${frameId}`;
      try {
        if (navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(url);
          notify('Link copied to clipboard.');
        } else {
          notify(url);
        }
      } catch {
        notify('Copy failed — clipboard unavailable.');
        flagRowError(frameId, 'Copy failed');
      }
    },
    [snap.board, flagRowError],
  );

  const onDuplicate = useCallback((frameId: string): void => {
    // No duplicate API in v1; the context-menu entry is rendered disabled
    // upstream, but the handler is here so the menu can route a future
    // implementation without a refactor.
    notify(`Duplicate not yet available for ${frameId}.`);
  }, []);

  // ---------- A+W4 keyboard navigation on the tree ----------

  const onTreeKeyDown = (e: KeyboardEvent<HTMLDivElement>): void => {
    // Search hotkey: Cmd+F / Ctrl+F focuses the input, regardless of which
    // row currently holds keyboard focus.
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'f') {
      e.preventDefault();
      searchRef.current?.focus();
      return;
    }
    // Cmd+A / Ctrl+A: select all visible frames.
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'a') {
      e.preventDefault();
      const all = new Set(flatVisibleFrames.map((f) => f.id));
      setSelectedFrameIds(all);
      return;
    }
    // F2 or Cmd+R: rename. Cmd+R would otherwise reload the page, so the
    // preventDefault is critical.
    if (e.key === 'F2' || ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'r')) {
      e.preventDefault();
      beginRename();
      return;
    }
    // Delete / Backspace: trigger the same flow as the toolbar button.
    if (e.key === 'Delete' || e.key === 'Backspace') {
      // Backspace inside a text input would erase characters; we only act
      // when focus is on the tree itself, not on the rename input.
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;
      e.preventDefault();
      void onDelete();
      return;
    }
    // Escape: cancel rename, close context menu, clear selection.
    if (e.key === 'Escape') {
      if (renamingFrameId) {
        e.preventDefault();
        cancelRename();
        return;
      }
      if (contextMenu) {
        e.preventDefault();
        closeContextMenu();
        return;
      }
      if (selectedFrameIds.size > 1) {
        e.preventDefault();
        setSelectedFrameIds(focusedFrameId ? new Set([focusedFrameId]) : new Set());
        return;
      }
      // Collapse the current branch if focus is on a frame inside it.
      if (focusedFrameId) {
        const group = findGroupOfFrame(focusedFrameId);
        const branchId = group?.branch?.id ?? '__unassigned__';
        if (group && !collapsedBranches.has(branchId)) {
          setCollapsedBranches((prev) => new Set(prev).add(branchId));
          e.preventDefault();
          return;
        }
      }
    }
    // Arrow navigation operates on the flat list of currently-visible frames.
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (flatVisibleFrames.length === 0) return;
      const idx = focusedFrameId
        ? flatVisibleFrames.findIndex((f) => f.id === focusedFrameId)
        : -1;
      let nextIdx: number;
      if (e.key === 'ArrowDown') {
        nextIdx = idx < 0 ? 0 : Math.min(flatVisibleFrames.length - 1, idx + 1);
      } else {
        nextIdx = idx < 0 ? 0 : Math.max(0, idx - 1);
      }
      focusRow(flatVisibleFrames[nextIdx]!.id);
      return;
    }
    if (e.key === 'ArrowRight') {
      if (!focusedFrameId) return;
      const frame = snap.frames.get(focusedFrameId);
      if (!frame) return;
      const frameComments = commentsForFrame(snap.comments, focusedFrameId);
      if (frameComments.length && !expandedFrames.has(focusedFrameId)) {
        e.preventDefault();
        toggleFrame(focusedFrameId);
      }
      return;
    }
    if (e.key === 'ArrowLeft') {
      if (!focusedFrameId) return;
      if (expandedFrames.has(focusedFrameId)) {
        e.preventDefault();
        toggleFrame(focusedFrameId);
        return;
      }
      // Collapse the parent branch.
      const group = findGroupOfFrame(focusedFrameId);
      const branchId = group?.branch?.id ?? '__unassigned__';
      if (group && !collapsedBranches.has(branchId)) {
        e.preventDefault();
        setCollapsedBranches((prev) => new Set(prev).add(branchId));
      }
      return;
    }
    if (e.key === 'Enter') {
      if (!focusedFrameId) return;
      const frame = snap.frames.get(focusedFrameId);
      if (!frame) return;
      e.preventDefault();
      onFrameClick(frame, undefined);
    }
  };

  // A+W4: derived flags used by the toolbar.
  const isMultiSelect = selectedFrameIds.size > 1;
  const renameDisabled =
    isMultiSelect || !focusedFrame || !canRenameFrame(focusedFrame);
  const deleteDisabled = effectiveSelection.length === 0;
  const deleteLabel = isMultiSelect ? `Delete ${selectedFrameIds.size}` : 'Delete';

  const totalFrames = snap.frames.size;
  const totalBranches = snap.branches.size + (groups.some((g) => g.branch === null) ? 1 : 0);
  const treeAriaLabel = `Layers: ${totalFrames} frame${totalFrames === 1 ? '' : 's'} across ${totalBranches} branch${totalBranches === 1 ? '' : 'es'}`;

  const hasContent = visibleGroups.some((g) => g.frames.length > 0);
  const isLoading = !snap.hydrated;
  const showEmpty = snap.hydrated && totalFrames === 0;
  const showNoMatches = snap.hydrated && totalFrames > 0 && !!query.trim() && !hasContent;

  return (
    <div style={containerStyle} data-testid="foldo-layer-navigator">
      {/* A+W4: search input above the toolbar. */}
      <LayerSearch
        ref={searchRef}
        value={query}
        onChange={setQuery}
        totalFrames={totalFrames}
      />

      <div style={toolbarStyle} role="toolbar" aria-label="Layer Navigator actions">
        <button
          type="button"
          style={toolbarBtn}
          onClick={onCreate}
          data-testid="foldo-layer-create"
          title="Create a new frame"
        >
          + New
        </button>
        <button
          type="button"
          style={renameDisabled ? toolbarBtnDisabled : toolbarBtn}
          onClick={onRename}
          disabled={renameDisabled}
          data-testid="foldo-layer-rename"
          title={
            isMultiSelect
              ? 'Rename is single-frame only'
              : !focusedFrame
                ? 'Pick a frame in the tree first'
                : !canRenameFrame(focusedFrame)
                  ? 'Rename only supports doc + sticky frames'
                  : 'Rename the selected frame'
          }
        >
          Rename
        </button>
        <button
          type="button"
          style={deleteDisabled ? toolbarBtnDisabled : toolbarBtn}
          onClick={() => void onDelete()}
          disabled={deleteDisabled}
          data-testid="foldo-layer-delete"
          title={
            deleteDisabled
              ? 'Pick a frame in the tree first'
              : isMultiSelect
                ? `Delete ${selectedFrameIds.size} frames`
                : 'Delete the selected frame'
          }
        >
          {deleteLabel}
        </button>
      </div>

      {/* A+W4: keyframes for the loading shimmer. Inline so the plugin stays
         dep-free; the rule is namespaced so it can't collide with app CSS. */}
      <style>{`
        @keyframes foldo-layer-skeleton {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
      `}</style>

      {isLoading ? (
        <div data-testid="foldo-layer-loading" aria-busy="true" aria-live="polite">
          <div style={skeletonRow} />
          <div style={skeletonRow} />
          <div style={skeletonRow} />
        </div>
      ) : showEmpty ? (
        <div style={emptyStyle} data-testid="foldo-layer-empty" role="status">
          This board has no frames yet.
          <br />
          Use the toolbar at the bottom to create one.
        </div>
      ) : showNoMatches ? (
        <div style={emptyStyle} data-testid="foldo-layer-no-matches" role="status">
          No frames match “{query}”.
        </div>
      ) : (
        <div
          style={treeStyle}
          role="tree"
          aria-label={treeAriaLabel}
          data-testid="foldo-layer-tree"
          tabIndex={focusedFrameId ? -1 : 0}
          onKeyDown={onTreeKeyDown}
          onFocus={(e) => {
            // Tab into the tree: focus the first visible frame so Arrow keys
            // have somewhere to start. Only fires when the tree itself
            // receives focus (not a child row).
            if (e.target === e.currentTarget && !focusedFrameId && flatVisibleFrames.length) {
              focusRow(flatVisibleFrames[0]!.id);
            }
          }}
        >
          {visibleGroups.map((group) => {
            const branchId = group.branch?.id ?? '__unassigned__';
            const branchLabel = group.branch?.name ?? 'Unassigned';
            const collapsed = collapsedBranches.has(branchId);
            const branchColor = group.branch?.color ?? '#666';
            return (
              <div key={branchId} role="group">
                <LayerNode
                  depth={0}
                  ariaLevel={1}
                  iconNode={
                    <span
                      style={{ ...groupHeaderDot, background: branchColor }}
                    />
                  }
                  label={branchLabel}
                  metaText={String(group.frames.length)}
                  expandable
                  expanded={!collapsed}
                  onClick={() => toggleBranch(branchId)}
                  testId={`foldo-layer-branch-${branchId}`}
                />
                {collapsed
                  ? null
                  : group.frames.map((frame) => {
                      const frameComments = commentsForFrame(snap.comments, frame.id);
                      const badge = commentBadgeFor(snap.comments, frame.id);
                      const isExpanded = expandedFrames.has(frame.id);
                      const isRenaming = renamingFrameId === frame.id;
                      const isDropTarget = dropTargetFrameId === frame.id;
                      const isCanvasSelected = canvasSelectedFrameId === frame.id;
                      const isMultiSelected = selectedFrameIds.has(frame.id);
                      const isFocused = focusedFrameId === frame.id;
                      const rowError = rowErrors[frame.id];
                      // A+W1: drag handlers — gated to frames that have a
                      // sibling in the same branch group (no point reordering
                      // a singleton).
                      const groupSize = group.frames.length;
                      const draggable = groupSize > 1 && !isRenaming;
                      const onDragStart = (e: DragEvent<HTMLDivElement>): void => {
                        if (!draggable) return;
                        e.dataTransfer.effectAllowed = 'move';
                        e.dataTransfer.setData('text/plain', frame.id);
                        setDragFrameId(frame.id);
                      };
                      const onDragOver = (e: DragEvent<HTMLDivElement>): void => {
                        if (!dragFrameId || dragFrameId === frame.id) return;
                        // Only allow drops within the same branch group.
                        const sourceGroup = findGroupOfFrame(dragFrameId);
                        if (sourceGroup !== group) return;
                        e.preventDefault();
                        e.dataTransfer.dropEffect = 'move';
                        setDropTargetFrameId(frame.id);
                      };
                      const onDragLeave = (): void => {
                        setDropTargetFrameId((prev) =>
                          prev === frame.id ? null : prev,
                        );
                      };
                      const onDrop = (e: DragEvent<HTMLDivElement>): void => {
                        e.preventDefault();
                        const sourceId =
                          e.dataTransfer.getData('text/plain') || dragFrameId;
                        if (sourceId && sourceId !== frame.id) {
                          void handleReorder(sourceId, frame.id);
                        }
                        setDragFrameId(null);
                        setDropTargetFrameId(null);
                      };
                      const onDragEnd = (): void => {
                        setDragFrameId(null);
                        setDropTargetFrameId(null);
                      };
                      return (
                        <div
                          key={frame.id}
                          role="group"
                          draggable={draggable}
                          onDragStart={onDragStart}
                          onDragOver={onDragOver}
                          onDragLeave={onDragLeave}
                          onDrop={onDrop}
                          onDragEnd={onDragEnd}
                          data-testid={`foldo-layer-frame-row-${frame.id}`}
                          style={{
                            opacity: dragFrameId === frame.id ? 0.5 : 1,
                          }}
                        >
                          {isDropTarget && <div style={dropIndicator} />}
                          {isRenaming ? (
                            <div
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 6,
                                padding: '6px 6px 6px 32px', // align with depth-1 indent
                              }}
                            >
                              <input
                                ref={renameInputRef}
                                value={renameDraft}
                                onChange={(e) => setRenameDraft(e.target.value)}
                                onKeyDown={onRenameKeyDown}
                                onBlur={() => void commitRename()}
                                style={renameInputStyle}
                                data-testid={`foldo-layer-frame-rename-input-${frame.id}`}
                                aria-label="Rename frame"
                              />
                            </div>
                          ) : (
                            <LayerNode
                              depth={1}
                              ariaLevel={2}
                              iconNode={frameIcon(frame)}
                              label={frameDisplayName(frame)}
                              metaText={undefined}
                              expandable={frameComments.length > 0}
                              expanded={isExpanded}
                              focused={isFocused}
                              selectedOnCanvas={isCanvasSelected}
                              multiSelected={isMultiSelected}
                              badge={badge}
                              errorMessage={rowError}
                              tabIndex={isFocused ? 0 : -1}
                              rowRef={(node) => setRowRef(frame.id, node)}
                              onClick={(e) => {
                                onFrameClick(frame, e as MouseEvent<HTMLElement>);
                                if (frameComments.length > 0 && !e?.shiftKey && !(e?.metaKey || e?.ctrlKey)) {
                                  if (!isExpanded) toggleFrame(frame.id);
                                }
                              }}
                              onContextMenu={(e) => openContextMenuAt(frame.id, e)}
                              onBadgeClick={() => {
                                if (!isExpanded) toggleFrame(frame.id);
                                setFocusedFrameId(frame.id);
                                const hook = getSelectFrameHook();
                                if (hook) hook(frame.id);
                              }}
                              testId={`foldo-layer-frame-${frame.id}`}
                            />
                          )}
                          {isExpanded && !isRenaming
                            ? frameComments.map((c) => (
                                <LayerNode
                                  key={c.id}
                                  depth={2}
                                  ariaLevel={3}
                                  iconNode={'◌'}
                                  label={c.text.slice(0, 48) || '(empty)'}
                                  metaText={c.resolved ? '✓' : undefined}
                                  onClick={() => onCommentClick(c)}
                                  testId={`foldo-layer-comment-${c.id}`}
                                />
                              ))
                            : null}
                        </div>
                      );
                    })}
              </div>
            );
          })}
        </div>
      )}

      {contextMenu ? (
        <LayerContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          frameId={contextMenu.frameId}
          canRename={(() => {
            const f = snap.frames.get(contextMenu.frameId);
            return !!f && canRenameFrame(f);
          })()}
          canDuplicate={false}
          onRename={(id) => {
            const f = snap.frames.get(id);
            if (f) beginRename(f);
          }}
          onDuplicate={onDuplicate}
          onDelete={(id) => {
            const f = snap.frames.get(id);
            if (!f) return;
            setFocusedFrameId(id);
            setSelectedFrameIds(new Set([id]));
            void onDelete();
          }}
          onCopyLink={(id) => void onCopyFrameLink(id)}
          onClose={closeContextMenu}
        />
      ) : null}
    </div>
  );
}
