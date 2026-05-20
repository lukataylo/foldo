// Comments inbox plugin — right-side panel that lists every comment on the
// board so they can be found and triaged off-canvas. On a busy board, comment
// pins are easy to lose; this panel groups them by Open / Resolved, shows the
// author + text snippet + which frame, and clicking a row focuses the frame on
// the canvas and opens the comment popover.
//
// Structure mirrors plugins/layers/: a `FoldoPlugin` registered in main.tsx,
// reading board state via the BoardStore selector hook. Focus is requested via
// the `foldo:focusFrame` window event (already handled in useCanvasViewport)
// plus a `foldo:openComment` event the host listens for to open the popover.

import { useCallback, useMemo, useState } from 'react';
import type { Comment, Frame } from '@foldo/protocol';
import type { FoldoPlugin } from '@foldo/plugin-api';
import { useBoardSelector } from '../../state/useBoardStore';
import { registry } from '../registry';

type Filter = 'open' | 'resolved' | 'all';

/** Local view-model row — keeps new types out of packages/protocol. */
interface InboxRow {
  comment: Comment;
  frame: Frame | undefined;
  frameLabel: string;
}

function frameLabelFor(frame: Frame | undefined): string {
  if (!frame) return 'Unknown frame';
  const plugin = registry.getFrameKind(frame.kind);
  if (plugin?.layerLabel) return plugin.layerLabel(frame);
  if (plugin?.label) return plugin.label;
  return frame.kind;
}

