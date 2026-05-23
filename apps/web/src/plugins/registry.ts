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

// Re-export useEffect so any plugin module that needs it doesn't need a
// duplicate React import. (Kept for backwards-compat across plugin files.)
export { useEffect };
