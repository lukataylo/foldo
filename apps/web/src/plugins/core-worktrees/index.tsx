// Worktrees panel. Sits alongside Layers + Branches in the left panel
// as a tab. Today it's a visual shell only — the worktree list is
// stubbed because the server doesn't expose `/api/worktrees` yet. The
// shell exists so the design can ship + be reviewed while the backend
// catches up; the same row component will hydrate from real data once
// the endpoint lands.

import type { Plugin } from '@foldo/plugin';
import { WorktreesPanel } from './WorktreesPanel';

const WorktreesIcon = '▣';

export const coreWorktreesPlugin: Plugin = {
  manifest: {
    id: 'core/worktrees',
    name: 'Worktrees',
    version: '0.1.0',
    description:
      'Local git worktree view — which sandbox each agent is in, dirty/clean, switch + open. Stubbed today.',
    surfaces: [
      {
        kind: 'leftPanel',
        tab: {
          id: 'worktrees',
          label: 'Worktrees',
          icon: WorktreesIcon,
          render: (): JSX.Element => <WorktreesPanel />,
        },
      },
    ],
  },
};
