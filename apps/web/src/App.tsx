// Foldo canvas, multiplayer, server-backed Figma-style review surface.
//
// App is a thin shell: it wires together a set of custom hooks (see ./app/),
// assembles the plugin runtime + tool contexts, and renders. The heavy lifting
// — boot sequence, viewport bookkeeping, comments, dispatches, canvas tools,
// keyboard shortcuts — lives in the hooks under ./app/.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Branch, Frame, UserId } from '@foldo/protocol';
import { Canvas, type CanvasHandle } from './components/Canvas';
import { TopBar } from './components/TopBar';
import { LeftRail } from './components/LeftRail';
import { ZoomControl } from './components/ZoomControl';
import { EditPanel } from './components/EditPanel';
import { CaptureModal } from './components/CaptureModal';
import { EmptyBoardState } from './components/EmptyBoardState';
import { TestsPanel } from './components/TestsPanel';
import { Connectors } from './components/Connectors';
import { CommentPopover } from './components/CommentPopover';
import { CursorLayer } from './multiplayer/CursorLayer';
import { SelectionGhosts } from './multiplayer/SelectionGhosts';
import { FrameLayer } from './components/FrameLayer';
import {
  PluginRuntimeProvider,
  type PluginRuntimeValue,
} from './plugins/runtime';
import { SidePanelHost } from './plugins/SidePanelHost';
import { useRoute } from './routing/Router';
import { boardStore, useBoardSnapshot } from './state/useBoardStore';
import { updateComment as apiUpdateComment } from './api/comments';
import type { Comment } from '@foldo/protocol';
import type { SelectedElement, Tool } from './types';
import { useBoardBootstrap, setDemoUserId } from './app/useBoardBootstrap';
import { useCanvasViewport } from './app/useCanvasViewport';
import { useComments } from './app/useComments';
import { useDispatches } from './app/useDispatches';
import { useCanvasTools } from './app/useCanvasTools';
import { useCanvasInteractions } from './app/useCanvasInteractions';
import { useKeyboardShortcuts } from './app/useKeyboardShortcuts';
import {
  BootLoadingOverlay,
  UnreachableOverlay,
  FirstRunHint,
} from './app/uiHelpers';

export { setDemoUserId };

