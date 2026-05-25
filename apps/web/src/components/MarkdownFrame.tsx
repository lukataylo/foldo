import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  Board,
  Branch,
  Comment,
  Frame,
  MarkdownFrameContent,
} from '@foldo/protocol';
import { FrameMeta } from './FrameMeta';
import { CommentPin } from './CommentPin';
import { MarkdownView, parseMarkdown } from './Markdown';
import { getSource } from '../api/sources';
import { updateFrame as apiUpdateFrame } from '../api/frames';
import { boardStore } from '../state/BoardStore';
import { useBoardSelector } from '../state/useBoardStore';
import type { Tool } from '../types';

interface Props {
  frame: Frame;
  branch: Branch;
  board: Board | null;
  comments: Comment[];
  tool: Tool;
  inViewport: boolean;
  zoom?: number;
  onSelectMdLine: (
    frameId: string,
    sectionId: string,
    lineIndex: number,
    label: string,
  ) => void;
  onCommentClick: (frameId: string, comment: Comment) => void;
  onDropPin?: (frameId: string, xRel: number, yRel: number) => void;
}

export function MarkdownFrame({
  frame,
  branch,
  board,
  comments,
  tool,
  inViewport,
  zoom = 1,
  onSelectMdLine,
  onCommentClick,
  onDropPin,
}: Props) {
  const content = frame.content as MarkdownFrameContent;
  const containerRef = useRef<HTMLDivElement>(null);
  const [remoteBody, setRemoteBody] = useState<string | null>(null);

  // Edit state
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const [showTints, setShowTints] = useState(true);

  // Resolve user → colour / name for tint rendering.
  const users = useBoardSelector((s) => s.users);
  const colorForUser = useCallback(
    (id: string) => users.get(id)?.color ?? '#9a9a9a',
    [users],
  );
  const nameForUser = useCallback(
    (id: string) => users.get(id)?.name ?? id,
    [users],
  );

  // Lazy-fetch the source from /api/sources when this frame becomes visible.
  useEffect(() => {
    if (!inViewport) return;
    if (remoteBody !== null) return;
    if (!board) return;
    let cancelled = false;
    (async () => {
      try {
        const src = await getSource({
          repoSlug: board.repoSlug,
          commitSha: frame.commitSha,
          path: content.docPath,
        });
        if (!cancelled) setRemoteBody(src.body);
      } catch {
        // ignore, fall back to inline body
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [inViewport, board, frame.commitSha, content.docPath, remoteBody]);

  // If the frame is edited remotely (WS `frame.updated` from another user),
  // its inline `content.body` changes. Invalidate our cached `remoteBody` so
  // the lazy-fetch effect above pulls the fresh source.
  useEffect(() => {
    setRemoteBody(null);
  }, [content.body, frame.updatedAt]);

  const body = remoteBody ?? content.body ?? '';

  const startEdit = (): void => {
    setDraft(body);
    setEditing(true);
  };

  const cancelEdit = (): void => {
    setEditing(false);
    setDraft('');
  };

  const saveEdit = async (): Promise<void> => {
    if (saving) return;
    setSaving(true);
    try {
      const nextContent: MarkdownFrameContent = {
        ...content,
        body: draft,
      };
      // Optimistic local update so the UX feels snappy.
      boardStore.upsertFrame({
        ...frame,
        content: nextContent,
        updatedAt: new Date().toISOString(),
      });
      const updated = await apiUpdateFrame(frame.id, { content: nextContent });
      // Server returns the canonical frame with lineAuthors stamped.
      boardStore.upsertFrame(updated);
      // MarkdownFrame renders `remoteBody` (lazy-fetched from /api/sources)
      // in preference to `content.body`. Mirror the just-saved draft into
      // remoteBody so the view reflects the edit immediately — otherwise the
      // save succeeds but the canvas keeps showing the stale source.
      setRemoteBody(draft);
      setEditing(false);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('[foldo] save markdown failed', err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      data-testid="foldo-markdown-frame"
      data-foldo-frame-id={frame.id}
      data-foldo-doc-path={content.docPath}
      className="absolute"
      style={{
        left: frame.position.x,
        top: frame.position.y,
        width: frame.size.width,
        height: frame.size.height,
      }}
    >
      <FrameMeta frame={frame} branch={branch} zoom={zoom} />
      <div
        className="relative h-full w-full overflow-hidden rounded-md border border-black/15 bg-markdown frame-shadow"
        style={{ pointerEvents: 'auto' }}
      >
        <DocHeader
          path={content.docPath}
          title={content.title}
          lastEditedAt={content.lastEditedAt}
          lastEditedByName={content.lastEditedBy ? nameForUser(content.lastEditedBy) : undefined}
          editing={editing}
          showTints={showTints}
          saving={saving}
          onToggleTints={() => setShowTints((v) => !v)}
          onStartEdit={startEdit}
          onCancel={cancelEdit}
          onSave={() => void saveEdit()}
        />
        <div
          ref={containerRef}
          data-testid="foldo-markdown-body"
          data-canvas-scroll="true"
          className="h-[calc(100%-44px)] overflow-y-auto px-8 py-5"
          style={{
            background: '#f6f1ea',
            color: '#2a2622',
          }}
          onDoubleClick={(e) => {
            // Double-click anywhere in the body enters edit mode (Figma-ish).
            if (editing) return;
            const target = e.target as HTMLElement;
            if (target.closest('button, a, textarea, [data-no-edit]')) return;
            startEdit();
          }}
        >
          {editing ? (
            <textarea
              data-testid="foldo-markdown-textarea"
              autoFocus
              spellCheck
              className="block h-full w-full resize-none rounded-md border border-black/10 bg-white px-3 py-2 font-mono text-[12.5px] leading-[1.6] text-[#2a2622] outline-none focus:border-accent/60"
              style={{ minHeight: 240 }}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                  e.preventDefault();
                  void saveEdit();
                } else if (e.key === 'Escape') {
                  e.preventDefault();
                  cancelEdit();
                }
              }}
            />
          ) : body ? (
            <MarkdownView
              body={body}
              lineAuthors={showTints ? content.lineAuthors : undefined}
              colorForUser={colorForUser}
              nameForUser={nameForUser}
              highlightedAnchors={comments
                .filter((c) => c.anchor)
                .map((c) => c.anchor!)}
              onLineClick={(line) => {
                if (tool === 'comment' || tool === 'select') {
                  onSelectMdLine(
                    frame.id,
                    line.sectionId,
                    line.indexInSection,
                    line.text,
                  );
                }
              }}
            />
          ) : (
            <MarkdownSkeleton />
          )}
        </div>

        {/* anchor pins on left gutter */}
        {!editing && (
          <MarkdownAnchors
            frame={frame}
            comments={comments}
            body={body}
            onCommentClick={onCommentClick}
          />
        )}

        {/* Comment-tool overlay: capture clicks to drop a pin. Only active when
            the comment tool is selected; otherwise pointer-events:none so the
            markdown body stays scrollable and double-clickable. */}
        {tool === 'comment' && onDropPin && (
          <div
            className="absolute inset-0 z-20"
            style={{ cursor: 'crosshair', pointerEvents: 'auto' }}
            onPointerDown={(e) => {
              if (e.button !== 0) return;
              const rect = e.currentTarget.getBoundingClientRect();
              const xRel = (e.clientX - rect.left) / rect.width;
              const yRel = (e.clientY - rect.top) / rect.height;
              onDropPin(frame.id, xRel, yRel);
              e.preventDefault();
              e.stopPropagation();
            }}
          />
        )}

        {/* free-floating pin overlay (xy-pin comments without a line anchor).
            Skipped when the frame is off-viewport so we don't keep N pin nodes
            + click handlers mounted for frames the user can't see. */}
        {!editing &&
          inViewport &&
          comments
            .filter((c) => c.pin)
            .map((c) => (
              <CommentPin
                key={c.id}
                comment={c}
                frameSize={{ width: frame.size.width, height: frame.size.height }}
                onClick={() => onCommentClick(frame.id, c)}
              />
            ))}
      </div>
    </div>
  );
}

interface DocHeaderProps {
  path: string;
  title: string;
  lastEditedAt?: string;
  lastEditedByName?: string;
  editing: boolean;
  showTints: boolean;
  saving: boolean;
  onToggleTints: () => void;
  onStartEdit: () => void;
  onCancel: () => void;
  onSave: () => void;
}

function DocHeader({
  path,
  title,
  lastEditedAt,
  lastEditedByName,
  editing,
  showTints,
  saving,
  onToggleTints,
  onStartEdit,
  onCancel,
  onSave,
}: DocHeaderProps) {
  return (
    <div className="flex items-center justify-between border-b border-black/10 bg-[#efe8dc] px-4 py-2.5">
      <div className="flex min-w-0 items-center gap-2">
        <FileIcon />
        <span className="font-mono text-[11.5px] text-[#5a4f3e]">{path}</span>
        {lastEditedAt && lastEditedByName && (
          <span
            className="ml-1 truncate text-[10.5px] text-[#857a68]"
            title={lastEditedAt}
          >
            · last edit by {lastEditedByName.split(' ')[0]} {formatRelative(lastEditedAt)}
          </span>
        )}
      </div>
      <div className="flex flex-shrink-0 items-center gap-2">
        {!editing && (
          <button
            type="button"
            data-no-edit
            onClick={onToggleTints}
            className={
              'whitespace-nowrap rounded-md border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-[0.06em] ' +
              (showTints
                ? 'border-accent/40 bg-accent/10 text-accent'
                : 'border-black/15 bg-white/60 text-[#857a68] hover:bg-white')
            }
            title="Toggle author colour tints on each edited line"
          >
            tints {showTints ? 'on' : 'off'}
          </button>
        )}
        {!editing ? (
          <button
            type="button"
            data-testid="foldo-markdown-edit-button"
            data-no-edit
            onClick={onStartEdit}
            className="rounded-md border border-black/15 bg-white/60 px-2 py-0.5 text-[11px] font-medium text-[#5a4f3e] hover:bg-white"
          >
            Edit
          </button>
        ) : (
          <>
            <button
              type="button"
              data-testid="foldo-markdown-cancel-button"
              data-no-edit
              onClick={onCancel}
              disabled={saving}
              className="rounded-md border border-black/15 bg-white/60 px-2 py-0.5 text-[11px] font-medium text-[#5a4f3e] hover:bg-white disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              data-testid="foldo-markdown-save-button"
              data-no-edit
              onClick={onSave}
              disabled={saving}
              className="rounded-md bg-[#5a4f3e] px-2 py-0.5 text-[11px] font-medium text-white hover:bg-[#3e372b] disabled:opacity-60"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          </>
        )}
        <div className="text-[11px] uppercase tracking-[0.1em] text-[#857a68]">
          {title.endsWith('.md') ? 'markdown' : 'doc'}
        </div>
      </div>
    </div>
  );
}

function MarkdownAnchors({
  frame,
  comments,
  body,
  onCommentClick,
}: {
  frame: Frame;
  comments: Comment[];
  body: string;
  onCommentClick: (frameId: string, c: Comment) => void;
}) {
  const lines = useMemo(() => parseMarkdown(body), [body]);
  const lineHeightAvg = 20;
  const headerHeight = 44 + 20;
  return (
    <>
      {comments
        .filter((c) => c.anchor)
        .map((c) => {
          const idx = lines.findIndex(
            (l) =>
              l.sectionId === c.anchor!.sectionId &&
              l.indexInSection === (c.anchor!.lineStart ?? 1),
          );
          if (idx === -1) return null;
          const y = headerHeight + idx * lineHeightAvg;
          return (
            <button
              key={c.id}
              data-testid="foldo-comment-anchor"
              data-foldo-comment-id={c.id}
              onClick={(e) => {
                e.stopPropagation();
                onCommentClick(frame.id, c);
              }}
              className="absolute z-30 flex h-6 w-6 -translate-y-1/2 items-center justify-center"
              style={{ left: -10, top: y }}
              aria-label={`Comment by ${c.authorName}`}
            >
              <span
                className="flex h-6 w-6 items-center justify-center rounded-full rounded-bl-none text-[11px] font-semibold text-white shadow-pin"
                style={{ background: c.authorColor }}
              >
                {c.authorInitial}
              </span>
            </button>
          );
        })}
    </>
  );
}

function MarkdownSkeleton() {
  return (
    <div className="space-y-3">
      <div className="h-5 w-2/3 rounded bg-black/5" />
      <div className="h-3 w-full rounded bg-black/5" />
      <div className="h-3 w-5/6 rounded bg-black/5" />
      <div className="h-3 w-3/4 rounded bg-black/5" />
      <div className="mt-5 h-4 w-1/3 rounded bg-black/5" />
      <div className="h-3 w-full rounded bg-black/5" />
      <div className="h-3 w-4/6 rounded bg-black/5" />
    </div>
  );
}

function FileIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 16 16" fill="none">
      <path
        d="M4 2.5h5.5L13 6v7.5a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V3.5a1 1 0 0 1 1-1z"
        stroke="#5a4f3e"
        strokeWidth="1.2"
      />
      <path d="M9.5 2.5V6H13" stroke="#5a4f3e" strokeWidth="1.2" />
    </svg>
  );
}

function formatRelative(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return '';
  const diff = Date.now() - t;
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return 'just now';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  return `${day}d ago`;
}
