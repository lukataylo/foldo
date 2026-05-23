// core/dom-editor — contributes a `rightPanel` tab labelled "Inspect".
//
// Ships the v1 Figma-style DOM editor: pick an element on a live
// AppFrame preview, tweak padding/margin/typography/fill/border/
// shadow with live CSS overlays. Saving back to source is a v2
// pipeline (placeholder button only — see DomEditor.tsx).

import type { Plugin } from '@foldo/plugin';
import { DomEditor } from './DomEditor';

// A tiny inline icon — kept here to avoid pulling in an icon dep
// for a one-glyph contribution. Matches the visual weight of the
// other panel-tab glyphs.
function InspectIcon(): JSX.Element {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden
    >
      <path
        d="M2 2h5v1.4H3.4V7H2V2zm12 0v5h-1.4V3.4H9V2h5zM2 9h1.4v3.6H7V14H2V9zm10.6 0H14v5H9v-1.4h3.6V9z"
        fill="currentColor"
      />
      <circle cx="8" cy="8" r="1.4" fill="currentColor" />
    </svg>
  );
}

export const domEditorPlugin: Plugin = {
  manifest: {
    id: 'core/dom-editor',
    name: 'DOM Editor',
    version: '1.0.0',
    description:
      'Figma-style controls for editing the live preview: padding, margin, typography, fill, border, shadow.',
    surfaces: [
      {
        kind: 'rightPanel',
        tab: {
          id: 'inspect',
          label: 'Inspect',
          icon: <InspectIcon />,
          render: () => <DomEditor />,
        },
      },
    ],
  },
};
