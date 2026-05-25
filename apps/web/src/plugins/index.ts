// Static list of every plugin shipped with apps/web. Boot order matters
// only when two plugins contribute to the same surface — earlier entries
// render first. Add new in-tree plugins here.
//
// Two lists, one decision:
//
//   - BUILTIN_PLUGINS: always loaded. A plugin is "builtin" once its
//     happy-path UX is shipped and the substrate gaps (if any) are
//     "missing feature" rather than "broken UX". core/tools, core/layers,
//     and core/dom-editor are all here today — they each have wave-4
//     follow-ups (keyboard nav, bulk ops, "save to source") but every
//     button the user can press already does something sensible.
//
//   - EXPERIMENTAL_PLUGINS: loaded only when the build was produced with
//     `VITE_FOLDO_EXPERIMENTAL_PLUGINS=1` (see main.tsx for the wiring).
//     This is the home for half-built plugins that wave-4+ introduces —
//     e.g. core/keyboard, core/history — so they can land + ship in CI
//     without being on the default canvas until they're ready. Move a
//     plugin from EXPERIMENTAL → BUILTIN once it passes the same "no
//     broken UX" bar that core-tools/layers/dom-editor already passed.
//
// See CLAUDE.md "Plugin substrate" for the gating pattern and the
// per-plugin readiness criteria.

import type { Plugin } from '@foldo/plugin';
import { coreToolsPlugin } from './core-tools/index';
import { coreLayersPlugin } from './core-layers/index';
import { coreBranchesPlugin } from './core-branches/index';
import { coreWorktreesPlugin } from './core-worktrees/index';
import { domEditorPlugin } from './core-dom-editor/index';

// Order within BUILTIN_PLUGINS = tab order in the side panels. Layers
// stays first (it's where users start), then Branches + Worktrees as
// siblings of the same "where work lives" mental model.
export const BUILTIN_PLUGINS: Plugin[] = [
  coreToolsPlugin,
  coreLayersPlugin,
  coreBranchesPlugin,
  coreWorktreesPlugin,
  domEditorPlugin,
];

/**
 * Plugins gated behind `VITE_FOLDO_EXPERIMENTAL_PLUGINS=1`. Empty today;
 * wave-4 will add core/keyboard, core/history, and friends here as they
 * land. The gate exists so we can merge + CI half-built plugins without
 * regressing the default canvas.
 */
export const EXPERIMENTAL_PLUGINS: Plugin[] = [];
