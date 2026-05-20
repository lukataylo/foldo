import { useRef } from 'react';
import type { Frame } from '@foldo/protocol';
import { boardStore } from '../state/BoardStore';
import { getZoom } from '../state/viewportStore';
import { moveFrame as apiMoveFrame } from '../api/frames';

// Click-vs-drag threshold. Higher on touch surfaces so a tap-to-focus on an
// iPad doesn't accidentally start moving the frame a couple of pixels.
const DRAG_THRESHOLD_PX =
  typeof window !== 'undefined' &&
  window.matchMedia?.('(pointer: coarse)').matches
    ? 6
    : 2;

interface Options {
  frame: Frame;
  /** When false the handlers no-op (e.g. read-only share viewer). */
  enabled?: boolean;
}

/**
 * Pointer-down/move/up handlers that turn any element into a drag handle for
 * the given frame. Lives on the body of `ImageFrame` and `StickyFrame` so the
 * user can grab the whole frame, not just the tiny meta header above it, and
 * is also used by `FrameMeta` itself so the header still works.
 *
 * Spread the returned `handlers` onto the element: it must be the same node
 * that calls `setPointerCapture`, which is what `e.currentTarget` resolves to.
 *
 * Click vs drag is disambiguated by a small distance threshold (2 px in
 * world coords). A pure click (no movement) leaves the click event to its
 * normal handler so things like the sticky textarea still focus on click.
 *
 * Elements that should NOT initiate a drag (a button inside the frame, a
 * comment pin, etc.) can opt out by carrying `data-no-drag` anywhere in
 * their ancestry up to the bound element.
 */
export function useFrameDrag({ frame, enabled = true }: Options) {
  const dragRef = useRef<
    | {
        startClientX: number;
        startClientY: number;
        frameX0: number;
        frameY0: number;
        pointerId: number;
        moved: boolean;
      }
    | null
  >(null);

  function onPointerDown(e: React.PointerEvent<HTMLElement>): void {
    if (!enabled) return;
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (target.closest('[data-no-drag]')) return;
    dragRef.current = {
      startClientX: e.clientX,
      startClientY: e.clientY,
      frameX0: frame.position.x,
      frameY0: frame.position.y,
      pointerId: e.pointerId,
      moved: false,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: React.PointerEvent<HTMLElement>): void {
    const d = dragRef.current;
    if (!d) return;
    // Live zoom — read at move time, never subscribed (no re-render).
    const zoom = getZoom();
    const dx = (e.clientX - d.startClientX) / zoom;
    const dy = (e.clientY - d.startClientY) / zoom;
    if (!d.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD_PX / zoom) return;
    if (!d.moved) {
      // First real movement — prevent default so we don't double-trigger
      // (text selection, native image drag, etc.) on the rest of the drag.
      d.moved = true;
      e.preventDefault();
    }
    boardStore.moveFrame(frame.id, d.frameX0 + dx, d.frameY0 + dy);
  }

  async function onPointerUp(e: React.PointerEvent<HTMLElement>): Promise<void> {
    const d = dragRef.current;
    if (!d) return;
    try {
      e.currentTarget.releasePointerCapture(d.pointerId);
    } catch {
      // ignore
    }
    dragRef.current = null;
    if (!d.moved) return;
    // Swallow the click event that follows a drag so we don't focus a textarea
    // or open an inspector on the same gesture.
    e.preventDefault();
    e.stopPropagation();
    const f = boardStore.getSnapshot().frames.get(frame.id);
    if (!f) return;
    try {
      await apiMoveFrame(frame.id, { position: f.position });
    } catch {
      boardStore.moveFrame(frame.id, d.frameX0, d.frameY0);
    }
  }

  return {
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerCancel: onPointerUp,
    },
    /** True while a drag is actively in flight. */
    isDragging: () => dragRef.current?.moved === true,
  };
}
