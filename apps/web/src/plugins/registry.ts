// Boot-time wiring of @foldo/plugin into apps/web. Exports the shared
// `registry`, the `usePluginSurfaces(kind)` React hook that layout slots
// consume, and the install/activate sequence called once from main.tsx.

import { useEffect, useState } from 'react';
import {
  type HotkeySpec,
  type Plugin,
  type PluginContext,
  type PluginSurface,
  registry,
} from '@foldo/plugin';
import { boardStore, type BoardSnapshot } from '../state/BoardStore';

export { registry };
export type { HotkeySpec, Plugin, PluginSurface };

/**
 * Module-level cache of hotkey contributions. Populated lazily on first
 * access (after `bootPlugins()` has run) and frozen for the lifetime of the
 * page — the registry is install-once. useKeyboardShortcuts reads this so
 * it can compute its dependency-stable handler list at hook mount without
 * paying the surface() filter cost on every keystroke.
 */
let hotkeyCache: HotkeySpec[] | null = null;
function readHotkeyCache(): HotkeySpec[] {
  if (hotkeyCache) return hotkeyCache;
  hotkeyCache = registry.surfaces('hotkey').map((s) => s.spec);
  return hotkeyCache;
}

/**
 * Live list of every plugin-contributed hotkey. Used by
 * useKeyboardShortcuts to dispatch a keydown to the right handler.
 * Returns a frozen-after-boot snapshot — mutating the array won't
 * surface back into the registry.
 */
export function getHotkeys(): readonly HotkeySpec[] {
  return readHotkeyCache();
}

/**
 * Test-only: clear the cached hotkey list so a fresh install/activate
 * cycle takes effect. Production code never calls this — the registry is
 * frozen after boot.
 */
export function __resetHotkeyCacheForTests(): void {
  hotkeyCache = null;
}

/**
 * Module-level accessor for the canvas's currently-active tool. App.tsx
 * pipes its tool state through `registerCurrentToolAccessor(...)` on every
 * render; the plugin layer (and any future plugin that needs to read the
 * tool without importing App.tsx) calls `getCurrentTool()`.
 *
 * Reads return `null` when App hasn't mounted yet (e.g. SSR / a unit test
 * that imports the registry without rendering the app); callers should
 * treat that as "no tool yet" rather than a default.
 */
let currentToolAccessor: (() => string | null) | null = null;
export function registerCurrentToolAccessor(
  fn: (() => string | null) | null,
): void {
  currentToolAccessor = fn;
}
export function getCurrentTool(): string | null {
  return currentToolAccessor ? currentToolAccessor() : null;
}

/**
 * Default plugin context. v1 reaches the canvas's toast helper via a
 * window-level escape hatch (set up by App.tsx); the proper plumbing
 * happens once App's toast queue moves into a plugin itself.
 *
 * The `subscribe` channel lets a plugin observe per-key store slices
 * without importing BoardStore directly. The listener is only invoked
 * when `snap[key]` reference-changes from the previous snapshot — i.e.
 * a `cursor.move` patch (touching `presence`) won't notify a layer
 * navigator that subscribed to `frames`. Equality is `Object.is`, so
 * Maps swapped by `BoardStore.patch` are correctly detected as changed.
 */
export function defaultContext(): PluginContext {
  return {
    notify(msg: string) {
      const fn = (window as unknown as { __foldoToast?: (m: string) => void })
        .__foldoToast;
      if (fn) fn(msg);
    },
    subscribe<T>(key: string, listener: (value: T) => void): () => void {
      const read = (): T | undefined => {
        const snap = boardStore.getSnapshot() as unknown as Record<string, T>;
        return key in snap ? snap[key] : undefined;
      };
      // Seed: emit the current value once so the listener doesn't need
      // its own initial-read path.
      let last = read();
      if (last !== undefined) listener(last);
      return boardStore.subscribe(() => {
        const next = read();
        if (next === undefined) return;
        if (Object.is(next, last)) return;
        last = next;
        listener(next);
      });
    },
  };
}

/**
 * Module-level cache for surface lookups. The plugin registry is frozen
 * after boot (install-once, activate-once) so `registry.surfaces(kind)`
 * returns the same logical list forever — caching avoids the per-render
 * filter+allocation across every consumer of `usePluginSurfaces`.
 *
 * Cleared by `__resetPluginSurfaceCache` (test-only) when a unit test
 * mutates the registry between cases.
 */
const surfaceCache = new Map<string, PluginSurface[]>();

