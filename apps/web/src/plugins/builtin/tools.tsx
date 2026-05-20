// Built-in tool descriptors. Keeps the LeftRail's contents driven by the
// registry so plugins can extend the rail.
//
// Canvas-side behavior: tools that only need to create a frame on click
// (`sticky`) express it through the standard `ToolPlugin.onBackgroundClick`
// contract — identical to a third-party plugin tool. Two built-ins stay
// host-handled (in `useCanvasInteractions`) by design, because they need
// host-rendered UI the stateless tool contract can't express:
//   • `arrow` — a live drag-preview overlay rendered on the canvas;
//   • `image` — a hidden <input type=file> element the host must mount.
// `select` / `hand` / `comment` / `edit` are interaction modes with no
// create-on-click behavior.

import type { CreateFrameRequest, Frame } from '@foldo/protocol';
import type { ToolPlugin } from '@foldo/plugin-api';
import { createFrame as apiCreateFrame } from '../../api/frames';

function ArrowIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
      <path d="M3.5 2.5l9 4.5-3.8 1.2-1.5 4z" fill="currentColor" />
    </svg>
  );
}
function HandIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
      <path
        d="M5.5 8V3.8a1 1 0 0 1 2 0V7M7.5 7V3a1 1 0 0 1 2 0v4M9.5 7V4a1 1 0 0 1 2 0v5M11.5 7.2a1 1 0 0 1 2 0v3.3c0 2.2-1.8 4-4 4H8c-1.5 0-2.8-.8-3.5-2L3 9.5a1 1 0 0 1 1.6-1.2L5.5 9"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}
function CommentIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
      <path
        d="M3 4.5A1.5 1.5 0 0 1 4.5 3h7A1.5 1.5 0 0 1 13 4.5v5A1.5 1.5 0 0 1 11.5 11H7l-3 2.5V11H4.5A1.5 1.5 0 0 1 3 9.5z"
        stroke="currentColor"
        strokeWidth="1.3"
        fill="none"
      />
    </svg>
  );
}
function SparkleIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
      <path d="M8 2.5l1 3 3 1-3 1-1 3-1-3-3-1 3-1z" fill="currentColor" />
      <path
        d="M12.5 9.5l.6 1.4 1.4.6-1.4.6-.6 1.4-.6-1.4-1.4-.6 1.4-.6z"
        fill="currentColor"
      />
    </svg>
  );
}
function StickyIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.3"
      strokeLinejoin="round"
    >
      <path d="M3 3.5h7.5l2.5 2.5v6.5a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1z" />
      <path d="M10.5 3.5V6h2.5" />
    </svg>
  );
}
function ArrowToolIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 13 13 3" />
      <path d="M8 3h5v5" />
    </svg>
  );
}
function ImageIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.3"
      strokeLinejoin="round"
    >
      <rect x="2" y="2.5" width="12" height="11" rx="1.4" />
      <circle cx="6" cy="7" r="1.2" fill="currentColor" stroke="none" />
      <path d="m2.5 12 3.5-3.5 3 3 2.5-2.5L14 11.5" />
    </svg>
  );
}

export const builtinTools: ToolPlugin[] = [
  {
    id: 'select',
    label: 'Select (V)',
    shortcut: 'V',
    Icon: ArrowIcon,
    order: 10,
    group: 'navigation',
  },
  {
    id: 'hand',
    label: 'Hand · pan (H)',
    shortcut: 'H',
    Icon: HandIcon,
    order: 20,
    group: 'navigation',
    cursor: 'grab',
  },
  {
    id: 'comment',
    label: 'Comment (C)',
    shortcut: 'C',
    Icon: CommentIcon,
    order: 30,
    group: 'comment',
    cursor: 'crosshair',
    preventDeselectOnBackground: true,
  },
  {
    id: 'edit',
    label: 'AI edit (E)',
    shortcut: 'E',
    Icon: SparkleIcon,
    order: 40,
    group: 'comment',
  },
  {
    id: 'sticky',
    label: 'Sticky note (S)',
    shortcut: 'S',
    Icon: StickyIcon,
    order: 50,
    group: 'create',
    cursor: 'crosshair',
    onBackgroundClick: async (world, ctx) => {
      const board = ctx.board;
      const branch = ctx.activeBranch();
      if (!board || !branch) return;
      const W = 220;
      const H = 180;
      try {
        const body: CreateFrameRequest = {
          boardId: board.id,
          branchId: branch.id,
          commitSha: branch.headSha,
          commitMessage: 'sticky note',
          kind: 'sticky',
          position: { x: world.x - W / 2, y: world.y - H / 2 },
          size: { width: W, height: H },
          content: { kind: 'sticky', body: '', color: 'yellow' },
        };
        const frame: Frame = await apiCreateFrame(body);
        ctx.upsertFrame(frame);
        ctx.setTool('select');
      } catch (err) {
        console.warn('[foldo] sticky create failed', err);
        ctx.toast('Failed to add sticky');
      }
    },
  },
  {
    id: 'arrow',
    label: 'Arrow (A)',
    shortcut: 'A',
    Icon: ArrowToolIcon,
    order: 60,
    group: 'create',
    cursor: 'crosshair',
  },
  {
    id: 'image',
    label: 'Image (I)',
    shortcut: 'I',
    Icon: ImageIcon,
    order: 70,
    group: 'create',
    cursor: 'crosshair',
  },
];
