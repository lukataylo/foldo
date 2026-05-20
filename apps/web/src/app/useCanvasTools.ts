// Host-handled canvas tools: `arrow` (live drag-preview overlay) and `image`
// (hidden file <input>). The `sticky` tool moved to the standard
// ToolPlugin.onBackgroundClick contract — see plugins/builtin/tools.tsx.

import { useCallback, useRef, useState } from 'react';
import type { Branch } from '@foldo/protocol';
import { boardStore } from '../state/useBoardStore';
import type { BoardSnapshot } from '../state/BoardStore';
import { createFrame as apiCreateFrame } from '../api/frames';
import { uploadImage as apiUploadImage } from '../api/uploads';
import type { Tool } from '../types';

export interface ArrowDraft {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
}

interface UseCanvasToolsArgs {
  snap: BoardSnapshot;
  setTool: (t: Tool) => void;
  toast: (msg: string) => void;
}

export interface UseCanvasToolsResult {
  createArrowFrame: (
    startX: number,
    startY: number,
    endX: number,
    endY: number,
  ) => Promise<void>;
  imageInputRef: React.MutableRefObject<HTMLInputElement | null>;
  openImagePicker: (world: { x: number; y: number }) => void;
  onImageFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  arrowDraft: ArrowDraft | null;
  arrowDraftRef: React.MutableRefObject<ArrowDraft | null>;
  setArrowDraft: (d: ArrowDraft | null) => void;
}

export function useCanvasTools({
  snap,
  setTool,
  toast,
}: UseCanvasToolsArgs): UseCanvasToolsResult {
  const arrowDraftRef = useRef<ArrowDraft | null>(null);
  const [arrowDraft, setArrowDraft] = useState<ArrowDraft | null>(null);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const imagePendingPosRef = useRef<{ x: number; y: number } | null>(null);

  const ensureCanvasBranch = useCallback((): Branch | null => {
    if (!snap.board) return null;
    // Prefer the captures branch; if it doesn't exist, fall back to the first.
    const captures = snap.branches.get('captures');
    if (captures) return captures;
    const first = snap.branches.values().next().value as Branch | undefined;
    return first ?? null;
  }, [snap.board, snap.branches]);

  const createArrowFrame = useCallback(
    async (startX: number, startY: number, endX: number, endY: number) => {
      const board = snap.board;
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
        console.warn('[foldo] arrow create failed', err);
      }
    },
    [snap.board, ensureCanvasBranch, setTool],
  );

  const createImageFrame = useCallback(
    async (
      pos: { x: number; y: number },
      src: { url: string; previewDataUrl: string },
      name?: string,
    ) => {
      const board = snap.board;
      const branch = ensureCanvasBranch();
      if (!board || !branch) return;
      // Resolve natural dimensions before placing, so the frame matches the
      // image's ratio. Use the local data URL because the uploaded URL won't
      // hit the browser cache yet on the very first paint.
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
        console.warn('[foldo] image create failed', err);
      }
    },
    [snap.board, ensureCanvasBranch, setTool],
  );

  const openImagePicker = useCallback((world: { x: number; y: number }) => {
    imagePendingPosRef.current = world;
    imageInputRef.current?.click();
  }, []);

  const onImageFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = '';
      const pos = imagePendingPosRef.current;
      imagePendingPosRef.current = null;
      if (!file || !pos) return;
      // Server's /api/uploads cap is 8 MB; mirror it client-side so we fail
      // fast with a friendly toast instead of a 413.
      if (file.size > 8 * 1024 * 1024) {
        toast('Image too large (8 MB max).');
        return;
      }
      // Read once: we use the data URL purely to measure natural dimensions
      // for the frame's aspect ratio while the upload is in flight.
      const reader = new FileReader();
      reader.onload = async () => {
        const previewDataUrl =
          typeof reader.result === 'string' ? reader.result : '';
        if (!previewDataUrl) return;
        try {
          const { url } = await apiUploadImage(file);
          await createImageFrame(pos, { url, previewDataUrl }, file.name);
        } catch (err) {
          console.warn('[foldo] image upload failed', err);
          toast('Image upload failed');
        }
      };
      reader.readAsDataURL(file);
    },
    [createImageFrame, toast],
  );

  return {
    createArrowFrame,
    imageInputRef,
    openImagePicker,
    onImageFileChange,
    arrowDraft,
    arrowDraftRef,
    setArrowDraft,
  };
}
