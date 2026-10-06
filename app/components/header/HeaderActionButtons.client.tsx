import { useStore } from '@nanostores/react';
import { chatStore } from '~/lib/stores/chat';
import { workbenchStore } from '~/lib/stores/workbench';
import { classNames } from '~/utils/classNames';

// Segmented control: show/hide the chat and the code workbench. At least one stays visible.
export function HeaderActionButtons() {
  const showWorkbench = useStore(workbenchStore.showWorkbench);
  const { showChat } = useStore(chatStore);
  const canHideChat = showWorkbench || !showChat;

  return (
    <div
      role="group"
      aria-label="Panels"
      className="flex h-8 items-center gap-0.5 rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-0.5"
    >
      <Segment
        label="Chat"
        icon="i-ph:chat-circle-text"
        active={showChat}
        disabled={!canHideChat}
        onClick={() => chatStore.setKey('showChat', !showChat)}
      />
      <Segment
        label="Code and preview"
        icon="i-ph:code"
        active={showWorkbench}
        onClick={() => {
          if (showWorkbench && !showChat) {
            chatStore.setKey('showChat', true);
          }

          workbenchStore.showWorkbench.set(!showWorkbench);
        }}
      />
    </div>
  );
}

function Segment({
  label,
  icon,
  active,
  disabled,
  onClick,
}: {
  label: string;
  icon: string;
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      aria-label={label}
      title={label}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={classNames(
        'flex h-7 w-7 items-center justify-center rounded-md text-base outline-none transition-theme focus-visible:ring-2 focus-visible:ring-bolt-elements-borderColorActive disabled:cursor-default',
        active
          ? 'bg-bolt-elements-background-depth-3 text-bolt-elements-textPrimary'
          : 'text-bolt-elements-textTertiary hover:text-bolt-elements-textPrimary',
      )}
    >
      <span className={icon} />
    </button>
  );
}
