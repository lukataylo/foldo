// Pure geometry helpers extracted from App.tsx. No React — the hooks below
// (useCanvasViewport) call these inside useMemo.

import type { Frame } from '@foldo/protocol';

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Content bounds — the min/max box over all frame rects. The top edge is
 * padded by 36px to leave room for each frame's meta header.
 */
export function computeBounds(frames: Frame[]): Rect {
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
}

/**
 * Near-viewport set: frames within ~1.5× the viewport on each side. The camera
 * moves continuously, but membership only flips occasionally — callers should
 * quantize the camera for the memo dependency so this recomputes only when the
 * camera crosses a bucket boundary. The 1.5× padding absorbs sub-bucket drift.
 */
export function computeInViewportSet(
  frames: Frame[],
  viewport: { x: number; y: number; zoom: number },
  containerSize: { width: number; height: number },
): Set<string> {
  const w = containerSize.width;
  const h = containerSize.height;
  const padX = w * 1.5;
  const padY = h * 1.5;
  // Visible world rect:
  const worldLeft = -viewport.x / viewport.zoom - padX / viewport.zoom;
  const worldTop = -viewport.y / viewport.zoom - padY / viewport.zoom;
  const worldRight = (-viewport.x + w) / viewport.zoom + padX / viewport.zoom;
  const worldBottom = (-viewport.y + h) / viewport.zoom + padY / viewport.zoom;
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
}
