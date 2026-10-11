import { useStore } from '@nanostores/react';
import { useState } from 'react';
import { SIcon } from '~/components/chat/studio-icons';
import { ShareDialog } from '~/components/share/ShareDialog';
import { chatId, description, listed, shareId } from '~/lib/persistence';

// The header trigger for the share dialog (the dialog itself belongs to components/share)
export function ShareButton({ tone = 'primary' }: { tone?: 'primary' | 'secondary' }) {
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
        type="button"
        data-testid="foldo-canvas-topbar-share"
        data-shared={sid ? 'true' : undefined}
        onClick={() => setOpen(true)}
        className={`${tone === 'primary' ? 'btn-primary' : 'btn-secondary'} btn-sm px-[14px]`}
      >
        <SIcon.Upload size={15} />
        Share
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
