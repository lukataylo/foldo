import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { useStore } from '@nanostores/react';
import { toast } from 'react-toastify';
import { chatId, listed, shareId } from '~/lib/persistence';

const item =
  'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-bolt-elements-textSecondary outline-none cursor-pointer data-[highlighted]:bg-bolt-elements-item-backgroundActive data-[highlighted]:text-bolt-elements-textPrimary';

async function setShare(id: string, share: boolean, list?: boolean) {
  const res = await fetch('/api/projects', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, share, listed: list }),
  });

  if (!res.ok) {
    toast.error('Could not update sharing');
    return undefined;
  }

  const data = (await res.json()) as { shareId: string | null; listed: boolean };
  listed.set(data.listed);

  return data.shareId;
}

export function ShareButton() {
  const id = useStore(chatId);
  const sid = useStore(shareId);
  const inGallery = useStore(listed);

  if (!id) {
    return null;
  }

  const copy = async (shareToken: string) => {
    await navigator.clipboard.writeText(`${location.origin}/p/${shareToken}`);
    toast.success('Link copied. Anyone with it can run your project.');
  };

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          data-testid="foldo-canvas-topbar-share"
          className="mr-3 flex items-center gap-1.5 rounded-md border border-bolt-elements-borderColor px-2.5 py-1 text-sm text-bolt-elements-textSecondary outline-none hover:text-bolt-elements-textPrimary"
        >
          <span className="i-ph:share-network" /> {sid ? 'Shared' : 'Share'}
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={8}
          className="z-max w-64 rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-1.5 shadow-xl"
        >
          <div className="px-2 py-1.5 text-xs text-bolt-elements-textTertiary">
            {sid ? 'Public link is on.' : 'Create a public link. Viewers can run it and remix their own copy.'}
          </div>
          <DropdownMenu.Item
            className={item}
            onSelect={async () => {
              const token = sid ?? (await setShare(id, true));

              if (token) {
                shareId.set(token);
                await copy(token);
              }
            }}
          >
            <span className="i-ph:link text-base" /> {sid ? 'Copy link' : 'Create & copy link'}
          </DropdownMenu.Item>
          {sid && (
            <DropdownMenu.Item
              className={item}
              onSelect={async () => {
                if ((await setShare(id, true, !inGallery)) && !inGallery) {
                  toast.success('Listed in the gallery. Other teams can find and like it.');
                }
              }}
            >
              <span className={inGallery ? 'i-ph:check-square text-base' : 'i-ph:square text-base'} /> Show in gallery
            </DropdownMenu.Item>
          )}
          {sid && (
            <DropdownMenu.Item
              className={item}
              onSelect={async () => {
                if ((await setShare(id, false)) === null) {
                  shareId.set(null);
                  toast.success('Sharing turned off. The old link no longer works.');
                }
              }}
            >
              <span className="i-ph:link-break text-base" /> Stop sharing
            </DropdownMenu.Item>
          )}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
