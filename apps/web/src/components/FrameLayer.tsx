// FrameLayer — the 7-way frame rendering loop, extracted from App.tsx so it
// has its own store subscription scope. App.tsx still re-renders on every
// store change (cursor moves, dispatch progress, etc.) but the inner frame
// tree only re-renders when its own inputs change (frames, branches, board,
// or one of the passed-in props).
//
// Also wraps each frame in a per-frame ErrorBoundary so a single bad frame
// (e.g. malformed content_json from a bad WS message) doesn't blank the whole
// canvas. Completes the Phase-0 deferred per-frame boundary work.

import { memo, useMemo } from 'react';
import type {
  Board,
  Branch,
  Comment,
  Frame,
  TestSessionIssue,
} from '@foldo/protocol';
import { useBoardSelector } from '../state/useBoardStore';
import { AppFrame } from './AppFrame';
import { ArrowFrame } from './ArrowFrame';
import { ImageFrame } from './ImageFrame';
import { MarkdownFrame } from './MarkdownFrame';
import { StickyFrame } from './StickyFrame';
import { TestSessionFrame } from './TestSessionFrame';
import { TestSummaryFrame } from './TestSummaryFrame';
import { ErrorBoundary } from './ErrorBoundary';
import type { SelectedElement, Tool } from '../types';

const MemoAppFrame = memo(AppFrame);
const MemoMarkdownFrame = memo(MarkdownFrame);
const MemoStickyFrame = memo(StickyFrame);
const MemoArrowFrame = memo(ArrowFrame);
const MemoImageFrame = memo(ImageFrame);
const MemoTestSummaryFrame = memo(TestSummaryFrame);
const MemoTestSessionFrame = memo(TestSessionFrame);

interface Props {
  tool: Tool;
  selectedElement: SelectedElement | null;
  zoom: number;
  /** Pre-grouped per-frame comments computed once in App. */
  commentsByFrame: Map<string, Comment[]>;
  /** Frame ids currently in (or near) the viewport. */
  inViewportSet: ReadonlySet<string>;
  onSelectElement: (sel: SelectedElement | null) => void;
  onDropPin: (frameId: string, x: number, y: number) => void;
  onCommentClick: (frameId: string, comment: Comment) => void;
  onMakeEditFromIssue: (frame: Frame, issue: TestSessionIssue) => void;
  /**
   * App-level callback for selecting a markdown line. Wired here (not inlined)
   * so FrameLayer doesn't need to know about App's selection state.
   */
  onSelectMdLine: (
    frameId: string,
    sectionId: string,
    lineIndex: number,
    label: string,
  ) => void;
}

export const FrameLayer = memo(function FrameLayer({
  tool,
  selectedElement,
  zoom,
  commentsByFrame,
  inViewportSet,
  onSelectElement,
  onDropPin,
  onCommentClick,
  onMakeEditFromIssue,
  onSelectMdLine,
}: Props) {
  // Store reads live here, not in App, so an unrelated store patch (cursor
  // move, presence update, dispatch status) doesn't re-render the frame tree.
  const framesMap = useBoardSelector((s) => s.frames);
  const branchesMap = useBoardSelector((s) => s.branches);
  const board = useBoardSelector((s) => s.board);

  // Derive the ordered list from the Map. Map iteration is insertion-order,
  // which matches what the seed produces and what callers expect.
  const frames = useMemo(() => Array.from(framesMap.values()), [framesMap]);

  return (
    <>
      {frames.map((f) => {
        const branch = branchesMap.get(f.branchId);
        if (!branch) return null;
        const comments = commentsByFrame.get(f.id) ?? [];
        const inViewport = inViewportSet.has(f.id);
        return (
          <ErrorBoundary
            key={f.id}
            label={`frame ${f.id}`}
            fallback={(err, retry) => (
              <FrameErrorBadge frame={f} err={err} retry={retry} />
            )}
          >
            {renderFrame({
              f,
              branch,
              board,
              comments,
              inViewport,
              tool,
              selectedElement,
              zoom,
              onSelectElement,
              onDropPin,
              onCommentClick,
              onMakeEditFromIssue,
              onSelectMdLine,
            })}
          </ErrorBoundary>
        );
      })}
    </>
  );
});

