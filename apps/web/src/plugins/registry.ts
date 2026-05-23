// Boot-time wiring of @foldo/plugin into apps/web. Exports the shared
// `registry`, the `usePluginSurfaces(kind)` React hook that layout slots
// consume, and the install/activate sequence called once from main.tsx.

import { useEffect, useState } from 'react';
import {
  type Plugin,
  type PluginContext,
  type PluginSurface,
  registry,
} from '@foldo/plugin';
import { boardStore } from '../state/useBoardStore';

export { registry };
export type { Plugin, PluginSurface };

/**
 * Default plugin context. v1 reaches the canvas's toast helper via a
 * window-level escape hatch (set up by App.tsx); the proper plumbing
 * happens once App's toast queue moves into a plugin itself.
 *
 * The `subscribe` channel lets a plugin observe per-key store slices
 * without importing BoardStore directly. Currently maps to the same
 * Map keys as `BoardSnapshot`; the unsubscribe is a no-op until we
 * grow the surface beyond the LeftRail wrap.
 */
export function defaultContext(): PluginContext {
  return {
    notify(msg: string) {
      const fn = (window as unknown as { __foldoToast?: (m: string) => void })
        .__foldoToast;
      if (fn) fn(msg);
    },
    subscribe<T>(key: string, listener: (value: T) => void): () => void {
      // Best-effort: emit the current value and on every store update.
      const send = (): void => {
        const snap = boardStore.getSnapshot() as unknown as Record<string, T>;
        if (key in snap) listener(snap[key]);
      };
      send();
      return boardStore.subscribe(send);
    },
  };
}

/**
 * React hook returning every contribution of the given surface kind. The
 * registry is install-once / frozen-after-boot, so the underlying array
 * is stable across re-renders — the hook is effectively a memoised getter.
 */
export function usePluginSurfaces<K extends PluginSurface['kind']>(
  kind: K,
): Array<Extract<PluginSurface, { kind: K }>> {
  const [list] = useState(() => registry.surfaces(kind));
  return list;
}

/**
 * Install + activate the given plugins. Called once from main.tsx after
 * the registry module is imported so the surfaces are populated before
 * anything renders.
 */
export function bootPlugins(plugins: Plugin[]): void {
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


// Re-export useEffect so any plugin module that needs it doesn't need a
// duplicate React import. (Kept for backwards-compat across plugin files.)
export { useEffect };
