// Canvas viewport bookkeeping, extracted from App.tsx: container size, the
// viewport state, content bounds, the near-viewport set, the viewportStore
// mirroring effects, the debounced viewport broadcast, follow-me, fit-to-frame,
// the foldo:focusFrame window listener, and the URL-focused-frame effect.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Frame } from '@foldo/protocol';
import type { CanvasHandle, ViewportState } from '../components/Canvas';
import { viewportStore } from '../state/viewportStore';
import { boardStore } from '../state/useBoardStore';
import type { BoardSnapshot } from '../state/BoardStore';
import type { Route } from '../routing/Router';
import type { FoldoWsClient } from '../api/ws';
import { computeBounds, computeInViewportSet, type Rect } from './geometry';
import type { BootState } from './useBoardBootstrap';

interface UseCanvasViewportArgs {
  snap: BoardSnapshot;
  frames: Frame[];
  route: Route;
  navigate: (next: Route, opts?: { replace?: boolean }) => void;
  canvasRef: React.RefObject<CanvasHandle | null>;
  wsRef: React.RefObject<FoldoWsClient | null>;
  boot: BootState;
  followedViewport: { x: number; y: number; zoom: number } | null;
  followingUserId: string | null;
  setSelectedFrameId: (id: string | null) => void;
  setCommentPopover: (
    p: { frameId: string; commentId: string; composing?: boolean } | null,
  ) => void;
}

export interface CanvasViewport {
  viewport: ViewportState;
  setViewport: (v: ViewportState) => void;
  bounds: Rect;
  fitToFrame: (frame: Frame, padding?: number) => void;
}

function canvasContainerRectFallback() {
  if (typeof window === 'undefined') return { width: 1440, height: 900 };
  return { width: window.innerWidth, height: window.innerHeight };
}

export function useCanvasViewport({
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
}: UseCanvasViewportArgs): CanvasViewport {
  const [viewport, setViewport] = useState<ViewportState>({
    x: 0,
    y: 0,
    zoom: 0.6,
  });
  const [containerSize, setContainerSize] = useState({
    width: typeof window !== 'undefined' ? window.innerWidth : 1440,
    height: typeof window !== 'undefined' ? window.innerHeight : 900,
  });

  const viewportBroadcastTimerRef = useRef<ReturnType<
    typeof setTimeout
  > | null>(null);

  // ---------- derived: bounds / near-viewport ----------

  const bounds = useMemo(() => computeBounds(frames), [frames]);

  // Near-viewport set: frames within ~1.5× the viewport on each side.
  // The camera moves continuously, but membership only flips occasionally, so
  // we quantize the camera to a coarse grid for the memo dependency — the set
  // recomputes when the camera crosses a bucket boundary, not every tick. The
  // 1.5× padding already absorbs sub-bucket drift (no extra hysteresis needed).
  const VP_BUCKET = 240; // world-ish px; pan must cross this before recompute
  const ZOOM_BUCKET = 0.1;
  const inViewportKey =
    `${Math.round(viewport.x / VP_BUCKET)}:` +
    `${Math.round(viewport.y / VP_BUCKET)}:` +
    `${Math.round(viewport.zoom / ZOOM_BUCKET)}:` +
    `${containerSize.width}x${containerSize.height}`;
  const inViewportSet = useMemo(
    () => computeInViewportSet(frames, viewport, containerSize),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [frames, inViewportKey],
  );

  // Mirror the camera + near-viewport set into the viewport store so frame
  // plugins can subscribe to just the slice they need (see viewportStore).
  useEffect(() => {
    viewportStore.setViewport(viewport.x, viewport.y, viewport.zoom);
  }, [viewport.x, viewport.y, viewport.zoom]);
  useEffect(() => {
    viewportStore.setInViewport(inViewportSet);
  }, [inViewportSet]);

  // Track window size for the viewport bookkeeping
  useEffect(() => {
    const onResize = () => {
      setContainerSize({
        width: window.innerWidth,
        height: window.innerHeight,
      });
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
    [canvasRef],
  );

  // Layers panel (and any other plugin) requests fit-to-frame via a custom
  // window event so it doesn't need a direct ref into the canvas handle.
  useEffect(() => {
    const onFocus = (e: Event) => {
      const detail = (e as CustomEvent<{ id: string }>).detail;
      if (!detail?.id) return;
      const f = boardStore.getSnapshot().frames.get(detail.id);
      if (!f) return;
      canvasRef.current?.fitTo({
        x: f.position.x - 60,
        y: f.position.y - 100,
        width: f.size.width + 120,
        height: f.size.height + 140,
      });
      setSelectedFrameId(f.id);
      if (snap.board) {
        navigate({ boardId: snap.board.id, frameId: f.id });
      }
    };
    window.addEventListener('foldo:focusFrame', onFocus);
    return () => window.removeEventListener('foldo:focusFrame', onFocus);
  }, [navigate, snap.board, canvasRef, setSelectedFrameId]);

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
    canvasRef,
    setCommentPopover,
  ]);

  // ---------- debounced viewport broadcast (used for follow-me) ----------
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

  // Follow-me: react to the followed user's viewport updates
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
    // followedViewport is recomputed by the host each render; depend on the
    // scalar fields above, not the object identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    canvasRef,
  ]);

  return { viewport, setViewport, bounds, fitToFrame };
}
