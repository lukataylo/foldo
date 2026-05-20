// Public plugin contract for the Foldo canvas.
//
// Plugins extend the canvas in three orthogonal ways:
//
//   1. Frame kinds — a new on-canvas object type (e.g. "html", "table").
//      `registerFrameKind` mounts a renderer when the board hydrates a frame
//      with a matching `kind` field.
//   2. Tools — a new entry in the LeftRail (e.g. "design", "shape"), with
//      optional canvas-background click + drag handlers.
//   3. Side panels — docked panels (e.g. the Layers list, an inspector) that
//      live alongside the canvas and can react to selection / hover.
//
// Plugins NEVER reach into the host's React tree. They consume canvas state
// through the hooks re-exported below; the host wires those hooks to its own
// state container at boot. This is the contract that keeps a plugin portable
// across hosts (web, future native, embed-in-PR-comment, etc.).

import type {
  Branch,
  Board,
  Comment,
  Frame,
  FrameId,
  TestSessionIssue,
} from '@foldo/protocol';
import type { ComponentType, HTMLAttributes, ReactNode } from 'react';

// ----- Frame kind plugin -----

/** Props handed to a frame kind renderer. Frame instance + branch metadata.
 *
 * `wrapperProps` carries host-supplied attributes (currently `data-frame-id`
 * + `data-frame-kind` for tests, and locked-state inline styles). Plugins
 * MUST spread it onto the outermost rendered element so the canvas can pick
 * frames out reliably and so locked frames render as visually inert.
 */
export interface FrameRenderProps {
  frame: Frame;
  branch: Branch;
  wrapperProps?: HTMLAttributes<HTMLDivElement>;
}

/** Optional inspector pane shown in the right rail while this frame is selected. */
export interface FrameKindInspector {
  /** Title shown in the inspector header. */
  title?: string;
  Component: ComponentType<FrameRenderProps>;
}

export interface FrameKindPlugin {
  /** Frame.kind value this plugin claims. Must be unique across plugins. */
  kind: string;
  /** Human label for the layers panel and other UI surfaces. */
  label: string;
  /** Renders the frame body. The host wraps this in position/size/transform. */
  Render: ComponentType<FrameRenderProps>;
  /** Short label for the layers list. Defaults to commitMessage / kind. */
  layerLabel?: (frame: Frame) => string;
  /** Optional thumbnail / glyph component for layer rows. */
  LayerIcon?: ComponentType<{ frame: Frame; size?: number }>;
  /** Default size used when something creates a frame of this kind. */
  defaultSize?: { width: number; height: number };
  /** Default content shape when the host needs to seed a new frame. */
  defaultContent?: () => Frame['content'];
  /** Inspector pane mounted when a frame of this kind is selected. */
  Inspector?: FrameKindInspector;
  /**
   * If true, the host treats this frame's body as scrollable on touch (sets
   * `data-canvas-scroll` on the wrapper). Defaults to false.
   */
  isScrollable?: boolean;
}

// ----- Tool plugin -----

/** World coordinates (canvas space, pre-zoom). */
export interface WorldPoint {
  x: number;
  y: number;
}

/** Background-drag lifecycle handlers — same shape as Canvas onBackgroundDrag*. */
export interface ToolDragHandlers {
  onStart?: (world: WorldPoint) => void;
  onMove?: (world: WorldPoint) => void;
  onEnd?: (world: WorldPoint) => void;
}

export interface ToolPlugin {
  /** Stable id (e.g. "select", "comment", "design"). */
  id: string;
  /** Display label, used as tooltip and aria-label. */
  label: string;
  /** Single-character or short string shortcut (case-insensitive). */
  shortcut?: string;
  /** Icon shown in the LeftRail. */
  Icon: ComponentType<{ size?: number }>;
  /** Ordering hint within the rail. Built-ins start at 0; later plugins use 100+. */
  order?: number;
  /** Group separator. Tools with the same group are kept adjacent. */
  group?: 'navigation' | 'comment' | 'create' | 'design' | 'custom';
  /** Cursor css when this tool is active. Defaults to crosshair for create-style. */
  cursor?: 'default' | 'crosshair' | 'grab' | 'pointer' | 'text';
  /** Called when the user clicks the canvas background with this tool active. */
  onBackgroundClick?: (world: WorldPoint, ctx: ToolContext) => void;
  /** Drag lifecycle on the canvas background with this tool active. */
  drag?: ToolDragHandlers;
  /**
   * Whether this tool should suppress the host's default click-deselect on
   * background clicks. Defaults to false (host deselects on bg click).
   */
  preventDeselectOnBackground?: boolean;
}

