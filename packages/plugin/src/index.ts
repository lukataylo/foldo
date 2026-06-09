// @foldo/plugin — substrate for in-tree, trusted plugins that contribute UI
// + behaviour to the canvas. v1 is intentionally non-sandboxed (locked
// decision in docs/ROADMAP-AAA.md): every plugin runs with full app
// privileges. The marketplace / iframe-sandbox flavour is explicitly out of
// scope until we need it.
//
// Shape:
//
//   const manifest: PluginManifest = {
//     id: 'core/layers',
//     name: 'Layer Navigator',
//     version: '1.0.0',
//     surfaces: [{ kind: 'leftPanel', tab: { id: 'layers', label: 'Layers',
//       icon: <LayersIcon/>, render: () => <LayerNavigator/> }}],
//   };
//   export const plugin: Plugin = { manifest, activate(ctx) { … } };
//
// App.tsx imports the registry; each layout slot pulls its contributions
// via the matching `usePluginSurfaces(kind)` hook.

import type { ReactNode } from 'react';

// ---------- Manifest ----------

/** Stable string id; convention: `<scope>/<name>` (core/comments, design/panel, …). */
export type PluginId = string;

export interface PluginManifest {
  id: PluginId;
  name: string;
  version: string;
  /** Concrete UI / behaviour contributions. See `PluginSurface` below. */
  surfaces: PluginSurface[];
  /** Reserved for sandboxed plugins later. v1 ignores this field. */
  permissions?: string[];
  /** One-liner shown in any future "Plugins" UI. */
  description?: string;
}

// ---------- Surfaces ----------

/** A click-target on a toolbar. Replaces the hardcoded LeftRail tool list. */
export interface ToolSpec {
  id: string;
  label: string;
  icon: ReactNode;
  /** Keyboard shortcut letter; the shortcuts plugin reads this. */
  shortcut?: string;
  /** Optional grouping for visual divider. */
  group?: string;
  /** Called when the user picks this tool. */
  activate: () => void;
}

/** A tab inside a side panel. */
export interface PanelTab {
  id: string;
  label: string;
  icon: ReactNode;
  /** Renders the panel body. Receives the host's plugin context. */
  render: () => ReactNode;
  /** Optional badge (count, status dot, …). */
  badge?: ReactNode;
}

/** A right-rail item in the top bar (presence avatars, share button, …). */
export interface TopBarItem {
  id: string;
  render: () => ReactNode;
}

/** A row in a frame's right-click / hover context menu. */
export interface FrameContextMenuItem {
  id: string;
  label: string;
  /** Only show on these frame kinds; omit = always. */
  frameKinds?: string[];
  onClick: (frameId: string) => void;
}

/** A handler for a WS message type. Plugins use this to extend the protocol. */
export interface WsHandlerSpec {
  /** ServerMessage `type` to listen on. */
  type: string;
  handler: (msg: unknown) => void;
}

/**
 * A keyboard-shortcut contribution. The shortcuts plugin (apps/web's
 * useKeyboardShortcuts hook) iterates every `hotkey` surface and installs a
 * single window-level keydown listener that dispatches to the matching handler.
 *
 * Format for `keys` entries: a single canonical string per binding. Plain
 * letters/numbers are case-insensitive (`'v'` matches both `v` and `V`).
 * Modifiers prefix the key with `Meta+`, `Ctrl+`, `Alt+`, or `Shift+` and
 * stack with `+` (e.g. `'Meta+k'`, `'Meta+Shift+P'`). Named keys mirror
 * KeyboardEvent.key (`'Escape'`, `'Enter'`, `'='`, `'-'`, `'0'`).
 *
 * Multiple bindings are allowed per hotkey — useful when an action wants both
 * `Meta+k` and `Ctrl+k` to fire (the cross-platform palette pattern).
 */
export interface HotkeySpec {
  id: string;
  /** One or more canonical key bindings. See doc-comment for format. */
  keys: string[];
  /** Invoked when the matching keydown fires outside an input/textarea. */
  handler: () => void;
  /** Human-readable label for a future "Keyboard shortcuts" cheatsheet. */
  label?: string;
  /** Grouping for the cheatsheet UI ('tools', 'view', 'navigation', …). */
  category?: string;
}