export default function App() {
  const snap = useBoardSnapshot();
  const { route, navigate } = useRoute();

  // ---------- cross-cutting state owned by the shell ----------

  const [tool, setTool] = useState<Tool>('select');
  const [selectedElement, setSelectedElementRaw] =
    useState<SelectedElement | null>(null);
  const [selectedFrameId, setSelectedFrameId] = useState<string | null>(null);
  const [captureOpen, setCaptureOpen] = useState(false);
  const [testsOpen, setTestsOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [followingUserId, setFollowingUserId] = useState<UserId | null>(null);

  const canvasRef = useRef<CanvasHandle>(null);
  const lastBroadcastSelectionRef = useRef<string | null>(null);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 1400);
  }, []);

  // ---------- boot sequence + WebSocket ----------

  const { boot, useOfflineDemo, wsRef } = useBoardBootstrap(route, navigate);

  // ---------- derived: frames / comments-by-frame ----------

  const frames = useMemo(() => Array.from(snap.frames.values()), [snap.frames]);
  const commentsByFrame = useMemo(() => {
    const m = new Map<string, Comment[]>();
    for (const c of snap.comments.values()) {
      const arr = m.get(c.frameId) ?? [];
      arr.push(c);
      m.set(c.frameId, arr);
    }
    return m;
  }, [snap.comments]);

  // ---------- multiplayer outbound ----------

  const onCursorMove = useCallback(
    (x: number, y: number) => {
      wsRef.current?.send({
        type: 'cursor.move',
        cursor: { x, y },
      });
    },
    [wsRef],
  );

  // Broadcast selection updates to the server
  const setSelectedElement = useCallback(
    (sel: SelectedElement | null) => {
      setSelectedElementRaw(sel);
      const key = sel ? `${sel.frameId}|${sel.label}` : null;
      if (lastBroadcastSelectionRef.current !== key) {
        lastBroadcastSelectionRef.current = key;
        wsRef.current?.send({
          type: 'selection.update',
          selection: sel
            ? { frameId: sel.frameId, elementSelector: sel.label }
            : null,
        });
      }
    },
    [wsRef],
  );

  // ---------- comments ----------

  const {
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
  } = useComments({
    snap,
    boot,
    navigate,
    setTool,
    setSelectedElement,
    toast: showToast,
  });

  // ---------- canvas viewport ----------

  const followedViewport = followingUserId
    ? (snap.presence.get(followingUserId)?.viewport ?? null)
    : null;

  const { viewport, setViewport, bounds, fitToFrame } = useCanvasViewport({
    snap,
    frames,
    route,
    navigate,
    canvasRef,
    wsRef,
    boot,
    followedViewport,
    followingUserId,
    setSelectedFrameId,
    setCommentPopover,
  });

  // ---------- dispatches ----------

  const { activeDispatch, sendDispatch, closeEditPanel, onJumpToResult } =
    useDispatches({
      snap,
      boot,
      selectedElement,
      navigate,
      setSelectedElement,
      setInitialIntent,
      fitToFrame,
      toast: showToast,
    });

  // ---------- host-handled canvas tools (arrow drag-preview / image picker) ----------

  const {
    createArrowFrame,
    imageInputRef,
    openImagePicker,
    onImageFileChange,
    arrowDraft,
    arrowDraftRef,
    setArrowDraft,
  } = useCanvasTools({ snap, setTool, toast: showToast });

  // ---------- keyboard shortcuts ----------

  useKeyboardShortcuts({
    canvasRef,
    selectedElement,
    setTool,
    onEscape: useCallback(() => {
      setSelectedElementRaw(null);
      setCommentPopover(null);
      setInitialIntent(undefined);
    }, [setCommentPopover, setInitialIntent]),
    toast: showToast,
  });

  // The Comments inbox plugin asks the host to open a comment popover via a
  // window event (it has no ref into the shell). The frame is focused
  // separately by `foldo:focusFrame`; here we just open the popover + deep-link.
  useEffect(() => {
    const onOpenComment = (e: Event) => {
      const detail = (e as CustomEvent<{ frameId: string; commentId: string }>)
        .detail;
      if (!detail?.commentId) return;
      const c = boardStore.getSnapshot().comments.get(detail.commentId);
      if (!c) return;
      handleCommentClick(c.frameId, c);
    };
    window.addEventListener('foldo:openComment', onOpenComment);
    return () => window.removeEventListener('foldo:openComment', onOpenComment);
  }, [handleCommentClick]);

  // ---------- selection helpers ----------

  const onSelectElement = useCallback(
    (sel: SelectedElement | null) => {
      setSelectedElement(sel);
      if (!sel) setInitialIntent(undefined);
      setCommentPopover(null);
    },
    [setSelectedElement, setInitialIntent, setCommentPopover],
  );

  const onSelectMdLineFromPlugin = useCallback(
    (frameId: string, sectionId: string, lineIndex: number, label: string) => {
      const ff = snap.frames.get(frameId);
      if (!ff || ff.content.kind !== 'markdown') return;
      setSelectedElement({
        frameId,
        label: `${ff.content.docPath} · ${sectionId} · L${lineIndex}`,
        file: ff.content.docPath,
        line: lineIndex,
        currentSource: label,
        rect: { x: 0, y: 0, width: 0, height: 0 },
      });
    },
    [snap.frames, setSelectedElement],
  );

  // ---------- capture ----------

  const onCaptureComplete = useCallback(
    (frame: Frame) => {
      boardStore.upsertFrame(frame);
      setCaptureOpen(false);
      showToast('Frame captured');
      setTimeout(() => fitToFrame(frame, 80), 250);
      if (snap.board) navigate({ boardId: snap.board.id, frameId: frame.id });
    },
    [snap.board, navigate, fitToFrame, showToast],
  );

  // ---------- plugin runtime + tool contexts ----------

  // The plugin runtime context value. Deliberately excludes the camera
  // (zoom / inViewportSet) — those live in viewportStore so a pan/zoom tick
  // never invalidates this object and never re-renders the frame plugins.
  const runtimeValue: PluginRuntimeValue = useMemo(
    () => ({
      tool,
      board: snap.board ?? null,
      selectedElement,
      selectedFrameId,
      commentsByFrame,
      actions: {
        dropPin: handleDropPin,
        openComment: handleCommentClick,
        selectElement: onSelectElement,
        selectMarkdownLine: onSelectMdLineFromPlugin,
        makeEditFromIssue: onMakeEditFromIssue,
        selectFrame: setSelectedFrameId,
      },
    }),
    [
      tool,
      snap.board,
      selectedElement,
      selectedFrameId,
      commentsByFrame,
      handleDropPin,
      handleCommentClick,
      onSelectElement,
      onSelectMdLineFromPlugin,
      onMakeEditFromIssue,
    ],
  );

  // Build the ToolContext that plugin-contributed tools receive on each
  // canvas interaction. Memoised so identity is stable across renders.
  const toolCtx = useMemo(
    () => ({
      board: snap.board ?? null,
      activeBranch: () => {
        if (!snap.board) return null;
        return (
          snap.branches.get('captures') ??
          (snap.branches.values().next().value as Branch | undefined) ??
          null
        );
      },
      setTool: (id: string) => setTool(id),
      upsertFrame: (frame: Frame) => boardStore.upsertFrame(frame),
      toast: (msg: string) => showToast(msg),
    }),
    [snap.board, snap.branches, showToast],
  );

  // ---------- canvas background interactions ----------

  const canvasInteractions = useCanvasInteractions({
    tool,
    snap,
    navigate,
    toolCtx,
    createArrowFrame,
    openImagePicker,
    arrowDraftRef,
    setArrowDraft,
    setSelectedElement,
    setCommentPopover,
  });

  // ---------- popover screen-positioning ----------

  const popoverScreenPos = useMemo(() => {
    if (!commentPopover) return null;
    const f = snap.frames.get(commentPopover.frameId);
    const c = snap.comments.get(commentPopover.commentId);
    if (!f || !c) return null;
    let worldX: number, worldY: number;
    if (c.pin) {
      worldX = f.position.x + c.pin.x * f.size.width;
      worldY = f.position.y + c.pin.y * f.size.height;
    } else {
      worldX = f.position.x;
      worldY = f.position.y + 80;
    }
    return {
      x: worldX * viewport.zoom + viewport.x,
      y: worldY * viewport.zoom + viewport.y,
    };
  }, [commentPopover, snap.frames, snap.comments, viewport]);

  // ---------- render ----------

  const popoverComment = commentPopover
    ? snap.comments.get(commentPopover.commentId)
    : null;

  return (
    <PluginRuntimeProvider value={runtimeValue}>
    <div className="relative w-screen overflow-hidden" style={{ height: '100dvh' }}>
      <Canvas
        ref={canvasRef}
        tool={tool}
        contentBounds={bounds}
        onViewportChange={setViewport}
        onCursorMove={onCursorMove}
        onBackgroundClick={canvasInteractions.onBackgroundClick}
        onBackgroundDragStart={canvasInteractions.onBackgroundDragStart}
        onBackgroundDragMove={canvasInteractions.onBackgroundDragMove}
        onBackgroundDragEnd={canvasInteractions.onBackgroundDragEnd}
      >
        <Connectors />
        <SelectionGhosts meUserId={snap.meUserId} />
        {arrowDraft && (
          <svg
            style={{
              position: 'absolute',
              left: Math.min(arrowDraft.startX, arrowDraft.endX) - 40,
              top: Math.min(arrowDraft.startY, arrowDraft.endY) - 40,
              width:
                Math.abs(arrowDraft.endX - arrowDraft.startX) + 80,
              height:
                Math.abs(arrowDraft.endY - arrowDraft.startY) + 80,
              pointerEvents: 'none',
              overflow: 'visible',
            }}
          >
            <line
              x1={arrowDraft.startX - (Math.min(arrowDraft.startX, arrowDraft.endX) - 40)}
              y1={arrowDraft.startY - (Math.min(arrowDraft.startY, arrowDraft.endY) - 40)}
              x2={arrowDraft.endX - (Math.min(arrowDraft.startX, arrowDraft.endX) - 40)}
              y2={arrowDraft.endY - (Math.min(arrowDraft.startY, arrowDraft.endY) - 40)}
              stroke="#111111"
              strokeWidth={2.5}
              strokeDasharray="6 4"
              strokeLinecap="round"
              opacity={0.6}
            />
          </svg>
        )}
        <FrameLayer />
        <CursorLayer meUserId={snap.meUserId} zoom={viewport.zoom} />
      </Canvas>

      <TopBar
        board={snap.board}
        meUserId={snap.meUserId}
        followingUserId={followingUserId}
        onFollow={(uid) => {
          setFollowingUserId(uid);
          if (uid && wsRef.current) {
            wsRef.current.send({ type: 'follow.start', targetUserId: uid });
          } else if (wsRef.current) {
            wsRef.current.send({ type: 'follow.stop' });
          }
        }}
        onCapture={() => setCaptureOpen(true)}
        onOpenTests={() => setTestsOpen(true)}
        onSwitchUser={(uid) => {
          setDemoUserId(uid);
          // Reload so the new identity propagates to bearer + WS handshake.
          window.location.reload();
        }}
        wsStatus={snap.wsStatus}
        offline={boot.kind === 'offline'}
      />
      <SidePanelHost slot="left" />
      <SidePanelHost slot="right" />
      {/* Single tool bar: always docked at the bottom-centre, icon-only. */}
      <LeftRail tool={tool} onChange={setTool} orientation="horizontal" />
      <input
        ref={imageInputRef}
        type="file"
        accept="image/*"
        style={{ position: 'fixed', left: -9999, top: -9999, opacity: 0 }}
        onChange={onImageFileChange}
      />
      <ZoomControl
        zoom={viewport.zoom}
        onZoomIn={() => canvasRef.current?.zoomIn()}
        onZoomOut={() => canvasRef.current?.zoomOut()}
        onZoomToFit={() => canvasRef.current?.zoomToFit()}
        onReset={() => canvasRef.current?.setZoom(1)}
      />

      {selectedElement &&
        (() => {
          const f = snap.frames.get(selectedElement.frameId);
          const b = f && snap.branches.get(f.branchId);
          if (!f || !b) return null;
          return (
            <EditPanel
              frame={f}
              branch={b}
              selectedElement={selectedElement}
              initialIntent={initialIntent}
              dispatch={activeDispatch}
              onSend={sendDispatch}
              onClose={closeEditPanel}
              onJumpToResult={onJumpToResult}
            />
          );
        })()}

      {commentPopover && popoverComment && popoverScreenPos && (
        <CommentPopover
          comment={popoverComment}
          screenPosition={popoverScreenPos}
          composing={commentPopover.composing}
          onUpdateText={async (text) => {
            const optimistic = { ...popoverComment, text, updatedAt: new Date().toISOString() };
            boardStore.upsertComment(optimistic);
            if (boot.kind === 'offline') return;
            // Local comments (just-dropped pins before the server swap) have
            // an id starting with `c-local-`. Skip the PATCH; the optimistic
            // store update is the source of truth until the server id arrives.
            if (popoverComment.id.startsWith('c-local-')) return;
            try {
              const updated = await apiUpdateComment(popoverComment.id, { text });
              boardStore.upsertComment(updated);
            } catch (err) {
              console.warn('[foldo] update comment failed', err);
              showToast('Failed to save comment');
            }
          }}
          onClose={() => {
            setCommentPopover(null);
            if (snap.board && route.frameId) {
              navigate({ boardId: snap.board.id, frameId: route.frameId });
            }
          }}
          onMakeEdit={onMakeEditFromComment}
          onReply={(text) => onReplyToComment(popoverComment.id, text)}
          onResolve={() => onResolveComment(popoverComment.id)}
          canDelete={
            popoverComment.authorUserId === snap.meUserId || boot.kind === 'offline'
          }
          onDelete={() => onDeleteComment(popoverComment.id)}
        />
      )}

      <CaptureModal
        open={captureOpen}
        boardId={snap.board?.id ?? null}
        meUserId={snap.meUserId}
        onClose={() => setCaptureOpen(false)}
        onComplete={onCaptureComplete}
      />

      <TestsPanel
        open={testsOpen}
        boardId={snap.board?.id ?? null}
        onClose={() => setTestsOpen(false)}
      />

      {boot.kind === 'loading' && <BootLoadingOverlay />}
      {boot.kind === 'unreachable' && (
        <UnreachableOverlay error={boot.error} onOffline={useOfflineDemo} />
      )}

      {/* Brand-new board: hydrated but zero frames. Gated on `hydrated` so it
          never flickers in during board hydration. */}
      {snap.hydrated && frames.length === 0 && !captureOpen && (
        <EmptyBoardState onCapture={() => setCaptureOpen(true)} />
      )}

      {snap.hydrated &&
        frames.length > 0 &&
        !selectedElement &&
        !commentPopover &&
        !captureOpen && <FirstRunHint count={frames.length} />}

      {toast && (
        <div className="pointer-events-none absolute bottom-16 left-1/2 z-50 -translate-x-1/2 rounded-full border border-hairline bg-panel px-4 py-1.5 text-[12px] text-ink shadow-panel fade-in">
          {toast}
        </div>
      )}
    </div>
    </PluginRuntimeProvider>
  );
}
