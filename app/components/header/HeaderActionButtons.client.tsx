import { useRef, type KeyboardEvent } from 'react';
import { SIcon } from '~/components/chat/studio-icons';
import { setLayout, useLayout, type LayoutMode } from '~/components/chat/studio-state';
import { Icon } from '~/components/ui/icons';
import { workbenchStore } from '~/lib/stores/workbench';

const OPTIONS: { mode: LayoutMode; label: string; icon: JSX.Element }[] = [
  { mode: 'chat', label: 'Chat only', icon: <Icon.Chat /> },
  { mode: 'both', label: 'Chat and workspace', icon: <SIcon.ChatAndWorkspace /> },
  { mode: 'workspace', label: 'Workspace only', icon: <Icon.Code /> },
];

// Layout (SPEC "Layout toggle"): a single-select radiogroup, exactly one segment selected, arrow keys move the choice
export function HeaderActionButtons() {
  const current = useLayout();
  const refs = useRef<Array<HTMLButtonElement | null>>([]);

  const onKeyDown = (event: KeyboardEvent, index: number) => {
    const step = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 0;

    if (!step) {
      return;
    }

    event.preventDefault();

    const next = (index + step + OPTIONS.length) % OPTIONS.length;

    setLayout(OPTIONS[next].mode);
    refs.current[next]?.focus();
  };

  return (
    <div role="radiogroup" aria-label="Layout" className="seg lt-md:hidden" data-testid="foldo-layout">
      {OPTIONS.map((o, i) => (
        <button
          key={o.mode}
          ref={(el) => (refs.current[i] = el)}
          type="button"
          role="radio"
          aria-checked={current === o.mode}
          aria-label={o.label}
          title={o.label}
          tabIndex={current === o.mode ? 0 : -1}
          className="seg-icon"
          onClick={() => setLayout(o.mode)}
          onKeyDown={(e) => onKeyDown(e, i)}
        >
          {o.icon}
        </button>
      ))}
    </div>
  );
}

// phones (below md): the studio shows one panel at a time, so a two-way Chat / Preview switch takes Layout's place
export function PhoneViewSwitch() {
  const current = useLayout();
  const preview = current === 'workspace';

  return (
    <div role="radiogroup" aria-label="Show" className="seg md:hidden" data-testid="foldo-phone-view">
      <button type="button" role="radio" aria-checked={!preview} className="seg-item" onClick={() => setLayout('both')}>
        Chat
      </button>
      <button
        type="button"
        role="radio"
        aria-checked={preview}
        className="seg-item"
        onClick={() => {
          workbenchStore.currentView.set('preview');
          setLayout('workspace');
        }}
      >
        Preview
      </button>
    </div>
  );
}
