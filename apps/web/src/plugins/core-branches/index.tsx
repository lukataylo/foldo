// Branches panel. Sits alongside Layers + Worktrees in the left panel
// as a tab, surfacing the BoardStore's `branches` Map with the canvas
// context (frame count per branch) plus stubbed PR / ahead-behind
// metadata where the backend hasn't shipped yet.
//
// The data model is intentionally split — `Branch` records come from
// the server, the per-row stubbed metadata (PR number, ahead/behind,
// merged state) is hardcoded today and a future `/api/branches/:id/git`
// endpoint will fill it in.

import type { Plugin } from '@foldo/plugin';
import { BranchesPanel } from './BranchesPanel';

const BranchesIcon = '⎇';

export const coreBranchesPlugin: Plugin = {
  manifest: {
    id: 'core/branches',
    name: 'Branches',
    version: '0.1.0',
    description:
      'Git branches view — checked-out, remote, ahead/behind, PR state. Sibling tab to Layers + Worktrees.',
    surfaces: [
      {
        kind: 'leftPanel',
        tab: {
          id: 'branches',
          label: 'Branches',
          icon: BranchesIcon,
          render: (): JSX.Element => <BranchesPanel />,
        },
      },
    ],
  },
};
