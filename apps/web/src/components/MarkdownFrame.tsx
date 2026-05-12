import { useEffect, useMemo, useRef, useState } from 'react';
import type {
  Board,
  Branch,
  Comment,
  Frame,
  MarkdownFrameContent,
} from '@foldo/protocol';
import { FrameMeta } from './FrameMeta';
import { MarkdownView, parseMarkdown } from './Markdown';
import { getSource } from '../api/sources';
import type { Tool } from '../types';

interface Props {
  frame: Frame;
  branch: Branch;
  board: Board | null;
  comments: Comment[];
  tool: Tool;
  inViewport: boolean;
  onSelectMdLine: (
    frameId: string,
    sectionId: string,
    lineIndex: number,
    label: string,
  ) => void;
  onCommentClick: (frameId: string, comment: Comment) => void;
}

export function MarkdownFrame({
  frame,
  branch,
  board,
  comments,
  tool,
  inViewport,
  onSelectMdLine,
  onCommentClick,
}: Props) {
  const content = frame.content as MarkdownFrameContent;
  const containerRef = useRef<HTMLDivElement>(null);
  const [remoteBody, setRemoteBody] = useState<string | null>(null);

  // Lazy-fetch the source from /api/sources when this frame becomes visible.
  // Falls back to `content.body` (if present) on error or until the fetch lands.
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
        // ignore — fall back to inline body
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [inViewport, board, frame.commitSha, content.docPath, remoteBody]);

  const body = remoteBody ?? content.body ?? '';

  return (
    <div
      className="absolute"
      style={{
        left: frame.position.x,
        top: frame.position.y,
        width: frame.size.width,
        height: frame.size.height,
      }}
    >
      <FrameMeta frame={frame} branch={branch} />
      <div
        className="relative h-full w-full overflow-hidden rounded-md border border-black/15 bg-markdown frame-shadow"
        style={{ pointerEvents: 'auto' }}
      >
        <DocHeader path={content.docPath} title={content.title} />
        <div
          ref={containerRef}
          className="h-[calc(100%-44px)] overflow-y-auto px-8 py-5"
          style={{
            background: '#f6f1ea',
            color: '#2a2622',
          }}
        >
          {body ? (
            <MarkdownView
              body={body}
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
        <MarkdownAnchors
          frame={frame}
          comments={comments}
          body={body}
          onCommentClick={onCommentClick}
        />
      </div>
    </div>
  );
}

function DocHeader({ path, title }: { path: string; title: string }) {
  return (
    <div className="flex items-center justify-between border-b border-black/10 bg-[#efe8dc] px-4 py-2.5">
      <div className="flex items-center gap-2">
        <FileIcon />
        <span className="font-mono text-[11.5px] text-[#5a4f3e]">{path}</span>
      </div>
      <div className="text-[11px] uppercase tracking-[0.1em] text-[#857a68]">
        {title.endsWith('.md') ? 'markdown' : 'doc'}
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
