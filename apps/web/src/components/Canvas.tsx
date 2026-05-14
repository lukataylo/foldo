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

  useImperativeHandle(
    ref,
    () => ({
      setZoom: setZoomAtAnchor,
      fitTo,
      zoomIn: () => setZoomAtAnchor(viewport.zoom * 1.2),
      zoomOut: () => setZoomAtAnchor(viewport.zoom / 1.2),
      zoomToFit,
      getViewport: () => viewport,
      screenToWorld,
    }),
    [setZoomAtAnchor, viewport, zoomToFit, fitTo, screenToWorld],
  );

  // Wheel handler: pinch-to-zoom (ctrlKey on Mac trackpad), else pan
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) {
        // pinch zoom
        const factor = Math.exp(-e.deltaY * 0.01);
        setZoomAtAnchor(viewport.zoom * factor, { x: e.clientX, y: e.clientY });
      } else {
        setViewport((v) => ({
          ...v,
          x: v.x - e.deltaX,
          y: v.y - e.deltaY,
        }));
      }
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [viewport.zoom, setZoomAtAnchor]);

  // Pan dragging
  const handMode = tool === 'hand' || spaceDown;
  const dragRef = useRef<{ pid: number; downAt: number; world: { x: number; y: number } } | null>(null);
  const onPointerDown = (e: React.PointerEvent) => {
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
    if (panning) {
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
      }}
      data-canvas-bg="true"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
      <div
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