// Per-frame switch extracted out of the loop so the JSX above stays readable.
// Returns null for frame kinds we don't render (defensive — TypeScript already
// enforces exhaustiveness via the FrameKind union).
function renderFrame(args: {
  f: Frame;
  branch: Branch;
  board: Board | null;
  comments: Comment[];
  inViewport: boolean;
  tool: Tool;
  selectedElement: SelectedElement | null;
  zoom: number;
  onSelectElement: Props['onSelectElement'];
  onDropPin: Props['onDropPin'];
  onCommentClick: Props['onCommentClick'];
  onMakeEditFromIssue: Props['onMakeEditFromIssue'];
  onSelectMdLine: Props['onSelectMdLine'];
}): React.ReactNode {
  const {
    f,
    branch,
    board,
    comments,
    inViewport,
    tool,
    selectedElement,
    zoom,
    onSelectElement,
    onDropPin,
    onCommentClick,
    onMakeEditFromIssue,
    onSelectMdLine,
  } = args;

  switch (f.kind) {
    case 'app':
      return (
        <MemoAppFrame
          frame={f}
          branch={branch}
          comments={comments}
          tool={tool}
          selectedElement={selectedElement}
          onSelectElement={onSelectElement}
          onDropPin={onDropPin}
          onCommentClick={onCommentClick}
          inViewport={inViewport}
          zoom={zoom}
        />
      );
    case 'sticky':
      return <MemoStickyFrame frame={f} branch={branch} zoom={zoom} />;
    case 'arrow':
      return <MemoArrowFrame frame={f} branch={branch} zoom={zoom} />;
    case 'image':
      return (
        <MemoImageFrame
          frame={f}
          branch={branch}
          zoom={zoom}
          tool={tool}
          comments={comments}
          onDropPin={onDropPin}
          onCommentClick={onCommentClick}
        />
      );
    case 'test_summary':
      return <MemoTestSummaryFrame frame={f} branch={branch} zoom={zoom} />;
    case 'test_session':
      return (
        <MemoTestSessionFrame
          frame={f}
          branch={branch}
          zoom={zoom}
          onMakeEditFromIssue={onMakeEditFromIssue}
        />
      );
    case 'markdown':
      return (
        <MemoMarkdownFrame
          frame={f}
          branch={branch}
          board={board}
          comments={comments}
          tool={tool}
          inViewport={inViewport}
          zoom={zoom}
          onSelectMdLine={onSelectMdLine}
          onCommentClick={onCommentClick}
          onDropPin={onDropPin}
        />
      );
    default:
      // Exhaustive: every FrameKind has a case above. If a new kind is added
      // without a case, TS narrowing leaves `f` as `never` here.
      return null;
  }
}

// Tiny inline fallback shown in place of a frame that threw during render.
// Keeps its bounding box so the rest of the canvas layout isn't disturbed.
function FrameErrorBadge({
  frame,
  err,
  retry,
}: {
  frame: Frame;
  err: Error;
  retry: () => void;
}) {
  return (
    <div
      className="absolute flex flex-col items-start justify-center rounded-md border border-warn/40 bg-warn/10 p-3 text-[11px] text-warn"
      style={{
        left: frame.position.x,
        top: frame.position.y,
        width: frame.size.width,
        height: frame.size.height,
      }}
      role="alert"
    >
      <span className="font-semibold">Frame failed to render</span>
      <span className="mt-0.5 truncate text-[10.5px] opacity-80" title={err.message}>
        {err.message}
      </span>
      <button
        onClick={retry}
        className="mt-2 rounded border border-warn/40 px-2 py-0.5 text-[10.5px] hover:bg-warn/15"
      >
        Try again
      </button>
    </div>
  );
}

