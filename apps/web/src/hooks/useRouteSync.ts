// URL ↔ canvas selection sync. Watches the current `route` (frameId +
// commentId) and pans/zooms the canvas to match. Owns the "focused-frame"
// ref that dedupes repeat focuses, and bridges a `commentId` deep-link
// into opening the matching popover.
//
// Boundary: read-only with respect to the route — it doesn't navigate.
// Writes into App-owned state via the setters passed in (popover, focused
// frame), and into the canvas via the provided ref. Reads `snap.frames`
// and `snap.comments` to resolve the route's ids to live frames/comments;
// keeping those as direct Maps (rather than re-deriving) lets a frame
// upsert from the WS land immediately without an extra hop.

import { useCallback, useEffect, useRef } from 'react';
import type { Comment, Frame } from '@foldo/protocol';
import type { CanvasHandle } from '../components/Canvas';
import type { Route } from '../routing/Router';
import type { BootState } from './useCanvasBoot';

export interface PopoverState {
  frameId: string;
  commentId: string;
  composing?: boolean;
}

export interface RouteSyncOptions {
  /** Live boot state — we only sync once `ready` or `offline`. */
  boot: BootState;
  /** Current route. */
  route: Route;
  /** Hydration flag from the store; pan is gated on this. */
  hydrated: boolean;
  /** Live frames map (route.frameId is looked up here). */
  frames: Map<string, Frame>;
  /** Live comments map (route.commentId is looked up here). */
  comments: Map<string, Comment>;
  /** Canvas imperative handle for zoomToFit / fitTo. */
  canvasRef: React.RefObject<CanvasHandle>;
  /** Setter for the popover state when the URL carries a commentId. */
  setCommentPopover: (p: PopoverState | null) => void;
}

export interface RouteSyncApi {
  /** Imperative pan-and-zoom helper used by handlers outside the sync effect. */
  fitToFrame: (frame: Frame, padding?: number) => void;
}

export function useRouteSync({
  boot,
  route,
  hydrated,
  frames,
  comments,
  canvasRef,
  setCommentPopover,
}: RouteSyncOptions): RouteSyncApi {
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

  useEffect(() => {
    if (boot.kind !== 'ready' && boot.kind !== 'offline') return;
    if (!hydrated) return;
    if (!route.frameId) {
      // No focus, fit to all frames once.
      if (focusedFrameRef.current !== '__all__') {
        focusedFrameRef.current = '__all__';
        setTimeout(() => canvasRef.current?.zoomToFit(), 60);
      }
      return;
    }
    const f = frames.get(route.frameId);
    if (!f) return;
    if (focusedFrameRef.current === route.frameId) return;
    focusedFrameRef.current = route.frameId;
    setTimeout(() => fitToFrame(f), 60);
    // If a commentId is set, open the popover
    if (route.commentId) {
      const c = comments.get(route.commentId);
      if (c) setCommentPopover({ frameId: c.frameId, commentId: c.id });
    } else {
      setCommentPopover(null);
    }
  }, [
    boot.kind,
    route.frameId,
    route.commentId,
    hydrated,
    frames,
    comments,
    fitToFrame,
    canvasRef,
    setCommentPopover,
  ]);

  return { fitToFrame };
}
