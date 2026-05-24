// First core plugin: contributes the canonical canvas tools (select / hand /
// comment / edit / sticky / arrow / image) as a `toolbar` surface so any
// future "design/extra-tools" plugin can add tools alongside the built-ins
// without touching App.tsx.
//
// Tool selection is owned by App.tsx (lives in React state). Plugins can't
// reach into that state directly, so App registers a window-level setter
// (`window.__foldoSetTool`) on mount; each ToolSpec's `activate()` looks
// it up and calls it. Same escape-hatch pattern as `registerToastHook`.
//
// The bottom-center PluginToolBar slot renders these contributions via the
// registry. The legacy LeftRail also reads from the same registry so its
// vertical pill stays in sync (keeping its existing `foldo-rail-tool-*`
// testids alive for the e2e specs).
//
// /* A+W4 features */ — the plugin now also contributes one `hotkey` surface
// per tool with a `shortcut` letter. This is the source of truth for the
// V/H/C/E/S/A/I tool keybinds; useKeyboardShortcuts.ts iterates the registry
// rather than hardcoding the map. The activate() callback also persists the
// selected tool to localStorage so the canvas restores its tool on reload —
// `getInitialTool()` reads the value at boot.

import type { HotkeySpec, Plugin, PluginSurface, ToolSpec } from '@foldo/plugin';
import type { Tool } from '../../types';

declare global {
  interface Window {
    __foldoSetTool?: (tool: Tool) => void;
  }
}

/** localStorage key for the last-selected tool. Bumped if we ever change shape. */
export const LAST_TOOL_KEY = 'foldo:lastTool';

/** Every tool id the canvas recognises. Mirrors the `Tool` union in types.ts. */
const TOOL_IDS: readonly Tool[] = [
  'select',
  'hand',
  'comment',
  'edit',
  'sticky',
  'arrow',
  'image',
];

function isTool(v: unknown): v is Tool {
  return typeof v === 'string' && (TOOL_IDS as readonly string[]).includes(v);
}

/**
 * Persist the tool selection to localStorage. Wrapped in try/catch because
 * Safari private-mode + some SSR shims throw on `setItem`. A failure here is
 * a soft regression (no restore) but must never crash the activate path.
 */
function persistTool(tool: Tool): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(LAST_TOOL_KEY, tool);
    }
  } catch {
    /* ignore */
  }
}

/**
 * Read the previously-persisted tool from localStorage. Falls back to
 * `'select'` when nothing is persisted, the value is unrecognised, or the
 * read throws (Safari private mode). Called by App.tsx during initial
 * useState() so the canvas reopens on the user's last tool.
 */
export function getInitialTool(): Tool {
  try {
    if (typeof localStorage === 'undefined') return 'select';
    const raw = localStorage.getItem(LAST_TOOL_KEY);
    if (raw && isTool(raw)) return raw;
  } catch {
    /* ignore */
  }
  return 'select';
}

/**
 * Best-effort dispatch into App's tool state via the window escape hatch.
 * Also persists to localStorage so a reload comes back on the same tool —
 * the persistence sits here (rather than in App.tsx's useEffect) so it
 * fires even when the tool is changed via a hotkey or plugin extension.
 */
function setTool(tool: Tool): void {
  persistTool(tool);
  const fn = typeof window !== 'undefined' ? window.__foldoSetTool : undefined;
  if (fn) fn(tool);
}

// ----- Icons (lifted verbatim from the old LeftRail JSX so the visual stays
// identical inside both PluginToolBar and the LeftRail pill). -----

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

// ----- Tool specs. The `id` field matches the canvas `Tool` union so the
// LeftRail can map a spec back to the active-tool state with `tool === t.id`.
// `group` drives the divider hairline in LeftRail; the PluginToolBar ignores
// it for now. Shortcut letters match the bindings in useKeyboardShortcuts
// (this list is documentation, not the source of truth for the keydown
// handler). -----

export const CORE_TOOLS: readonly ToolSpec[] = [
  {
    id: 'select',
    label: 'Select',
    shortcut: 'V',
    group: 'pointer',
    icon: <ArrowIcon />,
    activate: () => setTool('select'),
  },
  {
    id: 'hand',
    label: 'Hand · pan',
    shortcut: 'H',
    group: 'pointer',
    icon: <HandIcon />,
    activate: () => setTool('hand'),
  },
  {
    id: 'comment',
    label: 'Comment',
    shortcut: 'C',
    group: 'review',
    icon: <CommentIcon />,
    activate: () => setTool('comment'),
  },
  {
    id: 'edit',
    label: 'AI edit',
    shortcut: 'E',
    group: 'review',
    icon: <SparkleIcon />,
    activate: () => setTool('edit'),
  },
  {
    id: 'sticky',
    label: 'Sticky note',
    shortcut: 'S',
    group: 'create',
    icon: <StickyIcon />,
    activate: () => setTool('sticky'),
  },
  {
    id: 'arrow',
    label: 'Arrow',
    shortcut: 'A',
    group: 'create',
    icon: <ArrowToolIcon />,
    activate: () => setTool('arrow'),
  },
  {
    id: 'image',
    label: 'Image',
    shortcut: 'I',
    group: 'create',
    icon: <ImageIcon />,
    activate: () => setTool('image'),
  },
];

/**
 * Build a `hotkey` surface for each ToolSpec that declares a `shortcut`.
 * The shortcut letter becomes a canonical lowercase keybind (the registry-
 * reading shortcut hook case-folds the live keydown, so `v` matches both
 * `v` and `V`). Tool hotkeys are uppercased in the cheatsheet category so
 * they sort next to each other.
 */
function toolHotkeys(tools: readonly ToolSpec[]): PluginSurface[] {
  const out: PluginSurface[] = [];
  for (const t of tools) {
    if (!t.shortcut) continue;
    const spec: HotkeySpec = {
      id: `core/tools.${t.id}`,
      keys: [t.shortcut.toLowerCase()],
      label: t.label,
      category: 'tools',
      handler: t.activate,
    };
    out.push({ kind: 'hotkey', spec });
  }
  return out;
}

/**
 * Built-in tools plugin. Contributes:
 *
 *   - one `toolbar` surface with every canvas tool, and
 *   - one `hotkey` surface per tool whose ToolSpec declares a `shortcut`.
 *
 * App.tsx still mounts the legacy LeftRail for the left-edge vertical pill
 * (it reads from the same registry under the hood) and the bottom
 * PluginToolBar shows the same tools horizontally — both views stay in sync
 * because they both pull from this single source. useKeyboardShortcuts.ts
 * iterates the `hotkey` surfaces for tool keybinds (no more hardcoded map).
 */
export const coreToolsPlugin: Plugin = {
  manifest: {
    id: 'core/tools',
    name: 'Core canvas tools',
    version: '1.0.0',
    description:
      'The built-in select / hand / comment / edit / sticky / arrow / image tools.',
    surfaces: [
      { kind: 'toolbar', tools: [...CORE_TOOLS] },
      ...toolHotkeys(CORE_TOOLS),
    ],
  },
};
