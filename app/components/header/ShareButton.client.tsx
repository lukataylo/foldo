import { useStore } from '@nanostores/react';
import { useState } from 'react';
import { ShareDialog } from '~/components/share/ShareDialog';
import { chatId, description, listed, shareId } from '~/lib/persistence';

export function ShareButton() {
  const id = useStore(chatId);
  const sid = useStore(shareId);
  const inGallery = useStore(listed);
  const title = useStore(description);
  const [open, setOpen] = useState(false);

  if (!id) {
    return null;
  }

  return (
    <>
      <button
        data-testid="foldo-canvas-topbar-share"
        onClick={() => setOpen(true)}
        className={sid ? 'btn-secondary btn-md' : 'btn-primary btn-md'}
      >
        <span className={sid ? 'i-ph:globe-hemisphere-west text-bolt-elements-item-contentAccent' : 'i-ph:share-network-bold'} />
        {sid ? 'Shared' : 'Share'}
      </button>
      <ShareDialog
        open={open}
        onOpenChange={setOpen}
        projectId={id}
        title={title}
        state={{ shareId: sid ?? null, listed: inGallery }}
        onChange={(next) => {
          shareId.set(next.shareId);
          listed.set(next.listed);
        }}
      />
    </>
  );
}
