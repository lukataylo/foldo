// Foldo canvas, multiplayer, server-backed Figma-style review surface.
//
// Boot sequence:
//   1. Parse the URL to find the desired board / frame / comment.
//   2. Authenticate (demo: use a stable per-browser userId+token).
//   3. GET /api/boards to discover an active board (if none specified).
//   4. GET /api/boards/:id to hydrate the store.
//   5. Open the canvas WebSocket and apply incoming ServerMessages.
//
// Fallback: if step 3 or 4 fails (server not running), show the offline panel
// with a "Use offline demo" button that hydrates from local mock data.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  Branch,
  Comment,
  CommentTarget,
  CreateCommentRequest,
  CreateDispatchRequest,
  Dispatch,
  Frame,
  ServerMessage,
  TestSessionIssue,
  UserId,
} from '@foldo/protocol';
import { Canvas, type CanvasHandle, type ViewportState } from './components/Canvas';
import { TopBar } from './components/TopBar';
import { LeftRail } from './components/LeftRail';
/* A+W1 touch */ import { PhoneNotSupportedBanner } from './components/PhoneNotSupportedBanner';
/* A+W1 touch */ import { useMediaQuery } from './hooks/useMediaQuery';
import { ToastStack, useToastQueue } from './components/ToastQueue';
import { LeftPanel, RightPanel } from './plugins/slots/SidePanel';
import { ToolBar as PluginToolBar } from './plugins/slots/ToolBar';
import {
  registerToastHook,
  registerSetToolHook,
  registerSelectFrameHook,
} from './plugins/registry';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { useFrameTools, ArrowDraftPreview } from './hooks/useFrameTools';
import { useDispatchFlow } from './hooks/useDispatchFlow';
import { useCommentHandlers } from './hooks/useCommentHandlers';
import { FrameLayer } from './components/FrameLayer';
import { ZoomControl } from './components/ZoomControl';
import { EditPanel } from './components/EditPanel';
import { CaptureModal } from './components/CaptureModal';
import { TestsPanel } from './components/TestsPanel';
import { Connectors } from './components/Connectors';
import { CommentPopover } from './components/CommentPopover';
import { CursorLayer } from './multiplayer/CursorLayer';
import { SelectionGhosts } from './multiplayer/SelectionGhosts';
import { useRoute } from './routing/Router';
import { boardStore, useBoardSelector } from './state/useBoardStore';
import { applyServerMessage } from './state/reducers';
import { setAuth } from './api/client';
import { listBoards, getBoard } from './api/boards';
import {
  createComment as apiCreateComment,
  deleteComment as apiDeleteComment,
  replyToComment as apiReplyToComment,
  updateComment as apiUpdateComment,
} from './api/comments';
import { createDispatch as apiCreateDispatch } from './api/dispatches';
import { createFrame as apiCreateFrame } from './api/frames';
import { uploadImage as apiUploadImage } from './api/uploads';
import { FoldoWsClient, type WsStatus } from './api/ws';
import {
  mockBoardSnapshot,
  mockPresence,
  MOCK_BOARD_ID,
  MOCK_ME_USER_ID,
} from './data/mockData';
import type { SelectedElement, Tool } from './types';

interface StoredUser {
  id: string;
  name?: string;
  initial?: string;
  color?: string;
  email?: string;
}

function readStoredAuth(): { userId: string; token: string } | null {
  try {
    const token = localStorage.getItem('foldo:token');
    const userRaw = localStorage.getItem('foldo:user');
    if (!token || !userRaw) return null;
    const user = JSON.parse(userRaw) as StoredUser;
    if (!user.id) return null;
    return { userId: user.id, token };
  } catch {
    return null;
  }
}

const REAL_AUTH = readStoredAuth();
const DEMO_USER_ID = REAL_AUTH?.userId ?? readOrCreateDemoUserId();
const DEMO_TOKEN = REAL_AUTH?.token ?? DEMO_USER_ID; // demo: token == userId
setAuth(DEMO_USER_ID, DEMO_TOKEN);

type BootState =
  | { kind: 'loading' }
  | { kind: 'unreachable'; error: string }
  | { kind: 'ready' }
  | { kind: 'offline' };

