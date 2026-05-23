// Extracts the sticky / arrow / image creation flow from App.tsx. Owns the
// transient arrow-draft state, the hidden file input ref for image upload,
// and the create handlers. Returns:
//   - state to render the arrow draft + the file input
//   - handlers to wire into the Canvas's background pointer events
//
// Network bits (apiCreateFrame, apiUploadImage) live where they did; this
// hook just colocates the state machine that used to be inline in App.

import { useCallback, useRef, useState } from 'react';
import type { Board, Branch } from '@foldo/protocol';
import { uploadImage as apiUploadImage } from '../api/uploads';
import { createFrame as apiCreateFrame } from '../api/frames';
import { boardStore } from '../state/useBoardStore';
import type { Tool } from '../types';

export interface ArrowDraft {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
}

export interface FrameToolsOptions {
  board: Board | null;
  branches: Map<string, Branch>;
  setTool: (t: Tool) => void;
  pushToast: (msg: string) => void;
}

export interface FrameToolsApi {
  /** Live draft state for the in-progress arrow drag (null when idle). */
  arrowDraft: ArrowDraft | null;
  /** Ref the hidden <input type="file"> attaches to. */
  imageInputRef: React.RefObject<HTMLInputElement>;
  /** onChange for the hidden image input. */
  onImageFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  /** Click handler for the sticky tool (canvas onBackgroundClick branch). */
  createStickyAt: (pos: { x: number; y: number }) => void;
  /** Click handler for the image tool (canvas onBackgroundClick branch). */
  openImagePickerAt: (pos: { x: number; y: number }) => void;
  /**
   * Background-drag handlers for the arrow tool. Caller wires them into Canvas
   * conditionally (only when `tool === 'arrow'`); they're inert otherwise.
   */
  arrowDragHandlers: {
    onStart: (world: { x: number; y: number }) => void;
    onMove: (world: { x: number; y: number }) => void;
    onEnd: (world: { x: number; y: number }) => void;
  };
}

/** Server cap mirrored client-side so we 4xx the user with a friendly toast. */
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
/** Below this distance we ignore the arrow drag as a stray tap. */
const MIN_ARROW_DRAG_PX = 24;

