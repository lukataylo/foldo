// Viewport store — the canvas camera (x/y/zoom) plus the near-viewport frame
// set. Kept OUT of the plugin runtime context on purpose: the camera changes
// on every wheel/pinch tick, and routing that through a context value would
// re-render every frame plugin on every tick.
//
// Instead, consumers subscribe via useSyncExternalStore with a narrow
// selector, so a component re-renders only when the slice it reads actually
// changes — `useZoom()` wakes FrameMeta on zoom; `useIsFrameInViewport(id)`
// wakes one frame only when its own membership flips.

import { useSyncExternalStore } from 'react';

export interface ViewportSnapshot {
  x: number;
  y: number;
  zoom: number;
  /** Frame ids currently within the near-viewport render window. */
  inViewport: Set<string>;
}

type Listener = () => void;

class ViewportStoreImpl {
  private snap: ViewportSnapshot = {
    x: 0,
    y: 0,
    zoom: 0.6,
    inViewport: new Set(),
  };
  private listeners = new Set<Listener>();

  getSnapshot(): ViewportSnapshot {
    return this.snap;
  }

  subscribe = (l: Listener): (() => void) => {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  };

  /** Camera moved. No-ops (no emit) when nothing actually changed. */
  setViewport(x: number, y: number, zoom: number): void {
    const s = this.snap;
    if (s.x === x && s.y === y && s.zoom === zoom) return;
    this.snap = { ...s, x, y, zoom };
    this.emit();
  }

  /** The near-viewport frame set was recomputed. */
  setInViewport(next: Set<string>): void {
    this.snap = { ...this.snap, inViewport: next };
    this.emit();
  }

  private emit(): void {
    for (const l of this.listeners) l();
  }
}

export const viewportStore = new ViewportStoreImpl();

/** Reactive zoom — re-renders the caller only when zoom changes. */
export function useZoom(): number {
  return useSyncExternalStore(
    viewportStore.subscribe,
    () => viewportStore.getSnapshot().zoom,
  );
}

/** Reactive full camera — for the rare consumer that needs x/y/zoom together. */
export function useViewport(): ViewportSnapshot {
  return useSyncExternalStore(
    viewportStore.subscribe,
    () => viewportStore.getSnapshot(),
  );
}

/**
 * Reactive per-frame viewport membership. Returns a boolean, so the caller
 * re-renders only when *its* frame enters/leaves the window — not on every
 * recompute of the set.
 */
export function useIsFrameInViewport(frameId: string): boolean {
  return useSyncExternalStore(
    viewportStore.subscribe,
    () => viewportStore.getSnapshot().inViewport.has(frameId),
  );
}

/** Non-reactive zoom read — for event handlers (drag math) that must not
 *  subscribe. Always returns the live value. */
export function getZoom(): number {
  return viewportStore.getSnapshot().zoom;
}
