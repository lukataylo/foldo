// Foldo canvas — the living-documentation board viewer.
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
//   - useTopBarHandlers  — switch-user
//   - useDispatchFlow    — edit-panel state + send-to-Claude lifecycle
//   - useCommentHandlers — drop-pin / reply / resolve / delete + make-edit
// Render tree stays here; each hook's JSDoc documents its boundary.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Comment } from '@foldo/protocol';
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
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
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
import { Connectors } from './components/Connectors';
import { CommentPopover } from './components/CommentPopover';
import { useRoute } from './routing/Router';
import { boardStore, useBoardSelector } from './state/useBoardStore';
import { setAuth } from './api/client';
import { updateComment as apiUpdateComment } from './api/comments';
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

/** localStorage key for the last-selected tool. Bumped if we ever change shape. */
const LAST_TOOL_KEY = 'foldo:lastTool';

const TOOL_IDS: readonly Tool[] = ['select', 'hand', 'comment', 'edit'];

function isTool(v: unknown): v is Tool {
  return typeof v === 'string' && (TOOL_IDS as readonly string[]).includes(v);
}

/**
 * Read the previously-persisted tool from localStorage. Falls back to
 * `'select'` when nothing is persisted, the value is unrecognised, or the
 * read throws (Safari private mode).
 */
function getInitialTool(): Tool {
  try {
    if (typeof localStorage === 'undefined') return 'select';
    const raw = localStorage.getItem(LAST_TOOL_KEY);
    if (raw && isTool(raw)) return raw;
  } catch {
    /* ignore */
  }
  return 'select';
}

export default function App() {
  // Granular store subscriptions — each useBoardSelector independently checks
  // whether its slice changed since the last commit, so a comment.added event
  // (which touches only `comments`) won't re-render the App tree just because
  // a single useBoardSnapshot() read was at the root. `snap` is rebuilt
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

  const { boot, useOfflineDemo } = useCanvasBoot({
    route,
    navigate,
    demoUserId: DEMO_USER_ID,
    demoToken: DEMO_TOKEN,
  });
  // Seed from localStorage so the canvas reopens on the user's last tool.
  // getInitialTool() falls back to 'select' for first paint / unsupported
  // storage.
  const [tool, setToolRaw] = useState<Tool>(() => getInitialTool());
  // Wrap setTool so every tool change (rail click, hotkey, comment "make this
  // an edit" flow, …) persists to localStorage. useCallback keeps the
  // identity stable so the hooks that take setTool in their deps array don't
  // see a fresh function every render.
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
  const [selectedElement, setSelectedElement] =
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
  const setToast = pushToast;
  const topBar = useTopBarHandlers();

  const canvasRef = useRef<CanvasHandle>(null);

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
    setSelectedElement(null);
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

  // ---------- comments ----------

  const onSelectElement = useCallback(
    (sel: SelectedElement | null) => {
      setSelectedElement(sel);
      if (!sel) setInitialIntent(undefined);
      setCommentPopover(null);
    },
    [],
  );

  // Comment handlers — handleDropPin, handleCommentClick, onMakeEditFromComment,
  // onReplyToComment, onResolveComment, onDeleteComment. Popover state stays
  // in App (read from ~8 places) but the handler bodies live in
  // useCommentHandlers.
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
  const { handleDropPin, handleCommentClick, onMakeEditFromComment } =
    commentHandlers;

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
    [],
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
        onBackgroundClick={() => {
          if (tool !== 'comment') {
            setSelectedElement(null);
            setCommentPopover(null);
            if (snap.board) {
              navigate({ boardId: snap.board.id });
            }
          }
        }}
      >
        <Connectors frames={frames} inViewportFrameIds={inViewportSet} />
        <FrameLayer
          tool={tool}
          selectedElement={selectedElement}
          zoom={viewport.zoom}
          commentsByFrame={commentsByFrame}
          inViewportSet={inViewportSet}
          onSelectElement={onSelectElement}
          onDropPin={handleDropPin}
          onCommentClick={handleCommentClick}
          onSelectMdLine={onSelectMdLine}
        />
      </Canvas>

      <TopBar
        board={snap.board}
        meUserId={snap.meUserId}
        onSwitchUser={topBar.onSwitchUser}
        wsStatus={snap.wsStatus}
        offline={boot.kind === 'offline'}
      />
      <LeftRail tool={tool} onChange={setTool} />
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
        !commentPopover && <FirstRunHint count={frames.length} />}

      <ToastStack toasts={toasts} />
    </div>
  );
}

// ----- memoised frame children so unrelated frame updates don't re-render every frame -----

// Frame memo wrappers + the per-kind render loop live in components/FrameLayer.tsx

// Legacy helper kept so the `showToast(setToast, '…')` callsites in this
// file can stay unchanged. The "setter" arg is now actually pushToast from
// useToastQueue (back-compat shim above).
function showToast(push: (msg: string) => void, msg: string): void {
  push(msg);
}
