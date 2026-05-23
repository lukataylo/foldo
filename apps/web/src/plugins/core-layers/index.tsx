// Step 10's headline plugin: a left-rail "Layers" panel that renders the
// board's branches → frames → comments tree and pans the canvas when a
// row is clicked. First real consumer of the leftPanel surface.
//
// The plugin is intentionally thin — every interesting bit lives inside
// the LayerNavigator React component; the manifest just registers the tab.

import type { Plugin } from '@foldo/plugin';
import { LayerNavigator } from './LayerNavigator';

// Plain-text icon so this module stays dep-free; LeftPanel renders it as a
// span next to the tab label.
const LayersIcon = '▥';

export const coreLayersPlugin: Plugin = {
  manifest: {
    id: 'core/layers',
    name: 'Layer Navigator',
    version: '1.0.0',
    description:
      'Three-level tree of branches → frames → comments. Click a row to focus + pan the canvas.',
    surfaces: [
      {
        kind: 'leftPanel',
        tab: {
          id: 'layers',
          label: 'Layers',
          icon: LayersIcon,
          render: (): JSX.Element => <LayerNavigator />,
        },
      },
    ],
  },
};