/** Test-only escape hatch — production code never calls this. */
export function __resetPluginSurfaceCache(): void {
  surfaceCache.clear();
}

/**
 * React hook returning every contribution of the given surface kind. The
 * registry is install-once / frozen-after-boot, so the underlying array
 * is stable across re-renders. We memoise the list module-level so that
 * a render of N panels doesn't pay N filter passes over the plugin list.
 */
export function usePluginSurfaces<K extends PluginSurface['kind']>(
  kind: K,
): Array<Extract<PluginSurface, { kind: K }>> {
  let cached = surfaceCache.get(kind);
  if (!cached) {
    cached = registry.surfaces(kind) as PluginSurface[];
    surfaceCache.set(kind, cached);
  }
  // useState seed runs once per consumer; the reference is the cached
  // array, so two panels listening to the same kind share one allocation.
  const [list] = useState(() => cached as Array<Extract<PluginSurface, { kind: K }>>);
  return list;
}

/**
 * Install + activate the given plugins. Called once from main.tsx after
 * the registry module is imported so the surfaces are populated before
 * anything renders.
 */
export function bootPlugins(plugins: Plugin[]): void {
  // Reset the surface cache so a hot-reload during dev (which re-imports
  // this module) doesn't serve a stale array.
  surfaceCache.clear();
  registry.installAll(plugins);
  registry.activate(defaultContext());
}

// Expose the toast hook so the plugin context can find it.
export function registerToastHook(fn: (msg: string) => void): void {
  (window as unknown as { __foldoToast?: (m: string) => void }).__foldoToast = fn;
}

/**
 * Expose the current setTool callback to the plugin layer. The core/tools
 * plugin's ToolSpec.activate() reads `window.__foldoSetTool` and calls it,
 * mirroring the toast escape hatch above. App.tsx registers this on mount
 * (the underlying setter is stable React state, so re-registering is cheap).
 *
 * Imported here as `unknown` rather than `Tool` to keep registry.ts free of
 * canvas-only types — the plugin file owns the global declaration.
 */
export function registerSetToolHook(fn: (tool: string) => void): void {
  (window as unknown as { __foldoSetTool?: (t: string) => void }).__foldoSetTool =
    fn;
}

/**
 * Plugins (Layer Navigator and friends) need a way to drive the canvas's
 * selection + pan-to-frame without importing App.tsx's setState. App.tsx
 * registers this hook on mount; the Layer Navigator (and any future panel
 * with a "click row → reveal on canvas" affordance) calls
 * `window.__foldoSelectFrame(frameId)`. Same pattern as registerToastHook,
 * deliberately kept window-level so the v1 PluginContext stays tiny.
 */
export function registerSelectFrameHook(fn: (frameId: string) => void): void {
  (window as unknown as { __foldoSelectFrame?: (id: string) => void }).__foldoSelectFrame =
    fn;
}

/** Read the currently-registered select-frame hook, or null if App hasn't mounted. */
export function getSelectFrameHook(): ((frameId: string) => void) | null {
  return (
    (window as unknown as { __foldoSelectFrame?: (id: string) => void })
      .__foldoSelectFrame ?? null
  );
}

/* A+W1 features — layer-nav action hooks. The Layer Navigator's toolbar
   buttons (Delete/Rename/Reorder) call these window-level escape hatches
   when they need to mutate frames. The hook implementations live in
   App.tsx and route to the REST API + optimistic BoardStore writes. */

export interface LayerActionHooks {
  delete?: (frameId: string) => Promise<void> | void;
  rename?: (frameId: string, newName: string) => Promise<void> | void;
  reorder?: (frameId: string, newIndex: number) => Promise<void> | void;
}

export function registerLayerActionHooks(hooks: LayerActionHooks): void {
  const w = window as unknown as {
    __foldoDeleteFrame?: LayerActionHooks['delete'];
    __foldoRenameFrame?: LayerActionHooks['rename'];
    __foldoReorderFrame?: LayerActionHooks['reorder'];
  };
  if (hooks.delete) w.__foldoDeleteFrame = hooks.delete;
  if (hooks.rename) w.__foldoRenameFrame = hooks.rename;
  if (hooks.reorder) w.__foldoReorderFrame = hooks.reorder;
}

// Re-export so callers that need the type don't reach into BoardStore.ts.
export type { BoardSnapshot };

// Re-export useEffect so any plugin module that needs it doesn't need a
// duplicate React import. (Kept for backwards-compat across plugin files.)
export { useEffect };
