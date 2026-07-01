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
//
// App-level extraction map:
//   - useCanvasBoot      — boot effect + WS lifecycle + "offline demo" switch
//   - useRouteSync       — URL-frame/comment ↔ canvas pan/zoom + popover
//   - useFrameViewport   — content bounds + near-viewport set + container size
//   - useTopBarHandlers  — follow / capture-open / tests-open / switch-user
//   - useFrameTools      — sticky / arrow / image create flows
//   - useDispatchFlow    — edit-panel state + send-to-Claude lifecycle
//   - useCommentHandlers — drop-pin / reply / resolve / delete + make-edit
// Render tree stays here; each hook's JSDoc documents its boundary.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  Comment,
  Frame,
} from '@foldo/protocol';
import { Canvas, type CanvasHandle, type ViewportState } from './components/Canvas';
import { TopBar } from './components/TopBar';
import { LeftRail } from './components/LeftRail';
/* A+W1 touch */ import { PhoneNotSupportedBanner } from './components/PhoneNotSupportedBanner';
/* A+W1 touch */ import { useMediaQuery } from './hooks/useMediaQuery';
import { ToastStack, useToastQueue } from './components/ToastQueue';
/* A+W1 features — simulator banner shown at the top of the canvas when
   mcpConnected === false (i.e. dispatches are being answered by the
   local sim rather than a real Claude Code session). */
import {
  ClaudeSimulatorBanner,
  useBannerDismissal,
} from './components/ClaudeSimulatorBanner';
import { LeftPanel, RightPanel } from './plugins/slots/SidePanel';
import { ToolBar as PluginToolBar } from './plugins/slots/ToolBar';
import {
  registerToastHook,
  registerSetToolHook,
  registerSelectFrameHook,
  /* A+W1 features — layer-nav delete/rename/reorder window hooks. */
  registerLayerActionHooks,
  /* A+W4 features — let plugins/tests read the current tool without
     reaching into App's React state. */
  registerCurrentToolAccessor,
} from './plugins/registry';
/* A+W4 features — read the previously-persisted tool on boot so a reload
   restores the user's last tool instead of always landing on 'select'.
   LAST_TOOL_KEY is the canonical localStorage key both sides agree on. */
import { getInitialTool, LAST_TOOL_KEY } from './plugins/core-tools/index';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { useFrameTools, ArrowDraftPreview } from './hooks/useFrameTools';
import { useDispatchFlow } from './hooks/useDispatchFlow';
import { useCommentHandlers } from './hooks/useCommentHandlers';
import { useCanvasBoot } from './hooks/useCanvasBoot';
import { useRouteSync } from './hooks/useRouteSync';
import { useFrameViewport } from './hooks/useFrameViewport';
import { useTopBarHandlers } from './hooks/useTopBarHandlers';
import { makeOfflineDispatchSim } from './hooks/useOfflineDispatchSim';
import { FrameLayer } from './components/FrameLayer';
import { ZoomControl } from './components/ZoomControl';
import {
  BootLoadingOverlay,
  FirstRunHint,
  UnreachableOverlay,
} from './components/BootOverlays';
import { EditPanel } from './components/EditPanel';
import { CaptureModal } from './components/CaptureModal';
import { TestsPanel } from './components/TestsPanel';
import { Connectors } from './components/Connectors';
import { CommentPopover } from './components/CommentPopover';
import { CursorLayer } from './multiplayer/CursorLayer';
import { SelectionGhosts } from './multiplayer/SelectionGhosts';
import { useRoute } from './routing/Router';
import { boardStore, useBoardSelector } from './state/useBoardStore';
import { setAuth } from './api/client';
import { updateComment as apiUpdateComment } from './api/comments';
/* A+W1 features — layer-nav action hooks call these. */
import {
  deleteFrame as apiDeleteFrame,
  moveFrame as apiMoveFrame,
  updateFrame as apiUpdateFrame,
} from './api/frames';
import {
  readOrCreateDemoUserId,
  readStoredAuth,
  setDemoUserId,
} from './App.runtime';
import type { SelectedElement, Tool } from './types';

// Re-export so legacy importers (and the runtime helper) keep working
// without churning module specifiers.
export { setDemoUserId };

const REAL_AUTH = readStoredAuth();
const DEMO_USER_ID = REAL_AUTH?.userId ?? readOrCreateDemoUserId();
const DEMO_TOKEN = REAL_AUTH?.token ?? DEMO_USER_ID; // demo: token == userId
setAuth(DEMO_USER_ID, DEMO_TOKEN);