function snippetOf(text: string): string {
  const t = text.trim();
  if (!t) return 'No comment text';
  return t.length > 90 ? t.slice(0, 89) + '…' : t;
}

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const diff = Date.now() - then;
  const min = Math.round(diff / 60_000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h`;
  return `${Math.round(hr / 24)}d`;
}

function CommentsPanel() {
  // Select only the comments + frames Maps. BoardStore keeps Maps by reference
  // when untouched, so panning/zooming and unrelated patches don't re-run this.
  const comments = useBoardSelector((s) => s.comments);
  const frames = useBoardSelector((s) => s.frames);
  const hydrated = useBoardSelector((s) => s.hydrated);

  const [filter, setFilter] = useState<Filter>('open');

  const rows = useMemo<InboxRow[]>(() => {
    const all: InboxRow[] = [];
    for (const c of comments.values()) {
      // Skip empty just-dropped local pins that have no body yet.
      if (!c.text.trim()) continue;
      const frame = frames.get(c.frameId);
      all.push({ comment: c, frame, frameLabel: frameLabelFor(frame) });
    }
    // Newest first.
    all.sort((a, b) =>
      a.comment.createdAt < b.comment.createdAt
        ? 1
        : a.comment.createdAt > b.comment.createdAt
          ? -1
          : 0,
    );
    return all;
  }, [comments, frames]);

  const counts = useMemo(() => {
    let open = 0;
    let resolved = 0;
    for (const r of rows) {
      if (r.comment.resolved) resolved++;
      else open++;
    }
    return { open, resolved, all: rows.length };
  }, [rows]);

  const visible = useMemo(() => {
    if (filter === 'all') return rows;
    const wantResolved = filter === 'resolved';
    return rows.filter((r) => r.comment.resolved === wantResolved);
  }, [rows, filter]);

  const onOpen = useCallback((row: InboxRow) => {
    // Focus the frame on the canvas (handled in useCanvasViewport) …
    window.dispatchEvent(
      new CustomEvent('foldo:focusFrame', {
        detail: { id: row.comment.frameId },
      }),
    );
    // … then ask the host to open this comment's popover.
    window.dispatchEvent(
      new CustomEvent('foldo:openComment', {
        detail: { frameId: row.comment.frameId, commentId: row.comment.id },
      }),
    );
  }, []);

  if (!hydrated) {
    return <div className="px-3 py-4 text-[11.5px] text-inkFaint">Loading…</div>;
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center gap-1 border-b border-hairlineSoft px-2 py-1.5">
        <FilterTab
          label="Open"
          count={counts.open}
          active={filter === 'open'}
          onClick={() => setFilter('open')}
        />
        <FilterTab
          label="Resolved"
          count={counts.resolved}
          active={filter === 'resolved'}
          onClick={() => setFilter('resolved')}
        />
        <FilterTab
          label="All"
          count={counts.all}
          active={filter === 'all'}
          onClick={() => setFilter('all')}
        />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto py-1">
        {visible.length === 0 ? (
          <div className="px-3 py-6 text-center text-[11.5px] leading-relaxed text-inkFaint">
            {filter === 'resolved'
              ? 'Nothing resolved yet.'
              : filter === 'open'
                ? 'No open comments. Drop a pin on a frame to start one.'
                : 'No comments on this board yet.'}
          </div>
        ) : (
          visible.map((row) => (
            <CommentRow key={row.comment.id} row={row} onOpen={onOpen} />
          ))
        )}
      </div>
    </div>
  );
}

function FilterTab({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={
        'touch-target flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-medium transition-colors ' +
        (active
          ? 'bg-white/10 text-ink'
          : 'text-inkMute hover:bg-white/5 hover:text-ink')
      }
    >
      {label}
      <span
        className={
          'rounded-full px-1.5 text-[10px] ' +
          (active ? 'bg-accent/20 text-accent' : 'bg-white/5 text-inkFaint')
        }
      >
        {count}
      </span>
    </button>
  );
}

function CommentRow({
  row,
  onOpen,
}: {
  row: InboxRow;
  onOpen: (row: InboxRow) => void;
}) {
  const { comment } = row;
  return (
    <button
      data-comment-inbox-id={comment.id}
      data-comment-inbox-frame={comment.frameId}
      onClick={() => onOpen(row)}
      className="group flex w-full items-start gap-2 px-2.5 py-2 text-left hover:bg-white/5"
    >
      <span
        className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[9px] font-semibold text-white"
        style={{ background: comment.authorColor }}
        title={comment.authorName}
      >
        {comment.authorInitial}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className="truncate text-[11.5px] font-medium text-ink">
            {comment.authorName}
          </span>
          <span className="shrink-0 text-[10px] text-inkFaint">
            {relativeTime(comment.createdAt)}
          </span>
          {comment.resolved && (
            <span className="shrink-0 rounded-full bg-white/5 px-1.5 text-[9px] text-inkMute">
              Resolved
            </span>
          )}
        </span>
        <span className="mt-0.5 block text-[11.5px] leading-snug text-inkMute">
          {snippetOf(comment.text)}
        </span>
        <span className="mt-1 flex items-center gap-1 text-[10px] text-inkFaint">
          <FrameGlyph />
          <span className="truncate">{row.frameLabel}</span>
          {comment.replies.length > 0 && (
            <span className="shrink-0">· {comment.replies.length} repl{comment.replies.length === 1 ? 'y' : 'ies'}</span>
          )}
        </span>
      </span>
    </button>
  );
}

function FrameGlyph() {
  return (
    <svg width="9" height="9" viewBox="0 0 16 16" fill="none">
      <rect
        x="2.5"
        y="2.5"
        width="11"
        height="11"
        rx="1.4"
        stroke="currentColor"
        strokeWidth="1.4"
      />
    </svg>
  );
}

function CommentsIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
      <path
        d="M2.5 3.5h11v7h-6l-3 2.5v-2.5h-2v-7z"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
      <path
        d="M5 6.5h6M5 8.5h4"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
    </svg>
  );
}

export const commentsPlugin: FoldoPlugin = {
  id: 'foldo:comments',
  register(api) {
    api.registerSidePanel({
      id: 'comments',
      slot: 'right',
      label: 'Comments',
      Icon: CommentsIcon,
      defaultOpen: false,
      defaultWidth: 280,
      Component: CommentsPanel,
    });
  },
};