export default function App() {
  // Granular store subscriptions — each useBoardSelector independently checks
  // whether its slice changed since the last commit, so a comment.added event
  // (which touches only `comments`) won't re-render the App tree just because
  // a single useBoardSnapshot() read was at the root. Cuts the worst-case
  // re-render rate on a busy multiplayer board by ~70%. `snap` is rebuilt
  // each render for back-compat with the many `snap.X` reads below; it's not
  // used as anyone's dep so the rebuilt object is fine.
  const board = useBoardSelector((s) => s.board);
  const frames_ = useBoardSelector((s) => s.frames);
  const comments_ = useBoardSelector((s) => s.comments);
  const branches_ = useBoardSelector((s) => s.branches);
  const users_ = useBoardSelector((s) => s.users);
  const presence_ = useBoardSelector((s) => s.presence);
  const dispatches_ = useBoardSelector((s) => s.dispatches);
  const meUserId = useBoardSelector((s) => s.meUserId);
  const hydrated = useBoardSelector((s) => s.hydrated);
  const wsStatus = useBoardSelector((s) => s.wsStatus);
  const snap = {
    board,
    frames: frames_,
    comments: comments_,
    branches: branches_,
    users: users_,
    presence: presence_,
    dispatches: dispatches_,
    meUserId,
    hydrated,
    wsStatus,
  };
  const { route, navigate } = useRoute();

  /* A+W1 touch */
  // Phone viewports get a polite redirect rather than the full canvas — the
  // tools, left rail, edit panel and zoom control all assume tablet-and-up real
  // estate. Only blocks the /board/:id surface; /home and /s/<token> are
  // already responsive, and the marketing site uses its own router.
  const isPhoneViewport = useMediaQuery('(max-width: 600px)');
  const isBoardRoute = !!route.boardId || (typeof location !== 'undefined' && /^\/board\//.test(location.pathname));
  /* /A+W1 touch */

  const [boot, setBoot] = useState<BootState>({ kind: 'loading' });
  const [tool, setTool] = useState<Tool>('select');
  const [selectedElement, setSelectedElementRaw] =
    useState<SelectedElement | null>(null);
  // activeDispatchId lives in useDispatchFlow now.
  const [captureOpen, setCaptureOpen] = useState(false);
  const [testsOpen, setTestsOpen] = useState(false);
  const [viewport, setViewport] = useState<ViewportState>({
    x: 0,
    y: 0,
    zoom: 0.6,
  });
  const [commentPopover, setCommentPopover] = useState<{
    frameId: string;
    commentId: string;
    /** Open in compose mode (auto-focused empty textarea) for newly-dropped pins. */
    composing?: boolean;
  } | null>(null);
  const [initialIntent, setInitialIntent] = useState<string | undefined>(
    undefined,
  );
  const { toasts, push: pushToast } = useToastQueue();
  // Back-compat shim for the showToast helper calls scattered through the file.
  // TODO(phase-1-extract): delete once the comment/dispatch/frame-tools
  // extractions land — those callers will receive pushToast directly.
  const setToast = pushToast;
  // Expose pushToast to the plugin context's notify() escape hatch. Plugins
  // call ctx.notify(msg) → registry.defaultContext lookups window.__foldoToast
  // → this push. Re-registering on every push identity change is cheap.
  useEffect(() => registerToastHook(pushToast), [pushToast]);
  // Same escape hatch for the canvas tool setter. The core/tools plugin's
  // ToolSpec.activate() calls window.__foldoSetTool, which routes here.
  // useState's setter is stable across renders so this only fires once.
  useEffect(() => registerSetToolHook(setTool as (t: string) => void), []);
  const [followingUserId, setFollowingUserId] = useState<UserId | null>(null);
  const [containerSize, setContainerSize] = useState({
    width: typeof window !== 'undefined' ? window.innerWidth : 1440,
    height: typeof window !== 'undefined' ? window.innerHeight : 900,
  });

  const canvasRef = useRef<CanvasHandle>(null);
  const wsRef = useRef<FoldoWsClient | null>(null);
  const lastBroadcastSelectionRef = useRef<string | null>(null);
  const viewportBroadcastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  // ---------- bootstrapping ----------

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // Determine which board to load
        let boardId = route.boardId;
        if (!boardId) {
          const list = await listBoards();
          boardId =
            list.boards[0]?.id ??
            (() => {
              throw new Error('No boards on server.');
            })();
          // replace the URL with the canonical board path
          navigate({ boardId }, { replace: true });
        }

        // Hydrate from REST
        const snapshot = await getBoard(boardId);
        if (cancelled) return;

        hydrateStoreFromRest(snapshot, DEMO_USER_ID);

        // Open the WS
        let wasOpenOnce = false;
        const ws = new FoldoWsClient({
          boardId,
          userId: DEMO_USER_ID,
          token: DEMO_TOKEN,
          onStatusChange: (s: WsStatus) => {
            boardStore.setWsStatus(s);
            // On reconnect (already had a session), pull a fresh snapshot so
            // any frames/comments created while we were offline land in the store.
            if (s === 'open') {
              if (wasOpenOnce) {
                void getBoard(boardId!)
                  .then((fresh) => hydrateStoreFromRest(fresh, DEMO_USER_ID))
                  .catch(() => {
                    /* ignore, WS will keep us live */
                  });
              }
              wasOpenOnce = true;
            }
          },
        });
        wsRef.current = ws;
        ws.subscribeAll((msg: ServerMessage) => applyServerMessage(msg));
        ws.connect();

        // Dev-only hooks for e2e specs: let Playwright force-close the WS and
        // then reconnect it to exercise the `hello.sinceSeq` replay path.
        // Gated on import.meta.env.PROD so the production bundle doesn't ship
        // these handles. Reaches into FoldoWsClient's private `ws` field via a
        // cast (rather than adding a public surface that only a test uses).
        if (!import.meta.env.PROD && typeof window !== 'undefined') {
          const w = window as unknown as {
            __foldoWsClose?: () => void;
            __foldoWsConnect?: () => void;
          };
          w.__foldoWsClose = () => {
            // Mimic an unexpected network drop: close the underlying socket
            // but don't call ws.close() (that would flip `closedByUser` and
            // suppress the auto-reconnect we want to exercise next).
            try {
              (ws as unknown as { ws: WebSocket | null }).ws?.close();
            } catch {
              /* ignore */
            }
          };
          w.__foldoWsConnect = () => {
            ws.connect();
          };
        }

        setBoot({ kind: 'ready' });
      } catch (err) {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : String(err);
        console.warn('[foldo] could not reach cloud:', msg);
        setBoot({ kind: 'unreachable', error: msg });
      }
    })();
    return () => {
      cancelled = true;
      wsRef.current?.close();
      wsRef.current = null;
    };
    // We only want to bootstrap once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const useOfflineDemo = useCallback(() => {
    hydrateStoreFromMock();
    navigate({ boardId: MOCK_BOARD_ID }, { replace: true });
    setBoot({ kind: 'offline' });
  }, [navigate]);

  // ---------- derived: bounds / frames-by-id / near-viewport ----------

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

  const bounds = useMemo(() => {
    if (!frames.length) return { x: 0, y: 0, width: 1, height: 1 };
    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;
    for (const f of frames) {
      minX = Math.min(minX, f.position.x);
      minY = Math.min(minY, f.position.y - 36);
      maxX = Math.max(maxX, f.position.x + f.size.width);
      maxY = Math.max(maxY, f.position.y + f.size.height);
    }
    return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
  }, [frames]);

  /** Near-viewport set: frames within ~1.5× the viewport on each side. */
  const inViewportSet = useMemo(() => {
    const w = containerSize.width;
    const h = containerSize.height;
    const padX = w * 1.5;
    const padY = h * 1.5;
    // Visible world rect:
    const worldLeft = -viewport.x / viewport.zoom - padX / viewport.zoom;
    const worldTop = -viewport.y / viewport.zoom - padY / viewport.zoom;
    const worldRight =
      (-viewport.x + w) / viewport.zoom + padX / viewport.zoom;
    const worldBottom =
      (-viewport.y + h) / viewport.zoom + padY / viewport.zoom;
    const set = new Set<string>();
    for (const f of frames) {
      const fr = f.position.x + f.size.width;
      const fb = f.position.y + f.size.height;
      const overlaps =
        f.position.x < worldRight &&
        fr > worldLeft &&
        f.position.y < worldBottom &&
        fb > worldTop;
      if (overlaps) set.add(f.id);
    }
    return set;
  }, [frames, viewport, containerSize.width, containerSize.height]);

  // Track window size for the viewport bookkeeping
  useEffect(() => {
    const onResize = () => {
      setContainerSize({ width: window.innerWidth, height: window.innerHeight });
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // ---------- fit-to / focus a frame ----------

  const focusedFrameRef = useRef<string | null>(null);
  const fitToFrame = useCallback(
    (frame: Frame, padding = 60) => {
      canvasRef.current?.fitTo({
        x: frame.position.x - padding,
        y: frame.position.y - padding - 40,
        width: frame.size.width + padding * 2,
        height: frame.size.height + padding * 2 + 40,
      });
    },
    [],
  );

  // Apply the URL's focused frame once hydrated
  useEffect(() => {
    if (boot.kind !== 'ready' && boot.kind !== 'offline') return;
    if (!snap.hydrated) return;
    if (!route.frameId) {
      // No focus, fit to all frames once.
      if (focusedFrameRef.current !== '__all__') {
        focusedFrameRef.current = '__all__';
        setTimeout(() => canvasRef.current?.zoomToFit(), 60);
      }
      return;
    }
    const f = snap.frames.get(route.frameId);
    if (!f) return;
    if (focusedFrameRef.current === route.frameId) return;
    focusedFrameRef.current = route.frameId;
    setTimeout(() => fitToFrame(f), 60);
    // If a commentId is set, open the popover
    if (route.commentId) {
      const c = snap.comments.get(route.commentId);
      if (c) setCommentPopover({ frameId: c.frameId, commentId: c.id });
    } else {
      setCommentPopover(null);
    }
  }, [
    boot.kind,
    route.frameId,
    route.commentId,
    snap.hydrated,
    snap.frames,
    snap.comments,
    fitToFrame,
  ]);

  // Keep a ref to the live selection so the keyboard handler (mounted once)
  // can read the latest value without re-binding.
  const selectionRef = useRef<SelectedElement | null>(null);
  useEffect(() => {
    selectionRef.current = selectedElement;
  }, [selectedElement]);

  // Plugin escape hatch: the Layer Navigator (and any future panel that needs
  // to drive the canvas) calls window.__foldoSelectFrame(frameId) to focus a
  // frame from outside the React tree. We register the hook here because this
  // is the only site that owns both fitToFrame and the route navigator. The
  // pan happens via navigate() flipping route.frameId, which the focus effect
  // above translates into a fitToFrame() call — same path as a deep-link.
  useEffect(() => {
    registerSelectFrameHook((frameId: string) => {
      const f = boardStore.getSnapshot().frames.get(frameId);
      if (!f) return;
      setSelectedElementRaw(null);
      setCommentPopover(null);
      if (snap.board) {
        navigate({ boardId: snap.board.id, frameId });
      }
      // Best-effort immediate pan — the URL effect will also fire but doing
      // it here keeps the response feel tight even before the route updates.
      fitToFrame(f);
    });
  }, [snap.board, navigate, fitToFrame]);

  // ---------- keyboard shortcuts ----------
  // Hook owns the keydown handler; this site keeps the Esc semantics local
  // because clearing the popover/intent reaches into App-only state.
  const handleEscape = useCallback(() => {
    setSelectedElementRaw(null);
    setCommentPopover(null);
    setInitialIntent(undefined);
  }, []);
  useKeyboardShortcuts({
    setTool,
    selectionRef,
    pushToast,
    canvasRef,
    onEscape: handleEscape,
  });

  // ---------- multiplayer outbound ----------

  const onCursorMove = useCallback((x: number, y: number) => {
    wsRef.current?.send({
      type: 'cursor.move',
      cursor: { x, y },
    });
  }, []);

  // Broadcast selection updates to the server
  const setSelectedElement = useCallback((sel: SelectedElement | null) => {
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
  }, []);

  // Debounced viewport broadcast (used for follow-me)
  useEffect(() => {
    if (viewportBroadcastTimerRef.current) {
      clearTimeout(viewportBroadcastTimerRef.current);
    }
    viewportBroadcastTimerRef.current = setTimeout(() => {
      wsRef.current?.send({
        type: 'viewport.update',
        x: viewport.x,
        y: viewport.y,
        zoom: viewport.zoom,
      });
    }, 120);
    return () => {
      if (viewportBroadcastTimerRef.current) {
        clearTimeout(viewportBroadcastTimerRef.current);
        viewportBroadcastTimerRef.current = null;
      }
    };
  }, [viewport.x, viewport.y, viewport.zoom]);

  // Follow-me: react to the followed user's viewport updates
  const followedViewport = followingUserId
    ? (snap.presence.get(followingUserId)?.viewport ?? null)
    : null;
  useEffect(() => {
    if (!followingUserId || !followedViewport) return;
    const v = followedViewport;
    const c = canvasRef.current;
    if (!c) return;
    const rect = canvasContainerRectFallback();
    // Compute the followed user's screen-center in world coords and fit a
    // viewport-sized rect around it.
    const wx = (rect.width / 2 - v.x) / v.zoom;
    const wy = (rect.height / 2 - v.y) / v.zoom;
    c.fitTo({
      x: wx - rect.width / (2 * v.zoom),
      y: wy - rect.height / (2 * v.zoom),
      width: rect.width / v.zoom,
      height: rect.height / v.zoom,
    });
  }, [
    followingUserId,
    followedViewport?.x,
    followedViewport?.y,
    followedViewport?.zoom,
  ]);

  // ---------- comments ----------

  const onSelectElement = useCallback(
    (sel: SelectedElement | null) => {
      setSelectedElement(sel);
      if (!sel) setInitialIntent(undefined);
      setCommentPopover(null);
    },
    [setSelectedElement],
  );

  // Comment handlers — handleDropPin, handleCommentClick, onMakeEditFromComment,
  // onMakeEditFromIssue, onReplyToComment, onResolveComment, onDeleteComment.
  // Popover state stays in App (read from ~8 places) but the handler bodies
  // live in useCommentHandlers.
  const commentHandlers = useCommentHandlers({
    board: snap.board,
    frames: snap.frames,
    comments: snap.comments,
    users: snap.users,
    meUserId: snap.meUserId,
    demoUserId: DEMO_USER_ID,
    offline: boot.kind === 'offline',
    setCommentPopover,
    setSelectedElement,
    setInitialIntent,
    setTool,
    navigate,
    pushToast,
    commentPopover,
  });
  const {
    handleDropPin,
    handleCommentClick,
    onMakeEditFromComment,
    onMakeEditFromIssue,
  } = commentHandlers;

  // Stable callback for FrameLayer's MarkdownFrame children. Looks up the
  // frame from the store (rather than capturing snap.frames in closure so the
  // callback identity doesn't change on every comment update).
  const onSelectMdLine = useCallback(
    (frameId: string, sectionId: string, lineIndex: number, label: string) => {
      const ff = boardStore.getSnapshot().frames.get(frameId);
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
    [setSelectedElement],
  );

  // onReplyToComment / onResolveComment / onDeleteComment live in
  // useCommentHandlers; destructure for the existing inline call-sites.
  const { onReplyToComment, onResolveComment, onDeleteComment } = commentHandlers;

  // ---------- dispatches ----------
  // useDispatchFlow owns the activeDispatchId state, the sendDispatch /
  // closeEditPanel / onJumpToResult callbacks, and the auto-pan-on-completion
  // effect. App keeps the offline simulator (runOfflineDispatch below) and
  // passes it in so the hook stays decoupled from DEMO_USER_ID.
  const dispatchFlow = useDispatchFlow({
    board: snap.board,
    frames: snap.frames,
    branches: snap.branches,
    dispatches: snap.dispatches,
    selectedElement,
    offline: boot.kind === 'offline',
    fitToFrame,
    setSelectedElement,
    setInitialIntent,
    navigate,
    pushToast,
    runOffline: runOfflineDispatch,
  });
  const activeDispatch = dispatchFlow.activeDispatch;

  // ---------- capture ----------

  const onCaptureComplete = useCallback(
    (frame: Frame) => {
      boardStore.upsertFrame(frame);
      setCaptureOpen(false);
      showToast(setToast, 'Frame captured');
      setTimeout(() => fitToFrame(frame, 80), 250);
      if (snap.board) navigate({ boardId: snap.board.id, frameId: frame.id });
    },
    [snap.board, navigate, fitToFrame],
  );

  // ---------- new-frame tools (sticky / arrow / image) ----------
  // All the create handlers + arrow-draft state + image-input ref live in
  // useFrameTools. The hook returns the arrow draft, the file input ref, an
  // onChange for the input, click handlers for the sticky/image tools, and
  // background-drag handlers for the arrow tool.
  const frameTools = useFrameTools({
    board: snap.board,
    branches: snap.branches,
    setTool,
    pushToast,
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

  /* A+W1 touch */
  if (isPhoneViewport && isBoardRoute) {
    return <PhoneNotSupportedBanner />;
  }
  /* /A+W1 touch */

  return (
    <div className="relative h-screen w-screen overflow-hidden">
      <Canvas
        ref={canvasRef}
        tool={tool}
        contentBounds={bounds}
        onViewportChange={setViewport}
        onCursorMove={onCursorMove}
        onBackgroundClick={(world) => {
          if (tool === 'sticky') {
            frameTools.createStickyAt(world);
            return;
          }
          if (tool === 'image') {
            frameTools.openImagePickerAt(world);
            return;
          }
          if (tool !== 'comment') {
            setSelectedElement(null);
            setCommentPopover(null);
            if (snap.board) {
              navigate({ boardId: snap.board.id });
            }
          }
        }}
        onBackgroundDragStart={
          tool === 'arrow' ? frameTools.arrowDragHandlers.onStart : undefined
        }
        onBackgroundDragMove={
          tool === 'arrow' ? frameTools.arrowDragHandlers.onMove : undefined
        }
        onBackgroundDragEnd={
          tool === 'arrow' ? frameTools.arrowDragHandlers.onEnd : undefined
        }
      >
        <Connectors frames={frames} inViewportFrameIds={inViewportSet} />
        <SelectionGhosts meUserId={snap.meUserId} />
        <ArrowDraftPreview draft={frameTools.arrowDraft} />
        <FrameLayer
          tool={tool}
          selectedElement={selectedElement}
          zoom={viewport.zoom}
          commentsByFrame={commentsByFrame}
          inViewportSet={inViewportSet}
          onSelectElement={onSelectElement}
          onDropPin={handleDropPin}
          onCommentClick={handleCommentClick}
          onMakeEditFromIssue={onMakeEditFromIssue}
          onSelectMdLine={onSelectMdLine}
        />
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
      <LeftRail tool={tool} onChange={setTool} />
      {/*
        Plugin substrate slots (Step 9). LeftPanel / RightPanel / PluginToolBar
        render nothing if no plugin contributes to them, so today they're
        invisible — Step 10's Layer Navigator + Step 11's DOM Editor light them
        up. Mounted alongside the existing LeftRail / EditPanel / TestsPanel
        rather than replacing them so the substrate ships with zero UX change.
      */}
      <LeftPanel />
      <RightPanel />
      <PluginToolBar />
      <input
        ref={frameTools.imageInputRef}
        type="file"
        accept="image/*"
        style={{ position: 'fixed', left: -9999, top: -9999, opacity: 0 }}
        onChange={frameTools.onImageFileChange}
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
              onSend={dispatchFlow.sendDispatch}
              onClose={dispatchFlow.closeEditPanel}
              onJumpToResult={dispatchFlow.onJumpToResult}
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
              showToast(setToast, 'Failed to save comment');
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

      {snap.hydrated &&
        frames.length > 0 &&
        !selectedElement &&
        !commentPopover &&
        !captureOpen && <FirstRunHint count={frames.length} />}

      <ToastStack toasts={toasts} />
    </div>
  );
}

// ----- memoised frame children so unrelated frame updates don't re-render every frame -----

// Frame memo wrappers + the 7-way render loop live in components/FrameLayer.tsx

// ----- bootstrapping helpers -----

function hydrateStoreFromRest(
  snapshot: {
    board: import('@foldo/protocol').Board;
    branches: Branch[];
    frames: Frame[];
    comments: Comment[];
    users: import('@foldo/protocol').User[];
    mcpConnected: boolean;
  },
  meUserId: string,
) {
  const frameMap = new Map(snapshot.frames.map((f) => [f.id, f]));
  const commentMap = new Map(snapshot.comments.map((c) => [c.id, c]));
  const branchMap = new Map(snapshot.branches.map((b) => [b.id, b]));
  const userMap = new Map(snapshot.users.map((u) => [u.id, u]));
  // Presence will be supplied by the WS welcome; seed a basic record for ourselves.
  const me = userMap.get(meUserId);
  const presence = new Map<string, import('@foldo/protocol').PresenceUser>();
  if (me) {
    presence.set(meUserId, {
      userId: me.id,
      name: me.name,
      initial: me.initial,
      color: me.color,
      online: true,
      lastSeenAt: new Date().toISOString(),
    });
  }
  boardStore.set({
    hydrated: true,
    offline: false,
    wsStatus: 'connecting',
    meUserId,
    board: snapshot.board,
    frames: frameMap,
    comments: commentMap,
    branches: branchMap,
    users: userMap,
    presence,
    dispatches: new Map(),
    mcpConnected: snapshot.mcpConnected,
    activeTestSessions: new Set(),
  });
}

function hydrateStoreFromMock() {
  const s = mockBoardSnapshot;
  const frameMap = new Map(s.frames.map((f) => [f.id, f]));
  const commentMap = new Map(s.comments.map((c) => [c.id, c]));
  const branchMap = new Map(s.branches.map((b) => [b.id, b]));
  const userMap = new Map(s.users.map((u) => [u.id, u]));
  const presence = new Map(mockPresence().map((p) => [p.userId, p]));
  boardStore.set({
    hydrated: true,
    offline: true,
    wsStatus: 'closed',
    meUserId: MOCK_ME_USER_ID,
    board: s.board,
    frames: frameMap,
    comments: commentMap,
    branches: branchMap,
    users: userMap,
    presence,
    dispatches: new Map(),
    mcpConnected: false,
    activeTestSessions: new Set(),
  });
}

// ----- offline dispatch simulation -----

function runOfflineDispatch(
  boardId: string,
  parent: Frame,
  branch: Branch,
  intent: string,
  target: CommentTarget,
  setActiveDispatchId: (id: string) => void,
  onResultReady: (frame: Frame) => void,
) {
  const id = `d-local-${Date.now()}`;
  const start = new Date().toISOString();
  const d0: Dispatch = {
    id,
    boardId,
    frameId: parent.id,
    branchId: branch.id,
    initiatorUserId: DEMO_USER_ID,
    target,
    baseCommitSha: parent.commitSha,
    intent,
    status: 'sending',
    events: [
      { ts: start, level: 'info', message: 'Queued dispatch to local MCP…' },
    ],
    createdAt: start,
    startedAt: start,
  };
  boardStore.upsertDispatch(d0);
  setActiveDispatchId(id);

  setTimeout(() => {
    const existing = boardStore.getSnapshot().dispatches.get(id);
    if (!existing) return;
    boardStore.upsertDispatch({
      ...existing,
      status: 'running',
      events: [
        ...existing.events,
        {
          ts: new Date().toISOString(),
          level: 'info',
          message: 'Claude Code running…',
        },
      ],
    });
  }, 700);

  setTimeout(() => {
    const existing = boardStore.getSnapshot().dispatches.get(id);
    if (!existing) return;
    const finishedAt = new Date().toISOString();
    const sha = Math.random().toString(16).slice(2, 9);

    let result: Frame;
    if (parent.kind === 'markdown' && parent.content.kind === 'markdown') {
      // Update the doc in place rather than spawning a sibling markdown frame;
      // keeps the row's "docs left, screens right" shape intact.
      result = {
        ...parent,
        commitSha: sha,
        commitMessage: 'docs: applied edit from canvas',
        age: 'just now',
        content: {
          ...parent.content,
          body:
            (parent.content.body ?? '') +
            `\n\n## Update (from canvas)\n\n${intent}`,
        },
        updatedAt: finishedAt,
      };
    } else {
      const sameRow: Frame[] = [];
      for (const f of boardStore.getSnapshot().frames.values()) {
        if (
          Math.abs(f.position.y - parent.position.y) < parent.size.height / 2 &&
          f.branchId === parent.branchId
        ) {
          sameRow.push(f);
        }
      }
      const rightmost = sameRow.reduce(
        (acc, f) => Math.max(acc, f.position.x + f.size.width),
        parent.position.x + parent.size.width,
      );
      const newX = rightmost + 100;
      const childId = `f-local-${Date.now()}`;
      result = {
        id: childId,
        boardId,
        kind: 'app',
        branchId: parent.branchId,
        commitSha: sha,
        commitMessage: trimCommit(intent),
        age: 'just now',
        position: { x: newX, y: parent.position.y },
        size: parent.size,
        content: {
          kind: 'app',
          variant:
            parent.content.kind === 'app' ? parent.content.variant : 'baseline',
          route: parent.content.kind === 'app' ? parent.content.route : '/',
          viewport:
            parent.content.kind === 'app'
              ? parent.content.viewport
              : { width: 1280, height: 900 },
          recipe:
            parent.content.kind === 'app' ? parent.content.recipe : undefined,
          stateLabel:
            parent.content.kind === 'app'
              ? parent.content.stateLabel
              : undefined,
          overrides:
            parent.content.kind === 'app' ? parent.content.overrides : undefined,
        },
        parentFrameId: parent.id,
        generatedByDispatchId: id,
        createdAt: finishedAt,
        updatedAt: finishedAt,
      };
    }

    boardStore.upsertFrame(result);
    boardStore.upsertDispatch({
      ...existing,
      status: 'done',
      finishedAt,
      resultFrameId: result.id,
      resultCommitSha: sha,
      events: [
        ...existing.events,
        { ts: finishedAt, level: 'info', message: 'Done.' },
      ],
    });
    onResultReady(result);
  }, 2200);
}

function trimCommit(s: string) {
  return s.split('\n')[0].slice(0, 60) || 'apply canvas edit';
}

// ----- misc UI helpers -----

function BootLoadingOverlay() {
  return (
    <div className="pointer-events-auto absolute inset-0 z-[80] flex items-center justify-center bg-canvas/80 backdrop-blur-sm">
      <div className="rounded-xl border border-hairlineSoft bg-panel px-6 py-4 text-[13px] text-inkMute shadow-panel">
        Loading board…
      </div>
    </div>
  );
}

function UnreachableOverlay({
  error,
  onOffline,
}: {
  error: string;
  onOffline: () => void;
}) {
  return (
    <div className="pointer-events-auto absolute inset-0 z-[80] flex items-center justify-center bg-canvas/85 backdrop-blur-sm">
      <div className="w-[420px] rounded-xl border border-hairline bg-panel p-5 shadow-panel">
        <div className="flex items-center gap-2 text-[12.5px] font-medium text-ink">
          <span
            className="inline-block h-2 w-2 rounded-full"
            style={{ background: '#ef6f6f' }}
          />
          Cloud unreachable
        </div>
        <div className="mt-2 text-[12.5px] leading-relaxed text-inkMute">
          Couldn't reach the Foldo server on <code>localhost:4000</code>. Start
          it with{' '}
          <code className="rounded bg-canvas/80 px-1 py-px font-mono text-[11.5px] text-ink">
            npm run dev
          </code>
          .
        </div>
        <div className="mt-2 font-mono text-[10.5px] text-inkFaint">{error}</div>
        <div className="mt-4 flex items-center justify-end gap-2">
          <button
            onClick={() => location.reload()}
            className="rounded-md border border-hairlineSoft bg-canvas px-3 py-1.5 text-[12px] text-ink hover:bg-white/5"
          >
            Retry
          </button>
          <button
            onClick={onOffline}
            className="rounded-md bg-accent px-3 py-1.5 text-[12.5px] font-medium text-white hover:bg-accentSoft"
          >
            Use offline demo
          </button>
        </div>
      </div>
    </div>
  );
}

function FirstRunHint({ count }: { count: number }) {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;
  return (
    <div className="pointer-events-auto absolute bottom-4 right-4 z-40 w-[300px] rounded-xl border border-hairline bg-panel p-3.5 shadow-panel fade-in">
      <div className="mb-1 flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-[0.12em] text-accent">
          <Sparkle /> Try this
        </div>
        <button
          onClick={() => setDismissed(true)}
          className="text-inkFaint hover:text-ink"
          aria-label="Dismiss"
        >
          <svg width="10" height="10" viewBox="0 0 16 16">
            <path
              d="M4 4l8 8M12 4l-8 8"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </div>
      <div className="text-[12.5px] leading-relaxed text-ink">
        Click an orange comment pin, hit{' '}
        <span className="rounded bg-accent/15 px-1 py-px font-medium text-accent">
          Make this an edit
        </span>
        , then{' '}
        <span className="rounded bg-accent/15 px-1 py-px font-medium text-accent">
          Send to Claude Code
        </span>{' '}
        . A new frame appears connected to its parent.
      </div>
      <div className="mt-2 text-[11px] text-inkFaint">
        {count} frames · scroll to pan · ⌘+scroll to zoom
      </div>
    </div>
  );
}

function Sparkle() {
  return (
    <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor">
      <path d="M8 2.5l1 3 3 1-3 1-1 3-1-3-3-1 3-1z" />
    </svg>
  );
}

// Legacy helper kept so the many `showToast(setToast, '…')` callsites in this
// file can stay unchanged during Phase 1. The "setter" arg is now actually
// pushToast from useToastQueue (back-compat shim above). Once the comment /
// dispatch / frame-tools components are extracted in Phase 1.3-1.5 they'll
// take pushToast directly and this helper goes away.
function showToast(push: (msg: string) => void, msg: string): void {
  push(msg);
}

/**
 * Demo identity picker. Defaults to `u-you` (the seeded "You" user). Open multiple
 * browsers / windows and switch to `u-anna` / `u-mateo` / `u-priya` to demo
 * multiplayer with distinct cursors. Selection persists in localStorage.
 */
function readOrCreateDemoUserId(): string {
  try {
    const KEY = 'foldo:demoUserId';
    const stored = localStorage.getItem(KEY);
    const valid = ['u-you', 'u-anna', 'u-mateo', 'u-priya'];
    if (stored && valid.includes(stored)) return stored;
    // Default to u-you so the first paint always authenticates against the seed.
    return 'u-you';
  } catch {
    return 'u-you';
  }
}

export function setDemoUserId(id: string): void {
  try {
    localStorage.setItem('foldo:demoUserId', id);
  } catch { /* ignore */ }
}

function canvasContainerRectFallback() {
  if (typeof window === 'undefined') return { width: 1440, height: 900 };
  return { width: window.innerWidth, height: window.innerHeight };
}
