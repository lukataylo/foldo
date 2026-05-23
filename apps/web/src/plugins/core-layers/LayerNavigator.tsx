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

import { useMemo, useState, type CSSProperties } from 'react';
import type { Branch, Comment, Frame } from '@foldo/protocol';
import { useBoardSnapshot } from '../../state/useBoardStore';
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
  padding: '4px 6px',
  background: 'rgba(255,255,255,0.04)',
  color: '#e8e8ea',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: 4,
  cursor: 'pointer',
  fontSize: 11,
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
  const sortByCreatedAt = (a: Frame, b: Frame): number =>
    (a.createdAt ?? '').localeCompare(b.createdAt ?? '');
  const groups: BranchGroup[] = [];
  for (const branch of branches.values()) {
    const list = (byBranch.get(branch.id) ?? []).slice().sort(sortByCreatedAt);
    groups.push({ branch, frames: list });
  }
  if (orphans.length) {
    groups.push({ branch: null, frames: orphans.slice().sort(sortByCreatedAt) });
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
  // The toolbar exists for v1 to expose the surface; create/rename/delete
  // are best-effort against the existing canvas APIs. Today they toast
  // rather than dispatching real REST calls — those plug in once the
  // plugin has a typed BoardActions channel (Step 11+).

  const onCreate = (): void => {
    notify('Create a frame from the toolbar at the bottom of the canvas.');
  };

  const onRename = (): void => {
    if (!focusedFrameId) {
      notify('Pick a frame in the tree first, then rename.');
      return;
    }
    notify('Rename will land with the DOM editor in Step 11.');
  };

  const onDelete = (): void => {
    if (!focusedFrameId) {
      notify('Pick a frame in the tree first, then delete.');
      return;
    }
    notify('Delete will land with the DOM editor in Step 11.');
  };

  const hasContent = groups.length > 0 && groups.some((g) => g.frames.length > 0);

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
          style={toolbarBtn}
          onClick={onRename}
          data-testid="foldo-layer-rename"
          title="Rename the selected frame"
        >
          Rename
        </button>
        <button
          type="button"
          style={toolbarBtn}
          onClick={onDelete}
          data-testid="foldo-layer-delete"
          title="Delete the selected frame"
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
                      return (
                        <div key={frame.id} role="group">
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
                          {isExpanded
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
