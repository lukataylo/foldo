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
  /**
   * Pan the camera so `rect` is centered, WITHOUT changing zoom level.
   * Use this for in-canvas navigation (e.g. clicking a frame) — the user
   * chose their zoom, don't smash it. Use fitTo for cold/deep-link entry.
   */
  panTo: (worldRect: { x: number; y: number; width: number; height: number }) => void;
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
  const [viewport, setViewport] = useState<ViewportState>(
    initialViewport ?? { x: 0, y: 0, zoom: 0.6 },
  );
  const [panning, setPanning] = useState(false);
  const [spaceDown, setSpaceDown] = useState(false);

  useEffect(() => {
    onViewportChange?.(viewport);
  }, [viewport, onViewportChange]);

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

  const screenToWorld = useCallback(
    (sx: number, sy: number) => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return { x: 0, y: 0 };
      return {
        x: (sx - rect.left - viewport.x) / viewport.zoom,
        y: (sy - rect.top - viewport.y) / viewport.zoom,
      };
    },
    [viewport],
  );

  const setZoomAtAnchor = useCallback(
    (nextZoom: number, anchor?: { x: number; y: number }) => {
      const z = clamp(nextZoom, 0.1, 3);
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) {
        setViewport((v) => ({ ...v, zoom: z }));
        return;
      }
      const cx = anchor ? anchor.x - rect.left : rect.width / 2;
      const cy = anchor ? anchor.y - rect.top : rect.height / 2;
      setViewport((v) => {
        const ratio = z / v.zoom;
        return {
          zoom: z,
          x: cx - (cx - v.x) * ratio,
          y: cy - (cy - v.y) * ratio,
        };
      });
    },
    [],
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
    setViewport({ x: cx, y: cy, zoom: z });
  }, [contentBounds]);

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
      setViewport({ x: cx, y: cy, zoom: z });
    },
    [],
  );

  // Pan-only navigation — keep the user's current zoom. Use for
  // in-canvas hops (clicking a frame, Layer Navigator row click) so the
  // camera doesn't keep snapping to different zoom levels.
  const panTo = useCallback(
    (rect: { x: number; y: number; width: number; height: number }) => {
      const c = containerRef.current?.getBoundingClientRect();
      if (!c) return;
      const z = viewport.zoom;
      const cx = c.width / 2 - (rect.x + rect.width / 2) * z;
      const cy = c.height / 2 - (rect.y + rect.height / 2) * z;
      setViewport({ x: cx, y: cy, zoom: z });
    },
    [viewport.zoom],
  );

  useImperativeHandle(
    ref,
    () => ({
      setZoom: setZoomAtAnchor,
      fitTo,
      panTo,
      zoomIn: () => setZoomAtAnchor(viewport.zoom * 1.2),
      zoomOut: () => setZoomAtAnchor(viewport.zoom / 1.2),
      zoomToFit,
      getViewport: () => viewport,
      screenToWorld,
    }),
    [setZoomAtAnchor, viewport, zoomToFit, fitTo, panTo, screenToWorld],
  );

  // Latest viewport.zoom in a ref so the wheel listener can read it without
  // re-binding on every zoom event. The previous implementation listed
  // viewport.zoom in the effect deps, which meant the listener was
  // removed + re-added on every wheel tick. Under a fast trackpad pinch
  // that produces 60+ events/sec, the brief teardown window could drop
  // preventDefault on an event, letting the browser native page-zoom
  // through and pushing the toolbars out of the layout viewport.
  const zoomRef = useRef(viewport.zoom);
  zoomRef.current = viewport.zoom;

  // Wheel handler: ctrl/meta = zoom (anchored at the cursor), plain = pan.
  // Bound to `window`, not just the canvas element — otherwise ctrl/meta+wheel
  // while the cursor is over a toolbar overlay (the side panel, top bar,
  // zoom control) is never preventDefault'd and falls through to the
  // browser's native page-zoom, which leaves the whole app looking
  // zoomed/shifted.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        // Always block native browser page-zoom; zoom the canvas instead,
        // wherever the cursor happens to be.
        e.preventDefault();
        const factor = Math.exp(-e.deltaY * 0.01);
        setZoomAtAnchor(zoomRef.current * factor, {
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
        setViewport((v) => ({
          ...v,
          x: v.x - e.deltaX,
          y: v.y - e.deltaY,
        }));
      }
    };
    window.addEventListener('wheel', onWheel, { passive: false });

    // Safari proprietary gesture API. During a trackpad pinch, Safari
    // fires gesturestart/change/end and SUPPRESSES the wheel-with-ctrlKey
    // events that Chrome uses — so we can't just preventDefault these and
    // rely on the wheel branch. Instead, drive zoom directly from the
    // gesture's `scale` property:
    //
    //   gesturestart   — snapshot the current zoom + anchor.
    //   gesturechange  — apply `startZoom * e.scale` anchored at the snap.
    //   gestureend     — clear the snapshot.
    //
    // preventDefault is called on every gesture event to block Safari's
    // visual-viewport zoom (which would push the position:fixed chrome
    // out of the visible viewport — the original "lost toolbar" bug).
    //
    // GestureEvent isn't in TypeScript's lib (Safari-only proprietary
    // API), so we type the event minimally inline.
    type GestureEventLike = Event & {
      scale: number;
      clientX: number;
      clientY: number;
    };
    let gestureStartZoom = 0;
    let gestureStartAnchor = { x: 0, y: 0 };
    const onGestureStart = (e: Event): void => {
      e.preventDefault();
      const ge = e as GestureEventLike;
      gestureStartZoom = zoomRef.current;
      gestureStartAnchor = { x: ge.clientX, y: ge.clientY };
    };
    const onGestureChange = (e: Event): void => {
      e.preventDefault();
      const ge = e as GestureEventLike;
      if (gestureStartZoom === 0 || !Number.isFinite(ge.scale)) return;
      setZoomAtAnchor(gestureStartZoom * ge.scale, gestureStartAnchor);
    };
    const onGestureEnd = (e: Event): void => {
      e.preventDefault();
      gestureStartZoom = 0;
    };
    window.addEventListener('gesturestart', onGestureStart, { passive: false });
    window.addEventListener('gesturechange', onGestureChange, { passive: false });
    window.addEventListener('gestureend', onGestureEnd, { passive: false });

    return () => {
      window.removeEventListener('wheel', onWheel);
      window.removeEventListener('gesturestart', onGestureStart);
      window.removeEventListener('gesturechange', onGestureChange);
      window.removeEventListener('gestureend', onGestureEnd);
    };
    // setZoomAtAnchor is stable across renders (useCallback in this file).
  }, [setZoomAtAnchor]);

  // Pan dragging
  const handMode = tool === 'hand' || spaceDown;
  const dragRef = useRef<{ pid: number; downAt: number; world: { x: number; y: number } } | null>(null);

  /* A+W1 touch: multi-touch bookkeeping for pinch-zoom + two-finger pan.
     We track every active pointer's last screen position in pointersRef so
     that, with 2+ pointers down, we can compute centroid + distance deltas
     even though React's pointer events fire one-at-a-time. The dedicated
     pinchRef snapshots the last frame's centroid/distance so we apply only
     the delta between frames, not the cumulative drift since gesture-start. */
  const pointersRef = useRef<Map<number, { x: number; y: number; type: string }>>(
    new Map(),
  );
  const pinchRef = useRef<{
    distance: number;
    centerX: number;
    centerY: number;
  } | null>(null);
  /** True iff an Apple Pencil pointer is currently down. Touch pointers that
      arrive while a pen is active get ignored — palm rejection. */
  const penActiveRef = useRef(false);
  /** Last pressure value observed from a pen pointer. Future ink tools can
      read it; today nothing consumes it but the wiring is here. */
  const lastPenPressureRef = useRef(1);
  /* /A+W1 touch */

  const onPointerDown = (e: React.PointerEvent) => {
    /* A+W1 touch: register every pointer, even the ones that don't start
       a pan or a draw, so the pinch-detection logic in onPointerMove can
       see the full constellation. */
    pointersRef.current.set(e.pointerId, {
      x: e.clientX,
      y: e.clientY,
      type: e.pointerType,
    });

    if (e.pointerType === 'pen') {
      penActiveRef.current = true;
      lastPenPressureRef.current = e.pressure || 1;
    } else if (e.pointerType === 'touch' && penActiveRef.current) {
      // Palm rejection: ignore touch pointers that arrive while a Pencil is
      // also down on the canvas. The Pencil wins.
      return;
    }

    // Two (or more) touches always pan — never start a draw/comment/sticky.
    if (pointersRef.current.size >= 2) {
      // If a single-pointer drag was just starting (sticky/arrow tool), abort
      // it so the second finger doesn't accidentally place a frame.
      dragRef.current = null;
      const pts = [...pointersRef.current.values()];
      const a = pts[0]!;
      const b = pts[1]!;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      pinchRef.current = {
        distance: Math.hypot(dx, dy),
        centerX: (a.x + b.x) / 2,
        centerY: (a.y + b.y) / 2,
      };
      setPanning(true);
      e.preventDefault();
      return;
    }
    /* /A+W1 touch */

    // background click to deselect
    const isBg = (e.target as HTMLElement).dataset.canvasBg === 'true';
    if (handMode || e.button === 1) {
      setPanning(true);
      (e.target as Element).setPointerCapture(e.pointerId);
      e.preventDefault();
    } else if (isBg) {
      const world = screenToWorld(e.clientX, e.clientY);
      if (onBackgroundDragStart) {
        dragRef.current = { pid: e.pointerId, downAt: Date.now(), world };
        (e.target as Element).setPointerCapture(e.pointerId);
        onBackgroundDragStart(world);
        e.preventDefault();
      } else {
        onBackgroundClick?.(world);
      }
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
    /* A+W1 touch: keep the per-pointer position in sync so pinch math sees
       this frame's coordinates, not stale ones. */
    if (pointersRef.current.has(e.pointerId)) {
      pointersRef.current.set(e.pointerId, {
        x: e.clientX,
        y: e.clientY,
        type: e.pointerType,
      });
    }
    if (e.pointerType === 'pen') {
      lastPenPressureRef.current = e.pressure || 1;
    }

    // Pinch / two-finger pan handling — when 2+ pointers are down we always
    // route the move into the gesture, never into a draw/comment/sticky path.
    if (pointersRef.current.size >= 2 && pinchRef.current) {
      const pts = [...pointersRef.current.values()];
      const a = pts[0]!;
      const b = pts[1]!;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dist = Math.hypot(dx, dy);
      const cx = (a.x + b.x) / 2;
      const cy = (a.y + b.y) / 2;

      // Pan delta = centroid movement.
      const panDx = cx - pinchRef.current.centerX;
      const panDy = cy - pinchRef.current.centerY;
      // Zoom delta = distance ratio.
      const zoomFactor =
        pinchRef.current.distance > 0 ? dist / pinchRef.current.distance : 1;

      setViewport((v) => {
        const nextZoom = clamp(v.zoom * zoomFactor, 0.1, 3);
        const ratio = nextZoom / v.zoom;
        const rect = containerRef.current?.getBoundingClientRect();
        const ax = rect ? cx - rect.left : cx;
        const ay = rect ? cy - rect.top : cy;
        return {
          zoom: nextZoom,
          x: ax - (ax - v.x) * ratio + panDx,
          y: ay - (ay - v.y) * ratio + panDy,
        };
      });

      pinchRef.current = { distance: dist, centerX: cx, centerY: cy };
      e.preventDefault();
      return;
    }
    /* /A+W1 touch */

    if (panning) {
      setViewport((v) => ({ ...v, x: v.x + e.movementX, y: v.y + e.movementY }));
    }
    if (dragRef.current && onBackgroundDragMove) {
      onBackgroundDragMove(screenToWorld(e.clientX, e.clientY));
    }
    if (onCursorMove) {
      lastCursorRef.current = { x: e.clientX, y: e.clientY };
      if (cursorRafRef.current == null) {
        cursorRafRef.current = requestAnimationFrame(flushCursor);
      }
    }
  };
  const onPointerUp = (e: React.PointerEvent) => {
    /* A+W1 touch: drop the lifted pointer; if we're back below 2 pointers,
       clear the pinch state so the next gesture starts fresh. */
    pointersRef.current.delete(e.pointerId);
    if (e.pointerType === 'pen') {
      penActiveRef.current = false;
    }
    if (pointersRef.current.size < 2) {
      pinchRef.current = null;
    }
    if (pointersRef.current.size === 0) {
      // No more fingers down — release any leftover panning state.
      setPanning(false);
    }
    /* /A+W1 touch */

    if (panning && pointersRef.current.size === 0) {
      setPanning(false);
      (e.target as Element).releasePointerCapture?.(e.pointerId);
    }
    if (dragRef.current && dragRef.current.pid === e.pointerId) {
      const world = screenToWorld(e.clientX, e.clientY);
      onBackgroundDragEnd?.(world);
      (e.target as Element).releasePointerCapture?.(e.pointerId);
      dragRef.current = null;
    }
  };

  return (
    <div
      ref={containerRef}
      className={
        'relative h-full w-full overflow-hidden bg-canvas dotted-grid ' +
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
        /* A+W1 touch: block iOS's native double-tap zoom + bounce-scroll so
           pinch-zoom + two-finger pan stay in our handlers. */
        touchAction: 'none',
      }}
      data-canvas-bg="true"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      /* A+W1 touch: pointercancel fires when iOS reclaims a pointer (e.g.
         system gesture, second app), so we mirror onPointerUp to clean state. */
      onPointerCancel={onPointerUp}
      onPointerLeave={onPointerUp}
    >
      <div
        data-testid="foldo-canvas-frames"
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
