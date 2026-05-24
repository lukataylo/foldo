// Viewport-derived helpers for the canvas — the content-bounds rectangle
// (used to size the canvas's pannable area) and the near-viewport frame-id
// set (used to gate which frames render heavy contents like the live app
// iframe). Also owns the window-resize listener that tracks container size.
//
// Boundary: derives from `frames` + the live `viewport` (transient — App
// owns the state since the Canvas writes into it). Doesn't subscribe to
// the store directly: takes `frames` as an input so it benefits from the
// granular useBoardSelector that produced it upstream.

import { useEffect, useMemo, useState } from 'react';
import type { Frame } from '@foldo/protocol';
import type { ViewportState } from '../components/Canvas';

export interface ContainerSize {
  width: number;
  height: number;
}

export interface FrameViewportApi {
  /** AABB enclosing every frame, used as the Canvas's contentBounds. */
  bounds: { x: number; y: number; width: number; height: number };
  /** Frame ids within ~1.5× the viewport on each side (live-render gate). */
  inViewportSet: Set<string>;
  /** Window-tracked container size (kept in sync via a resize listener). */
  containerSize: ContainerSize;
}

export function useFrameViewport(
  frames: Frame[],
  viewport: ViewportState,
): FrameViewportApi {
  const [containerSize, setContainerSize] = useState<ContainerSize>({
    width: typeof window !== 'undefined' ? window.innerWidth : 1440,
    height: typeof window !== 'undefined' ? window.innerHeight : 900,
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onResize = (): void => {
      setContainerSize({ width: window.innerWidth, height: window.innerHeight });
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

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

  return { bounds, inViewportSet, containerSize };
}
