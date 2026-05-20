import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { Tool } from '../types';

export interface ViewportState {
  x: number;
  y: number;
  zoom: number;
}

export interface CanvasHandle {
  setZoom: (next: number, anchor?: { x: number; y: number }) => void;
  fitTo: (worldRect: { x: number; y: number; width: number; height: number }) => void;
  zoomIn: () => void;
  zoomOut: () => void;
  zoomToFit: () => void;
  getViewport: () => ViewportState;
  screenToWorld: (sx: number, sy: number) => { x: number; y: number };
}

interface Props {
  children: ReactNode;
  tool: Tool;
  initialViewport?: ViewportState;
  contentBounds?: { x: number; y: number; width: number; height: number };
  onViewportChange?: (v: ViewportState) => void;
  onBackgroundClick?: (world: { x: number; y: number }) => void;
  onBackgroundDragStart?: (world: { x: number; y: number }) => void;
  onBackgroundDragMove?: (world: { x: number; y: number }) => void;
  onBackgroundDragEnd?: (world: { x: number; y: number }) => void;
  /** Fires at most ~33Hz with the user's cursor in world coordinates. */
  onCursorMove?: (worldX: number, worldY: number) => void;
}

export const Canvas = forwardRef<CanvasHandle, Props>(function Canvas(
  {
    children,
    tool,
    initialViewport,
    contentBounds,
    onViewportChange,
    onBackgroundClick,
    onBackgroundDragStart,
    onBackgroundDragMove,
    onBackgroundDragEnd,
    onCursorMove,
  },
  ref,
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [viewport, setViewport] = useState<ViewportState>(
    initialViewport ?? { x: 0, y: 0, zoom: 0.6 },
  );
  const [panning, setPanning] = useState(false);
  const [spaceDown, setSpaceDown] = useState(false);

  // Live viewport snapshot — the source of truth during a gesture. React
  // state (`viewport`) trails this and is committed at most once per
  // animation frame so wheel/pointermove/pinch (which can fire 100+/sec)
  // don't trigger a re-render of the whole frame tree per event.
  const viewportRef = useRef(viewport);

  // Pending RAF that flushes the coalesced viewport into React state.
  const commitRafRef = useRef<number | null>(null);
  // Latest onViewportChange handler, read inside the RAF without re-binding.
  const onViewportChangeRef = useRef(onViewportChange);
  useEffect(() => {
    onViewportChangeRef.current = onViewportChange;
  }, [onViewportChange]);

  // Active pointers (multi-touch). Tracked for pinch-to-zoom + two-finger
  // pan on iPad and other touch surfaces.
  const pointersRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const pinchRef = useRef<{
    startDist: number;
    startZoom: number;
    startCenter: { x: number; y: number };
    startViewport: ViewportState;
  } | null>(null);

  // Imperatively paint the live viewport onto the DOM so the canvas tracks
  // the gesture at native speed without waiting for a React render.
  const paintViewport = useCallback((v: ViewportState) => {
    const wrap = wrapperRef.current;
    if (wrap) {
      wrap.style.transform = `translate(${v.x}px, ${v.y}px) scale(${v.zoom})`;
    }
    const container = containerRef.current;
    if (container) {
      container.style.backgroundSize = `${24 * v.zoom}px ${24 * v.zoom}px`;
      container.style.backgroundPosition = `${v.x}px ${v.y}px`;
    }
  }, []);

  // Flush the coalesced viewport into React state + notify the parent.
  // Runs once per animation frame regardless of how many events landed.
  const flushViewport = useCallback(() => {
    commitRafRef.current = null;
    const v = viewportRef.current;
    setViewport(v);
    onViewportChangeRef.current?.(v);
  }, []);

  // Commit a new viewport: update the live ref, paint the DOM immediately,
  // and schedule a single RAF to sync React state. Multiple calls within a
  // frame coalesce into one state commit.
  const commitViewport = useCallback(
    (next: ViewportState | ((v: ViewportState) => ViewportState)) => {
      const v =
        typeof next === 'function' ? next(viewportRef.current) : next;
      viewportRef.current = v;
      paintViewport(v);
      if (commitRafRef.current == null) {
        commitRafRef.current = requestAnimationFrame(flushViewport);
      }
    },
    [paintViewport, flushViewport],
  );

  // Cancel any pending RAF on unmount.
  useEffect(() => {
    return () => {
      if (commitRafRef.current != null) {
        cancelAnimationFrame(commitRafRef.current);
        commitRafRef.current = null;
      }
    };
  }, []);

  // Spacebar = temporary hand tool
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !isTypingInForm(e.target)) {
        setSpaceDown(true);
        e.preventDefault();
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') setSpaceDown(false);
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, []);

  // Always reads the live viewport ref so callers see the latest position
  // mid-gesture, not the stale (RAF-trailing) React state.
  const screenToWorld = useCallback((sx: number, sy: number) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    const v = viewportRef.current;
    return {
      x: (sx - rect.left - v.x) / v.zoom,
      y: (sy - rect.top - v.y) / v.zoom,
    };
  }, []);

  const setZoomAtAnchor = useCallback(
    (nextZoom: number, anchor?: { x: number; y: number }) => {
      const z = clamp(nextZoom, 0.1, 3);
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) {
        commitViewport((v) => ({ ...v, zoom: z }));
        return;
      }
      const cx = anchor ? anchor.x - rect.left : rect.width / 2;
      const cy = anchor ? anchor.y - rect.top : rect.height / 2;
      commitViewport((v) => {
        const ratio = z / v.zoom;
        return {
          zoom: z,
          x: cx - (cx - v.x) * ratio,
          y: cy - (cy - v.y) * ratio,
        };
      });
    },
    [commitViewport],
  );

  const zoomToFit = useCallback(() => {
    if (!contentBounds) return;
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const padding = 80;
    const sx = (rect.width - padding * 2) / contentBounds.width;
    const sy = (rect.height - padding * 2) / contentBounds.height;
    const z = clamp(Math.min(sx, sy), 0.1, 3);
    const cx =
      rect.width / 2 - (contentBounds.x + contentBounds.width / 2) * z;
    const cy =
      rect.height / 2 - (contentBounds.y + contentBounds.height / 2) * z;
    commitViewport({ x: cx, y: cy, zoom: z });
  }, [contentBounds, commitViewport]);

  const fitTo = useCallback(
    (rect: { x: number; y: number; width: number; height: number }) => {
      const c = containerRef.current?.getBoundingClientRect();
      if (!c) return;
      const padding = 100;
      const sx = (c.width - padding * 2) / rect.width;
      const sy = (c.height - padding * 2) / rect.height;
      const z = clamp(Math.min(sx, sy), 0.1, 3);
      const cx = c.width / 2 - (rect.x + rect.width / 2) * z;
      const cy = c.height / 2 - (rect.y + rect.height / 2) * z;
      commitViewport({ x: cx, y: cy, zoom: z });
    },
    [commitViewport],
  );

  useImperativeHandle(
    ref,
    () => ({
      setZoom: setZoomAtAnchor,
      fitTo,
      zoomIn: () => setZoomAtAnchor(viewportRef.current.zoom * 1.2),
      zoomOut: () => setZoomAtAnchor(viewportRef.current.zoom / 1.2),
      zoomToFit,
      // Read the live ref so consumers always see the latest viewport,
      // even mid-gesture before the RAF commit lands.
      getViewport: () => viewportRef.current,
      screenToWorld,
    }),
    [setZoomAtAnchor, zoomToFit, fitTo, screenToWorld],
  );

  // Wheel handler: ctrl/meta = zoom (anchored at the cursor), plain = pan.
  // Bound to `window`, not just the canvas element — otherwise ctrl/meta+wheel
  // while the cursor is over a toolbar overlay (the left rail, top bar, zoom
  // control) is never preventDefault'd and falls through to the browser's
  // native page-zoom, which leaves the whole app looking zoomed/shifted.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        // Always block native browser page-zoom; zoom the canvas instead,
        // wherever the cursor happens to be.
        e.preventDefault();
        const factor = Math.exp(-e.deltaY * 0.01);
        setZoomAtAnchor(viewportRef.current.zoom * factor, {
          x: e.clientX,
          y: e.clientY,
        });
        return;
      }
      // Plain wheel = pan, but only when the cursor is actually over the
      // canvas — don't hijack scrolling inside panels and modals. Frames that
      // host long content opt in with data-canvas-scroll; when there's room
      // to scroll in the wheel's direction, let the native scroll happen.
      if (el.contains(e.target as Node)) {
        const scrollable = (e.target as Element).closest?.(
          '[data-canvas-scroll]',
        ) as HTMLElement | null;
        if (scrollable) {
          const canScrollDown =
            e.deltaY > 0 &&
            scrollable.scrollTop + scrollable.clientHeight <
              scrollable.scrollHeight - 1;
          const canScrollUp = e.deltaY < 0 && scrollable.scrollTop > 0;
          if (canScrollDown || canScrollUp) return;
        }
        e.preventDefault();
        commitViewport((v) => ({
          ...v,
          x: v.x - e.deltaX,
          y: v.y - e.deltaY,
        }));
      }
    };
    window.addEventListener('wheel', onWheel, { passive: false });
    return () => window.removeEventListener('wheel', onWheel);
  }, [setZoomAtAnchor, commitViewport]);

  // iPad Safari fires non-standard `gesturestart/change/end` events alongside
  // pointer events. We already handle pinch via pointer events; suppress these
  // so Safari doesn't fall through to its own page-zoom path on the rare
  // surface that isn't `touch-action: none`.
  useEffect(() => {
    const swallow = (e: Event) => e.preventDefault();
    window.addEventListener('gesturestart', swallow);
    window.addEventListener('gesturechange', swallow);
    window.addEventListener('gestureend', swallow);
    return () => {
      window.removeEventListener('gesturestart', swallow);
      window.removeEventListener('gesturechange', swallow);
      window.removeEventListener('gestureend', swallow);
    };
  }, []);

  // Pan dragging
  const handMode = tool === 'hand' || spaceDown;
  /**
   * Tracks the in-flight background gesture. `moved` flips to true after the
   * cursor travels more than CLICK_VS_DRAG_PX from the down point — used to
   * distinguish "click on background" (which fires onBackgroundClick on up)
   * from "drag on background" (which fires onBackgroundDragStart/Move/End).
   */
  const dragRef = useRef<
    | {
        pid: number;
        downAt: number;
        world: { x: number; y: number };
        screen: { x: number; y: number };
        moved: boolean;
      }
    | null
  >(null);
  const CLICK_VS_DRAG_PX = 4;

  const startPinch = useCallback(() => {
    const pts = Array.from(pointersRef.current.values());
    if (pts.length < 2) return;
    const [a, b] = pts;
    const dist = Math.hypot(b.x - a.x, b.y - a.y);
    if (dist < 1) return;
    const v = viewportRef.current;
    pinchRef.current = {
      startDist: dist,
      startZoom: v.zoom,
      startCenter: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
      startViewport: { x: v.x, y: v.y, zoom: v.zoom },
    };
  }, []);

  const applyPinch = useCallback(() => {
    const pr = pinchRef.current;
    if (!pr) return;
    const pts = Array.from(pointersRef.current.values());
    if (pts.length < 2) return;
    const [a, b] = pts;
    const dist = Math.hypot(b.x - a.x, b.y - a.y);
    if (dist < 1) return;
    const center = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const z = clamp((pr.startZoom * dist) / pr.startDist, 0.1, 3);
    // Pin the world point under the starting centroid to the moving centroid.
    // This combines pan + zoom in a single transform.
    const sx = pr.startCenter.x - rect.left;
    const sy = pr.startCenter.y - rect.top;
    const worldX = (sx - pr.startViewport.x) / pr.startViewport.zoom;
    const worldY = (sy - pr.startViewport.y) / pr.startViewport.zoom;
    const nx = center.x - rect.left;
    const ny = center.y - rect.top;
    commitViewport({
      zoom: z,
      x: nx - worldX * z,
      y: ny - worldY * z,
    });
  }, [commitViewport]);

  const onPointerDown = (e: React.PointerEvent) => {
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    // Second finger lands → enter pinch mode and abort any single-pointer gesture.
    if (pointersRef.current.size >= 2) {
      if (panning) setPanning(false);
      if (dragRef.current) {
        try {
          (e.currentTarget as Element).releasePointerCapture?.(dragRef.current.pid);
        } catch {
          /* ignore */
        }
        // Tell the parent the drag is over without committing a draft.
        const world = screenToWorld(e.clientX, e.clientY);
        onBackgroundDragEnd?.(world);
        dragRef.current = null;
      }
      startPinch();
      e.preventDefault();
      return;
    }

    // background click to deselect
    const isBg = (e.target as HTMLElement).dataset.canvasBg === 'true';
    if (handMode || e.button === 1) {
      setPanning(true);
      (e.target as Element).setPointerCapture(e.pointerId);
      e.preventDefault();
    } else if (isBg) {
      const world = screenToWorld(e.clientX, e.clientY);
      // Always start a "maybe drag" gesture. If the user releases without
      // moving past the threshold, we treat it as a click and fire
      // onBackgroundClick on pointerUp instead of onBackgroundDragStart.
      dragRef.current = {
        pid: e.pointerId,
        downAt: Date.now(),
        world,
        screen: { x: e.clientX, y: e.clientY },
        moved: false,
      };
      (e.target as Element).setPointerCapture(e.pointerId);
      e.preventDefault();
    }
  };
  const lastCursorRef = useRef<{ x: number; y: number } | null>(null);
  const cursorRafRef = useRef<number | null>(null);
  const flushCursor = useCallback(() => {
    cursorRafRef.current = null;
    const c = lastCursorRef.current;
    if (!c || !onCursorMove) return;
    const w = screenToWorld(c.x, c.y);
    onCursorMove(w.x, w.y);
  }, [onCursorMove, screenToWorld]);

  const onPointerMove = (e: React.PointerEvent) => {
    if (pointersRef.current.has(e.pointerId)) {
      pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    }

    if (pinchRef.current && pointersRef.current.size >= 2) {
      applyPinch();
      e.preventDefault();
      return;
    }

    if (panning) {
      commitViewport((v) => ({
        ...v,
        x: v.x + e.movementX,
        y: v.y + e.movementY,
      }));
    }
    if (dragRef.current) {
      const d = dragRef.current;
      if (!d.moved) {
        const dx = e.clientX - d.screen.x;
        const dy = e.clientY - d.screen.y;
        if (Math.hypot(dx, dy) >= CLICK_VS_DRAG_PX) {
          d.moved = true;
          onBackgroundDragStart?.(d.world);
        }
      }
      if (d.moved && onBackgroundDragMove) {
        onBackgroundDragMove(screenToWorld(e.clientX, e.clientY));
      }
    }
    if (onCursorMove) {
      lastCursorRef.current = { x: e.clientX, y: e.clientY };
      if (cursorRafRef.current == null) {
        cursorRafRef.current = requestAnimationFrame(flushCursor);
      }
    }
  };
  const onPointerUp = (e: React.PointerEvent) => {
    pointersRef.current.delete(e.pointerId);

    if (pinchRef.current && pointersRef.current.size < 2) {
      // End of pinch. Don't promote the remaining finger (if any) to a pan —
      // makes the gesture feel less twitchy when one finger lifts before the
      // other.
      pinchRef.current = null;
      return;
    }

    if (panning) {
      setPanning(false);
      (e.target as Element).releasePointerCapture?.(e.pointerId);
    }
    if (dragRef.current && dragRef.current.pid === e.pointerId) {
      const d = dragRef.current;
      const world = screenToWorld(e.clientX, e.clientY);
      if (d.moved) {
        onBackgroundDragEnd?.(world);
      } else {
        // No appreciable movement → it was a click, not a drag.
        onBackgroundClick?.(d.world);
      }
      (e.target as Element).releasePointerCapture?.(e.pointerId);
      dragRef.current = null;
    }
  };
  const onPointerCancel = (e: React.PointerEvent) => {
    pointersRef.current.delete(e.pointerId);
    if (pinchRef.current && pointersRef.current.size < 2) {
      pinchRef.current = null;
    }
    if (panning) setPanning(false);
    if (dragRef.current && dragRef.current.pid === e.pointerId) {
      dragRef.current = null;
    }
  };

  return (
    <div
      ref={containerRef}
      className={
        'canvas-surface relative h-full w-full overflow-hidden bg-canvas dotted-grid ' +
        (panning
          ? 'cursor-grabbing'
          : handMode
            ? 'cursor-grab'
            : tool === 'comment'
              ? 'cursor-crosshair'
              : 'cursor-default')
      }
      style={{
        backgroundSize: `${24 * viewport.zoom}px ${24 * viewport.zoom}px`,
        backgroundPosition: `${viewport.x}px ${viewport.y}px`,
      }}
      data-canvas-bg="true"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
    >
      <div
        ref={wrapperRef}
        className="no-select absolute left-0 top-0 origin-top-left"
        style={{
          transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})`,
          transformOrigin: '0 0',
        }}
      >
        {children}
      </div>
    </div>
  );
});

function clamp(n: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, n));
}

function isTypingInForm(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable;
}
