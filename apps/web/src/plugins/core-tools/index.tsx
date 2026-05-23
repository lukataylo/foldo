// First core plugin: wraps the existing LeftRail tool buttons as a
// `toolbar` surface contribution so a future "design/extra-tools" plugin
// can add tools alongside the built-ins without touching App.tsx.
//
// LeftRail itself stays where it is for now — it's still mounted from
// App. This plugin's role in Step 9 is to demonstrate the substrate and
// reserve the toolbar surface so Step 10's Layer Navigator can attach a
// `leftPanel` tab against the same registry.

import type { Plugin } from '@foldo/plugin';

/**
 * No tools today — the existing LeftRail component has hardcoded buttons
 * that already work. The plugin exists so the toolbar surface kind
 * resolves to a non-empty list once we collapse LeftRail's buttons into
 * plugin contributions in a fast-follow.
 */
export const coreToolsPlugin: Plugin = {
  manifest: {
    id: 'core/tools',
    name: 'Core canvas tools',
    version: '1.0.0',
    description:
      'The built-in select / hand / comment / edit / sticky / arrow / image tools.',
    surfaces: [{ kind: 'toolbar', tools: [] }],
  },
};
