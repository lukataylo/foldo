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

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type DragEvent,
  type KeyboardEvent,
} from 'react';
import type { Branch, Comment, Frame } from '@foldo/protocol';
import { useBoardSnapshot } from '../../state/useBoardStore';
import { boardStore } from '../../state/BoardStore';
import { deleteFrame as apiDeleteFrame, updateFrame as apiUpdateFrame } from '../../api/frames';
import { getSelectFrameHook } from '../registry';
import { LayerNode } from './LayerNode';

// ---------- styles ----------

const containerStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
  height: '100%',
};

const toolbarStyle: CSSProperties = {
  display: 'flex',
  gap: 4,
  paddingBottom: 8,
  borderBottom: '1px solid rgba(255,255,255,0.06)',
};

const toolbarBtn: CSSProperties = {
  flex: 1,
  // A+W1 touch: 4x6 → 10x10 padding so the row is ≥40px tall on iPad.
  padding: '10px 10px',
  minHeight: 40,
  background: 'rgba(255,255,255,0.04)',
  color: '#e8e8ea',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: 4,
  cursor: 'pointer',
  fontSize: 12,
};

const toolbarBtnDisabled: CSSProperties = {
  ...toolbarBtn,
  opacity: 0.4,
  cursor: 'not-allowed',
};

const emptyStyle: CSSProperties = {
  color: '#9a9aa0',
  fontSize: 12,
  padding: '12px 4px',
  textAlign: 'center',
};

const treeStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 1,
  overflow: 'auto',
  flex: 1,
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

  const onFrameClick = (frame: Frame): void => {
    // A+W1: clicking a different row cancels any in-progress rename so the
    // edit doesn't silently get lost as focus moves away.
    if (renamingFrameId && renamingFrameId !== frame.id) {
      setRenamingFrameId(null);
    }
    setFocusedFrameId(frame.id);
    const hook = getSelectFrameHook();
    if (hook) hook(frame.id);
    else notify(`Selected ${frameDisplayName(frame)}`);
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

  const onCreate = (): void => {
    notify('Create a frame from the toolbar at the bottom of the canvas.');
  };

  /* A+W1: start an inline rename for the focused frame. Bails early when the
     frame kind doesn't carry a renameable field — the button is also disabled
     in that case, but this is the second line of defence for keyboard users. */
  const beginRename = useCallback((): void => {
    if (!focusedFrame) {
      notify('Pick a frame in the tree first, then rename.');
      return;
    }
    if (!canRenameFrame(focusedFrame)) {
      notify('Rename only works on doc + sticky frames for now.');
      return;
    }
    setRenamingFrameId(focusedFrame.id);
    setRenameDraft(currentRenameValue(focusedFrame));
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
      // eslint-disable-next-line no-console
      console.error('[core/layers] rename failed', err);
    }
  }, [renamingFrameId, renameDraft, cancelRename]);

  const onRename = (): void => beginRename();

  /* A+W1: delete the focused frame. Confirm when there are comments attached
     so we don't accidentally toss a conversation; raw delete otherwise to keep
     the loop tight for empty scratch frames. */
  const onDelete = useCallback(async (): Promise<void> => {
    if (!focusedFrame) {
      notify('Pick a frame in the tree first, then delete.');
      return;
    }
    const frameComments = commentsForFrame(snap.comments, focusedFrame.id);
    if (frameComments.length > 0) {
      const ok = window.confirm(
        `Delete this frame? It has ${frameComments.length} comment${
          frameComments.length === 1 ? '' : 's'
        } that will go with it.`,
      );
      if (!ok) return;
    }
    const snapshotFrame = focusedFrame;
    // Optimistic removal — the WS frame.removed broadcast will arrive shortly,
    // but for offline / dev this keeps the UI responsive.
    boardStore.removeFrame(snapshotFrame.id);
    setFocusedFrameId(null);
    try {
      await apiDeleteFrame(snapshotFrame.id);
    } catch (err) {
      // Roll back so the user can retry.
      boardStore.upsertFrame(snapshotFrame);
      notify('Failed to delete frame.');
      // eslint-disable-next-line no-console
      console.error('[core/layers] delete failed', err);
    }
  }, [focusedFrame, snap.comments]);

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
        // eslint-disable-next-line no-console
        console.error('[core/layers] reorder failed', err);
      }
    },
    [findGroupOfFrame],
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

  const hasContent = groups.length > 0 && groups.some((g) => g.frames.length > 0);
  const renameDisabled = !focusedFrame || !canRenameFrame(focusedFrame);
  const deleteDisabled = !focusedFrame;

  return (
    <div style={containerStyle} data-testid="foldo-layer-navigator">
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
            !focusedFrame
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
            !focusedFrame
              ? 'Pick a frame in the tree first'
              : 'Delete the selected frame'
          }
        >
          Delete
        </button>
      </div>

      {!hasContent ? (
        <div style={emptyStyle} data-testid="foldo-layer-empty">
          No frames yet. Use the toolbar to add the first one.
        </div>
      ) : (
        <div style={treeStyle} role="tree" aria-label="Board layers">
          {groups.map((group) => {
            const branchId = group.branch?.id ?? '__unassigned__';
            const branchLabel = group.branch?.name ?? 'Unassigned';
            const collapsed = collapsedBranches.has(branchId);
            const branchColor = group.branch?.color ?? '#666';
            return (
              <div key={branchId} role="treeitem" aria-expanded={!collapsed}>
                <LayerNode
                  depth={0}
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
                      const isExpanded = expandedFrames.has(frame.id);
                      const isRenaming = renamingFrameId === frame.id;
                      const isDropTarget = dropTargetFrameId === frame.id;
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
                              iconNode={frameIcon(frame)}
                              label={frameDisplayName(frame)}
                              metaText={
                                frameComments.length
                                  ? `${frameComments.length}c`
                                  : undefined
                              }
                              expandable={frameComments.length > 0}
                              expanded={isExpanded}
                              focused={focusedFrameId === frame.id}
                              onClick={() => {
                                onFrameClick(frame);
                                if (frameComments.length > 0) {
                                  // Auto-expand the comment children on first click.
                                  if (!isExpanded) toggleFrame(frame.id);
                                }
                              }}
                              testId={`foldo-layer-frame-${frame.id}`}
                            />
                          )}
                          {isExpanded && !isRenaming
                            ? frameComments.map((c) => (
                                <LayerNode
                                  key={c.id}
                                  depth={2}
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
    </div>
  );
}
