import { useStore } from '@nanostores/react';
import { saveState } from '~/lib/persistence';

const LABEL = { saved: 'Saved', saving: 'Saving…', retrying: 'Reconnecting…', failed: 'Not saved' } as const;

export function SaveStatus() {
  const state = useStore(saveState);

  return (
    <span
      data-testid="foldo-save-status"
      role="status"
      className={`hidden items-center gap-1.5 text-xs sm:flex ${state === 'failed' ? 'text-bolt-elements-icon-error' : 'text-bolt-elements-textTertiary'}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${state === 'saved' ? 'bg-bolt-elements-icon-success' : state === 'failed' ? 'bg-bolt-elements-icon-error' : 'bg-[var(--foldo-yellow)]'}`} />
      {LABEL[state]}
    </span>
  );
}
