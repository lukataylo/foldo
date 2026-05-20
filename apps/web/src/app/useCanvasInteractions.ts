// Canvas background interaction handlers (click / drag for built-in + plugin
// tools), extracted from App.tsx so the render stays declarative.

import { useMemo } from 'react';
import type { ToolContext } from '@foldo/plugin-api';
import { registry } from '../plugins/registry';
import type { Route } from '../routing/Router';
import type { BoardSnapshot } from '../state/BoardStore';
import type { SelectedElement, Tool } from '../types';
import type { CommentPopoverState } from './useComments';
import type { ArrowDraft, UseCanvasToolsResult } from './useCanvasTools';

interface World {
  x: number;
  y: number;
}

interface UseCanvasInteractionsArgs {
  tool: Tool;
  snap: BoardSnapshot;
  navigate: (next: Route, opts?: { replace?: boolean }) => void;
  toolCtx: ToolContext;
  createArrowFrame: UseCanvasToolsResult['createArrowFrame'];
  openImagePicker: UseCanvasToolsResult['openImagePicker'];
  arrowDraftRef: React.MutableRefObject<ArrowDraft | null>;
  setArrowDraft: (d: ArrowDraft | null) => void;
  setSelectedElement: (sel: SelectedElement | null) => void;
  setCommentPopover: (p: CommentPopoverState | null) => void;
}

export interface CanvasInteractions {
  onBackgroundClick: (world: World) => void;
  onBackgroundDragStart: (world: World) => void;
  onBackgroundDragMove: (world: World) => void;
  onBackgroundDragEnd: (world: World) => void;
}

export function useCanvasInteractions({
  tool,
  snap,
  navigate,
  toolCtx,
  createArrowFrame,
  openImagePicker,
  arrowDraftRef,
  setArrowDraft,
  setSelectedElement,
  setCommentPopover,
}: UseCanvasInteractionsArgs): CanvasInteractions {
  return useMemo(
    () => ({
      onBackgroundClick: (world: World) => {
        // `image` stays host-handled: it must trigger a hidden <input type=file>
        // the host mounts — UI the stateless tool contract can't own.
        if (tool === 'image') {
          openImagePicker(world);
          return;
        }
        // Everything else (including the built-in `sticky`) goes through the
        // standard ToolPlugin.onBackgroundClick contract.
        const plugin = registry.getTool(tool);
        if (plugin?.onBackgroundClick) {
          plugin.onBackgroundClick(world, toolCtx);
          if (plugin.preventDeselectOnBackground) return;
        }
        if (tool !== 'comment') {
          setSelectedElement(null);
          setCommentPopover(null);
          if (snap.board) {
            navigate({ boardId: snap.board.id });
          }
        }
      },
      // `arrow` stays host-handled: it paints a live drag-preview overlay on
      // the canvas, which a stateless tool plugin can't render.
      onBackgroundDragStart: (world: World) => {
        if (tool === 'arrow') {
          arrowDraftRef.current = {
            startX: world.x,
            startY: world.y,
            endX: world.x,
            endY: world.y,
          };
          setArrowDraft(arrowDraftRef.current);
          return;
        }
        registry.getTool(tool)?.drag?.onStart?.(world);
      },
      onBackgroundDragMove: (world: World) => {
        if (tool === 'arrow') {
          if (!arrowDraftRef.current) return;
          arrowDraftRef.current = {
            ...arrowDraftRef.current,
            endX: world.x,
            endY: world.y,
          };
          setArrowDraft({ ...arrowDraftRef.current });
          return;
        }
        registry.getTool(tool)?.drag?.onMove?.(world);
      },
      onBackgroundDragEnd: (world: World) => {
        if (tool === 'arrow') {
          const d = arrowDraftRef.current;
          arrowDraftRef.current = null;
          setArrowDraft(null);
          if (!d) return;
          const dist = Math.hypot(world.x - d.startX, world.y - d.startY);
          if (dist < 24) return; // ignore stray taps
          void createArrowFrame(d.startX, d.startY, world.x, world.y);
          return;
        }
        registry.getTool(tool)?.drag?.onEnd?.(world);
      },
    }),
    [
      tool,
      snap.board,
      navigate,
      toolCtx,
      createArrowFrame,
      openImagePicker,
      arrowDraftRef,
      setArrowDraft,
      setSelectedElement,
      setCommentPopover,
    ],
  );
}