/** Read-only context passed to tool handlers so they don't need a million props. */
export interface ToolContext {
  board: Board | null;
  /** Active branch when one is implied (created-via-canvas frames). */
  activeBranch: () => Branch | null;
  /** Switch the active tool (e.g. drop back to "select" after creating). */
  setTool: (id: string) => void;
  /** Imperative API for adding a frame the plugin built locally. */
  upsertFrame: (frame: Frame) => void;
  /** Fire-and-forget toast. */
  toast: (msg: string) => void;
}

// ----- Side-panel plugin -----

export type SidePanelSlot = 'left' | 'right';

export interface SidePanelPlugin {
  id: string;
  slot: SidePanelSlot;
  /** Display label (used as the collapsed-rail tooltip). */
  label: string;
  /** Icon for the collapsed-rail launcher. */
  Icon?: ComponentType<{ size?: number }>;
  /** Initial open/collapsed state. Persisted by id in localStorage. */
  defaultOpen?: boolean;
  /** Body rendered when the panel is open. */
  Component: ComponentType;
  /** Default width when open (CSS px). Resizable later. */
  defaultWidth?: number;
}

// ----- Aggregate plugin descriptor -----

/**
 * A plugin module's default export. The host calls `register()` once at boot;
 * the plugin uses the registry to add as many frame kinds / tools / panels
 * as it wants.
 */
export interface FoldoPlugin {
  id: string;
  register: (api: PluginRegistry) => void;
}

export interface PluginRegistry {
  registerFrameKind: (p: FrameKindPlugin) => void;
  registerTool: (p: ToolPlugin) => void;
  registerSidePanel: (p: SidePanelPlugin) => void;
}

// ----- Hooks consumed by plugin renderers -----
//
// These are TYPE-ONLY declarations here. The host implements them in its
// `plugins/runtime.tsx` and exposes them via a React context. Plugins
// import the runtime module (see `@foldo/plugin-api/runtime` peer entry)
// to get the live hooks. Keeping them type-only here means this package
// has no React runtime dependency.

export interface PluginRuntime {
  useZoom: () => number;
  useTool: () => string;
  useFrameComments: (frameId: FrameId) => Comment[];
  useIsInViewport: (frameId: FrameId) => boolean;
  useBoard: () => Board | null;
  useActions: () => PluginActions;
  useSelectedElement: () => SelectedElement | null;
  useSelectedFrameId: () => FrameId | null;
}

export interface SelectedElement {
  frameId: FrameId;
  label: string;
  file: string;
  line: number;
  currentSource: string;
  /** Pixel coords on the frame for the highlight overlay. */
  rect: { x: number; y: number; width: number; height: number };
}

export interface PluginActions {
  dropPin: (frameId: FrameId, xRel: number, yRel: number) => void;
  openComment: (frameId: FrameId, comment: Comment) => void;
  selectElement: (selection: SelectedElement | null) => void;
  selectMarkdownLine: (
    frameId: FrameId,
    sectionId: string,
    lineIndex: number,
    label: string,
  ) => void;
  /** Drop a comment on a test_session frame from a synthesized issue. */
  makeEditFromIssue: (frame: Frame, issue: TestSessionIssue) => void;
  /** Top-level frame selection (distinct from per-element selection for AI edit). */
  selectFrame: (frameId: FrameId | null) => void;
}

// ----- Re-exports for ergonomics -----
export type { Frame, Branch, Board, Comment } from '@foldo/protocol';
export type { ReactNode };