export type PluginSurface =
  | { kind: 'toolbar'; tools: ToolSpec[] }
  | { kind: 'leftPanel'; tab: PanelTab }
  | { kind: 'rightPanel'; tab: PanelTab }
  | { kind: 'topBarRight'; item: TopBarItem }
  | { kind: 'frameContextMenu'; items: FrameContextMenuItem[] }
  | { kind: 'wsHandler'; spec: WsHandlerSpec }
  | { kind: 'hotkey'; spec: HotkeySpec };

// ---------- Plugin lifecycle ----------

export interface Plugin {
  manifest: PluginManifest;
  /**
   * Called once at app boot, after the registry has installed the plugin.
   * Return an optional teardown the registry will call on deactivation
   * (today only used by tests — there's no runtime hot-unload).
   */
  activate?: (ctx: PluginContext) => void | (() => void);
}

/**
 * The plugin's runtime handle on the host app. v1 is deliberately tiny —
 * just the slots a plugin needs to fetch shared state, send messages, and
 * surface a toast. The full surface (store selectors, WS send, dispatch
 * create) lives behind these typed entry points so plugins don't reach into
 * the canvas's internal store directly.
 */
export interface PluginContext {
  /** Show an ephemeral toast in the canvas. */
  notify: (msg: string) => void;
  /**
   * Subscribe to a key on the host's shared state. Returns the latest value
   * + an unsubscribe. The host wires this to the BoardStore in apps/web.
   */
  subscribe: <T>(key: string, listener: (value: T) => void) => () => void;
}

// ---------- Registry ----------

/**
 * In-tree registry of installed plugins. The plugin list is static at boot
 * (`plugins/index.ts` in apps/web exports the array); the registry just
 * indexes contributions by surface kind so each layout slot can pull its
 * own list cheaply.
 *
 * v1 is a frozen-after-boot registry — no runtime install/uninstall. The
 * sandboxed marketplace flavour will add that.
 */
export class PluginRegistry {
  private readonly plugins: Plugin[] = [];

  install(plugin: Plugin): void {
    // Idempotent by manifest id: a second bootPlugins(...) (dev HMR
    // re-evaluating apps/web while this module instance survives) must not
    // double every surface contribution.
    if (this.plugins.some((p) => p.manifest.id === plugin.manifest.id)) return;
    this.plugins.push(plugin);
  }

  installAll(plugins: Plugin[]): void {
    for (const p of plugins) this.install(p);
  }

  /** Activate every installed plugin. Idempotent on re-call (does nothing). */
  activate(ctx: PluginContext): void {
    if (this.activated) return;
    this.activated = true;
    for (const p of this.plugins) {
      try {
        const teardown = p.activate?.(ctx);
        if (teardown) this.teardowns.push(teardown);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error(`[plugin:${p.manifest.id}] activate threw`, err);
      }
    }
  }

  /** Run any teardowns. Used by tests. */
  deactivate(): void {
    for (const t of this.teardowns) {
      try {
        t();
      } catch {
        /* ignore */
      }
    }
    this.teardowns.length = 0;
    this.activated = false;
  }

  /** Every installed plugin (frozen view). */
  list(): readonly Plugin[] {
    return this.plugins;
  }

  /** Contributions of a given surface kind, in install order. */
  surfaces<K extends PluginSurface['kind']>(
    kind: K,
  ): Array<Extract<PluginSurface, { kind: K }>> {
    const out: Array<Extract<PluginSurface, { kind: K }>> = [];
    for (const p of this.plugins) {
      for (const s of p.manifest.surfaces) {
        if (s.kind === kind) {
          out.push(s as Extract<PluginSurface, { kind: K }>);
        }
      }
    }
    return out;
  }

  private activated = false;
  private readonly teardowns: Array<() => void> = [];
}

/** Default registry. Apps/web installs the core plugins into this at boot. */
export const registry = new PluginRegistry();