export function useFrameTools({
  board,
  branches,
  setTool,
  pushToast,
}: FrameToolsOptions): FrameToolsApi {
  const arrowDraftRef = useRef<ArrowDraft | null>(null);
  const [arrowDraft, setArrowDraft] = useState<ArrowDraft | null>(null);
  const imageInputRef = useRef<HTMLInputElement>(null!);
  const imagePendingPosRef = useRef<{ x: number; y: number } | null>(null);

  // Sticky / arrow / image all need to land on *some* branch. Prefer the
  // dedicated 'captures' branch (which the server seeds for the demo board);
  // otherwise fall back to whatever the first branch is.
  const ensureCanvasBranch = useCallback((): Branch | null => {
    if (!board) return null;
    const captures = branches.get('captures');
    if (captures) return captures;
    const first = branches.values().next().value as Branch | undefined;
    return first ?? null;
  }, [board, branches]);

  const createStickyAt = useCallback(
    (pos: { x: number; y: number }): void => {
      const branch = ensureCanvasBranch();
      if (!board || !branch) return;
      const W = 220;
      const H = 180;
      void (async () => {
        try {
          const frame = await apiCreateFrame({
            boardId: board.id,
            branchId: branch.id,
            commitSha: branch.headSha,
            commitMessage: 'sticky note',
            kind: 'sticky',
            position: { x: pos.x - W / 2, y: pos.y - H / 2 },
            size: { width: W, height: H },
            content: { kind: 'sticky', body: '', color: 'yellow' },
          });
          boardStore.upsertFrame(frame);
          setTool('select');
        } catch (err) {
          // eslint-disable-next-line no-console
          console.warn('[foldo] sticky create failed', err);
        }
      })();
    },
    [board, ensureCanvasBranch, setTool],
  );

  const createArrowFrame = useCallback(
    async (startX: number, startY: number, endX: number, endY: number): Promise<void> => {
      const branch = ensureCanvasBranch();
      if (!board || !branch) return;
      const minX = Math.min(startX, endX);
      const minY = Math.min(startY, endY);
      const w = Math.max(Math.abs(endX - startX), 40);
      const h = Math.max(Math.abs(endY - startY), 40);
      try {
        const frame = await apiCreateFrame({
          boardId: board.id,
          branchId: branch.id,
          commitSha: branch.headSha,
          commitMessage: 'arrow',
          kind: 'arrow',
          position: { x: minX, y: minY },
          size: { width: w, height: h },
          content: {
            kind: 'arrow',
            from: { x: startX - minX, y: startY - minY },
            to: { x: endX - minX, y: endY - minY },
            color: '#111111',
            thickness: 2.5,
          },
        });
        boardStore.upsertFrame(frame);
        setTool('select');
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn('[foldo] arrow create failed', err);
      }
    },
    [board, ensureCanvasBranch, setTool],
  );

  const createImageFrame = useCallback(
    async (
      pos: { x: number; y: number },
      src: { url: string; previewDataUrl: string },
      name?: string,
    ): Promise<void> => {
      const branch = ensureCanvasBranch();
      if (!board || !branch) return;
      // Resolve natural dimensions before placing so the frame matches the
      // image's aspect ratio. Reads off the previewDataUrl because the
      // uploaded URL isn't in the browser cache yet on first paint.
      const dims = await new Promise<{ w: number; h: number }>((resolve) => {
        const img = new Image();
        img.onload = () =>
          resolve({ w: img.naturalWidth || 480, h: img.naturalHeight || 320 });
        img.onerror = () => resolve({ w: 480, h: 320 });
        img.src = src.previewDataUrl;
      });
      const maxW = 600;
      const scale = dims.w > maxW ? maxW / dims.w : 1;
      const W = Math.round(dims.w * scale);
      const H = Math.round(dims.h * scale);
      try {
        const frame = await apiCreateFrame({
          boardId: board.id,
          branchId: branch.id,
          commitSha: branch.headSha,
          commitMessage: name ? `image: ${name}` : 'image upload',
          kind: 'image',
          position: { x: pos.x - W / 2, y: pos.y - H / 2 },
          size: { width: W, height: H },
          content: { kind: 'image', url: src.url, alt: name },
        });
        boardStore.upsertFrame(frame);
        setTool('select');
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn('[foldo] image create failed', err);
      }
    },
    [board, ensureCanvasBranch, setTool],
  );

  const openImagePickerAt = useCallback((pos: { x: number; y: number }): void => {
    imagePendingPosRef.current = pos;
    imageInputRef.current?.click();
  }, []);

  const onImageFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>): void => {
      const file = e.target.files?.[0];
      e.target.value = '';
      const pos = imagePendingPosRef.current;
      imagePendingPosRef.current = null;
      if (!file || !pos) return;
      if (file.size > MAX_IMAGE_BYTES) {
        pushToast('Image too large (8 MB max).');
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        const previewDataUrl =
          typeof reader.result === 'string' ? reader.result : '';
        if (!previewDataUrl) return;
        void (async () => {
          try {
            const { url } = await apiUploadImage(file);
            await createImageFrame(pos, { url, previewDataUrl }, file.name);
          } catch (err) {
            // eslint-disable-next-line no-console
            console.warn('[foldo] image upload failed', err);
            pushToast('Image upload failed');
          }
        })();
      };
      reader.readAsDataURL(file);
    },
    [createImageFrame, pushToast],
  );

  const arrowDragHandlers = {
    onStart: useCallback((world: { x: number; y: number }): void => {
      arrowDraftRef.current = {
        startX: world.x,
        startY: world.y,
        endX: world.x,
        endY: world.y,
      };
      setArrowDraft(arrowDraftRef.current);
    }, []),
    onMove: useCallback((world: { x: number; y: number }): void => {
      if (!arrowDraftRef.current) return;
      arrowDraftRef.current = {
        ...arrowDraftRef.current,
        endX: world.x,
        endY: world.y,
      };
      setArrowDraft({ ...arrowDraftRef.current });
    }, []),
    onEnd: useCallback(
      (world: { x: number; y: number }): void => {
        const d = arrowDraftRef.current;
        arrowDraftRef.current = null;
        setArrowDraft(null);
        if (!d) return;
        const dist = Math.hypot(world.x - d.startX, world.y - d.startY);
        if (dist < MIN_ARROW_DRAG_PX) return;
        void createArrowFrame(d.startX, d.startY, world.x, world.y);
      },
      [createArrowFrame],
    ),
  };

  return {
    arrowDraft,
    imageInputRef,
    onImageFileChange,
    createStickyAt,
    openImagePickerAt,
    arrowDragHandlers,
  };
}

/**
 * Renders the in-progress arrow as a dashed line while the user drags. Lives
 * inside the Canvas's transformed layer so the line scales with zoom.
 */
export function ArrowDraftPreview({ draft }: { draft: ArrowDraft | null }) {
  if (!draft) return null;
  const minX = Math.min(draft.startX, draft.endX) - 40;
  const minY = Math.min(draft.startY, draft.endY) - 40;
  const w = Math.abs(draft.endX - draft.startX) + 80;
  const h = Math.abs(draft.endY - draft.startY) + 80;
  return (
    <svg
      style={{
        position: 'absolute',
        left: minX,
        top: minY,
        width: w,
        height: h,
        pointerEvents: 'none',
        overflow: 'visible',
      }}
    >
      <line
        x1={draft.startX - minX}
        y1={draft.startY - minY}
        x2={draft.endX - minX}
        y2={draft.endY - minY}
        stroke="#111111"
        strokeWidth={2.5}
        strokeDasharray="6 4"
        strokeLinecap="round"
        opacity={0.6}
      />
    </svg>
  );
}