// Offline dispatch sim is module-level so its identity is stable across
// renders (useDispatchFlow takes it as a dep).
const runOfflineDispatch = makeOfflineDispatchSim(DEMO_USER_ID);

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
  const dispatches_ = useBoardSelector((s) => s.dispatches);
  const meUserId = useBoardSelector((s) => s.meUserId);
  const hydrated = useBoardSelector((s) => s.hydrated);
  const wsStatus = useBoardSelector((s) => s.wsStatus);
  /* A+W1 features — drives the ClaudeSimulatorBanner. */
  const mcpConnected = useBoardSelector((s) => s.mcpConnected);
  const simBanner = useBannerDismissal();
  const snap = {
    board,
    frames: frames_,
    comments: comments_,
    branches: branches_,
    users: users_,
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

  const { boot, useOfflineDemo, wsRef } = useCanvasBoot({
    route,
    navigate,
    demoUserId: DEMO_USER_ID,
    demoToken: DEMO_TOKEN,
  });
  /* A+W4 features — seed from localStorage so the canvas reopens on the
     user's last tool. getInitialTool() falls back to 'select' for first
     paint / unsupported storage. */
  const [tool, setToolRaw] = useState<Tool>(() => getInitialTool());
  /* A+W4 features — wrap setTool so every tool change (plugin activate,
     comment "make this an edit" flow, frame-tools sticky/image/arrow
     completion handlers, …) persists to localStorage. Without this wrap
     only plugin-driven changes round-trip across reload — direct callers
     (useCommentHandlers, useFrameTools) would silently drop the persistence.
     useCallback keeps the identity stable so the hooks that take setTool
     in their deps array don't see a fresh function every render. */
  const setTool = useCallback((next: Tool): void => {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(LAST_TOOL_KEY, next);
      }
    } catch {
      /* ignore (Safari private mode) */
    }
    setToolRaw(next);
  }, []);
  const [selectedElement, setSelectedElementRaw] =
    useState<SelectedElement | null>(null);
  // activeDispatchId lives in useDispatchFlow now.
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
  /* A+W4 features — register a getter for the live tool so the plugin layer
     can read it without importing App. The accessor closes over the latest
     `tool` value via a ref-style refresh on every render (cheap). */
  const toolRef = useRef<Tool>(tool);
  toolRef.current = tool;
  useEffect(() => {
    registerCurrentToolAccessor(() => toolRef.current);
    return () => registerCurrentToolAccessor(null);
  }, []);
  const topBar = useTopBarHandlers({ wsRef });
  const {
    followingUserId,
    captureOpen,
    setCaptureOpen,
    testsOpen,
    setTestsOpen,
  } = topBar;

  // Flag the body element when the AI edit panel is mounted so CSS can hide
  // the right plugin slot (Inspect tab) — they both want the right rail
  // and were overlapping. Cleanup removes the attr on unmount so the
  // Inspect panel can re-appear once the edit flow closes.
  useEffect(() => {
    if (typeof document === 'undefined') return;
    if (selectedElement) {
      document.body.setAttribute('data-edit-panel-open', 'true');
    } else {
      document.body.removeAttribute('data-edit-panel-open');
    }
    return () => {
      document.body.removeAttribute('data-edit-panel-open');
    };
  }, [selectedElement]);

  const canvasRef = useRef<CanvasHandle>(null);
  const lastBroadcastSelectionRef = useRef<string | null>(null);
  const viewportBroadcastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

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

  const { bounds, inViewportSet } = useFrameViewport(frames, viewport);

  // ---------- fit-to / focus a frame + URL sync ----------

  const { fitToFrame } = useRouteSync({
    boot,
    route,
    hydrated: snap.hydrated,
    frames: snap.frames,
    comments: snap.comments,
    canvasRef,
    setCommentPopover,
  });

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

  /* A+W1 features — layer-nav action hooks. The Layer Navigator's
     toolbar (touch agent's surface) calls window.__foldoDeleteFrame /
     __foldoRenameFrame / __foldoReorderFrame; we own the implementations
     so they go through the REST API + optimistic store writes. Offline
     mode skips the REST call but keeps the store in sync. */
  useEffect(() => {
    const offline = boot.kind === 'offline';
    registerLayerActionHooks({
      delete: async (frameId: string) => {
        const f = boardStore.getSnapshot().frames.get(frameId);
        if (!f) return;
        boardStore.removeFrame(frameId);
        if (!offline) {
          try {
            await apiDeleteFrame(frameId);
          } catch (err) {
            // Re-insert on failure so the UI doesn't silently lose state.
            // eslint-disable-next-line no-console
            console.warn('[foldo] delete frame failed', err);
            boardStore.upsertFrame(f);
            pushToast('Failed to delete frame');
          }
        }
      },
      rename: async (frameId: string, newName: string) => {
        const f = boardStore.getSnapshot().frames.get(frameId);
        if (!f) return;
        // Translate "name" into the per-kind content slot the user would
        // visually edit — sticky body, markdown title, image caption.
        const trimmed = (newName ?? '').trim();
        if (!trimmed) return;
        let nextContent: Frame['content'] = f.content;
        if (f.content.kind === 'sticky') {
          nextContent = { ...f.content, body: trimmed };
        } else if (f.content.kind === 'markdown') {
          nextContent = { ...f.content, title: trimmed };
        } else if (f.content.kind === 'image') {
          nextContent = { ...f.content, caption: trimmed };
        } else {
          // app / arrow frames don't have an obvious user-editable name slot;
          // fall back to surfacing the rename in commitMessage so the layer
          // tree still updates.
          boardStore.upsertFrame({ ...f, commitMessage: trimmed });
          return;
        }
        const optimistic = { ...f, content: nextContent };
        boardStore.upsertFrame(optimistic);
        if (!offline) {
          try {
            const updated = await apiUpdateFrame(frameId, { content: nextContent });
            boardStore.upsertFrame(updated);
          } catch (err) {
            // eslint-disable-next-line no-console
            console.warn('[foldo] rename frame failed', err);
            boardStore.upsertFrame(f);
            pushToast('Failed to rename frame');
          }
        }
      },
      reorder: async (frameId: string, newIndex: number) => {
        // v1: "reorder" within a branch means shuffling x positions on the
        // canvas. We compute the target x relative to the branch siblings
        // sorted by current x and pin the frame there.
        const snap = boardStore.getSnapshot();
        const f = snap.frames.get(frameId);
        if (!f) return;
        const siblings: Frame[] = [];
        for (const s of snap.frames.values()) {
          if (s.branchId === f.branchId && s.id !== frameId) siblings.push(s);
        }
        siblings.sort((a, b) => a.position.x - b.position.x);
        const clamped = Math.max(0, Math.min(newIndex, siblings.length));
        const before = siblings[clamped - 1];
        const after = siblings[clamped];
        const targetX = before && after
          ? (before.position.x + after.position.x) / 2
          : before
            ? before.position.x + (before.size.width + 80)
            : after
              ? Math.max(0, after.position.x - (f.size.width + 80))
              : f.position.x;
        boardStore.moveFrame(frameId, targetX, f.position.y);
        if (!offline) {
          try {
            await apiMoveFrame(frameId, {
              position: { x: targetX, y: f.position.y },
            });
          } catch (err) {
            // eslint-disable-next-line no-console
            console.warn('[foldo] reorder frame failed', err);
            boardStore.moveFrame(frameId, f.position.x, f.position.y);
            pushToast('Failed to reorder frame');
          }
        }
      },
    });
  }, [boot.kind, pushToast]);

  /* A+W1 features — global unhandled rejection listener. Without this,
     a stray `void fetch(...).then()` that rejects only prints to the
     console; the user sees nothing. We log + surface a generic toast
     so the failure is at least visible. The ErrorBoundary catches
     render-time errors; this is the runtime/async counterpart. */
  useEffect(() => {
    const onReject = (e: PromiseRejectionEvent): void => {
      // eslint-disable-next-line no-console
      console.error('[foldo] unhandledrejection', e.reason);
      pushToast('Something went wrong — please refresh');
    };
    window.addEventListener('unhandledrejection', onReject);
    return () => window.removeEventListener('unhandledrejection', onReject);
  }, [pushToast]);

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
  }, [wsRef]);

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
  }, [wsRef]);

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
  }, [viewport.x, viewport.y, viewport.zoom, wsRef]);

  // Follow-me: react to the followed user's viewport updates. This is the
  // ONLY presence read at the App root — subscribing to the whole presence
  // Map here re-rendered the entire App tree (TopBar, Canvas, both rails)
  // on every remote cursor tick, up to ~30Hz per remote user. The viewport
  // object is reference-stable across cursor moves (presence.cursor spreads
  // the user but keeps `viewport` untouched), so this selector only fires
  // on actual presence.viewport messages for the followed user.
  const followedViewport = useBoardSelector((s) =>
    followingUserId
      ? (s.presence.get(followingUserId)?.viewport ?? null)
      : null,
  );
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
    [snap.board, navigate, fitToFrame, setCaptureOpen, setToast],
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
        onFollow={topBar.onFollow}
        onCapture={topBar.onCapture}
        onOpenTests={topBar.onOpenTests}
        onSwitchUser={topBar.onSwitchUser}
        wsStatus={snap.wsStatus}
        offline={boot.kind === 'offline'}
      />
      {/* A+W1 features — `onChange` was a dead prop; the plugin tools
          route through window.__foldoSetTool. */}
      <LeftRail tool={tool} />
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
          frameKind={frames_.get(popoverComment.frameId)?.kind}
          composing={commentPopover.composing}
          onUpdateText={async (text) => {
            const previous = popoverComment;
            const optimistic = { ...popoverComment, text, updatedAt: new Date().toISOString() };
            boardStore.upsertComment(optimistic);
            if (boot.kind === 'offline') return;
            // Local comments (just-dropped pins before the server swap) have
            // an id starting with `c-local-`. Skip the PATCH; the optimistic
            // store update is the source of truth until the server id arrives.
            //
            // PIN-DROP FIX (A+ W2): the swap path in useCommentHandlers now
            // reads any pending typed body off the optimistic store entry and
            // PATCHes the server with it, so this branch is the entire local-
            // only persistence story before the swap lands.
            if (popoverComment.id.startsWith('c-local-')) return;
            try {
              const updated = await apiUpdateComment(popoverComment.id, { text });
              boardStore.upsertComment(updated);
            } catch (err) {
              console.warn('[foldo] update comment failed', err);
              // Roll back the optimistic text — otherwise the store keeps
              // unsaved text that silently vanishes on the next reload.
              // Restore onto the CURRENT store entry (not the captured
              // object) so concurrent WS changes (new replies, a newer
              // successful save) aren't clobbered, and only if our
              // optimistic text is still what's showing.
              const current = boardStore.getSnapshot().comments.get(previous.id);
              if (current && current.text === text) {
                boardStore.upsertComment({
                  ...current,
                  text: previous.text,
                  updatedAt: previous.updatedAt,
                });
              }
              showToast(setToast, 'Failed to save comment');
            }
          }}
          onClose={() => {
            // Pin-drop comments are created empty (the server accepts ''
            // so the pin shows instantly). If the popover closes and the
            // comment is still empty with no replies, it was abandoned —
            // delete it so boards don't accumulate ghost pins. Re-read the
            // store: flushBody may have just written text the captured
            // popoverComment doesn't have. Local-id comments are skipped;
            // the in-flight create in useCommentHandlers cleans those up.
            const current = boardStore
              .getSnapshot()
              .comments.get(popoverComment.id);
            if (
              current &&
              !current.id.startsWith('c-local-') &&
              !current.text.trim() &&
              current.replies.length === 0
            ) {
              void onDeleteComment(current.id);
            }
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

      {/* A+W1 features — show the simulator banner when MCP isn't
          connected (dispatches are answered by the local simulator).
          Hidden in the offline demo and once the user dismisses it for
          the session. */}
      {boot.kind === 'ready' &&
        snap.hydrated &&
        !mcpConnected &&
        !simBanner.dismissed && (
          <ClaudeSimulatorBanner onDismiss={simBanner.dismiss} />
        )}

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

// Legacy helper kept so the many `showToast(setToast, '…')` callsites in this
// file can stay unchanged during Phase 1. The "setter" arg is now actually
// pushToast from useToastQueue (back-compat shim above). Once the comment /
// dispatch / frame-tools components are extracted in Phase 1.3-1.5 they'll
// take pushToast directly and this helper goes away.
function showToast(push: (msg: string) => void, msg: string): void {
  push(msg);
}

function canvasContainerRectFallback() {
  if (typeof window === 'undefined') return { width: 1440, height: 900 };
  return { width: window.innerWidth, height: window.innerHeight };
}
