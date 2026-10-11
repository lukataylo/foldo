import { useStore } from '@nanostores/react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'react-toastify';
import { Dialog, DialogButton, DialogDescription, DialogFooter, DialogRoot, DialogTitle } from '~/components/ui/Dialog';
import { Icon } from '~/components/ui/icons';
import { chatId, type ChatHistoryItem } from '~/lib/persistence';
import { menuOpen } from '~/lib/stores/ui';
import { classNames } from '~/utils/classNames';
import { logger } from '~/utils/logger';
import { HistoryItem } from './HistoryItem';
import { binDates } from './date-binning';

/*
 * Projects sidebar, opened from the studio header's sidebar button: New project, recent projects by day, All projects.
 * A Sheet panel under the header (Esc or a click outside closes it).
 */
export function Menu() {
  const menuRef = useRef<HTMLDivElement>(null);
  const [list, setList] = useState<ChatHistoryItem[]>([]);
  const open = useStore(menuOpen);
  const current = useStore(chatId);
  const [toDelete, setToDelete] = useState<ChatHistoryItem | null>(null);

  const loadEntries = useCallback(() => {
    fetch('/api/projects')
      .then((res) => (res.ok ? (res.json() as Promise<ChatHistoryItem[]>) : []))
      .then((items) => setList(items.filter((item) => item.description)))
      .catch(() => toast.error("Couldn't load your projects. Check your connection and try again."));
  }, []);

  const deleteItem = (item: ChatHistoryItem) => {
    fetch('/api/projects', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: item.id }),
    })
      .then((res) => {
        if (!res.ok) {
          throw new Error(res.statusText);
        }
      })
      .then(() => {
        loadEntries();

        if (chatId.get() === item.id) {
          // hard page navigation to clear the stores
          window.location.pathname = '/';
        }
      })
      .catch((error) => {
        toast.error("Couldn't delete that project. Try again.");
        logger.error(error);
      });
  };

  useEffect(() => {
    if (open) {
      loadEntries();
    }
  }, [open]);

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    const onDown = (event: PointerEvent) => {
      const target = event.target as HTMLElement;

      // the header toggle handles itself; dialogs portal outside the panel
      if (!menuRef.current?.contains(target) && !target.closest('[aria-label="Toggle sidebar"], [role="dialog"]')) {
        menuOpen.set(false);
      }
    };
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && !toDelete && menuOpen.set(false);

    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);

    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, toDelete]);

  return (
    <div
      ref={menuRef}
      aria-label="Your projects"
      role="navigation"
      aria-hidden={!open}
      className={classNames(
        'side-menu fixed bottom-0 left-0 top-[56px] z-sidebar flex w-[320px] flex-col border-r border-rule bg-sheet text-[14px] shadow-float transition-[transform,opacity,visibility] duration-base',
        open ? 'visible translate-x-0 opacity-100' : 'invisible -translate-x-4 opacity-0',
      )}
    >
      <div className="p-4">
        <a href="/" className="btn-secondary btn-md w-full justify-start">
          <Icon.Plus /> New project
        </a>
      </div>
      <div className="eyebrow px-5 pb-1">Your projects</div>
      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-4">
        {list.length === 0 && (
          <div className="flex flex-col items-center gap-3 px-3 pt-6 text-center text-[13px] text-pencil">
            <img src="/art/empty-projects.webp" alt="Foldo peeking out of an empty folder" className="w-28 rounded-[12px] border border-rule" />
            <p className="m-0">Nothing here yet. Your projects will show up as soon as you build one.</p>
          </div>
        )}
        <DialogRoot open={toDelete !== null} onOpenChange={(value) => !value && setToDelete(null)}>
          {binDates(list).map(({ category, items }) => (
            <div key={category} className="mt-3 first:mt-1">
              <div className="sticky top-0 z-1 bg-sheet px-2 pb-1 pt-2 text-[12px] font-medium text-pencil">{category}</div>
              <ul className="m-0 flex list-none flex-col gap-px p-0">
                {items.map((item) => (
                  <HistoryItem key={item.id} item={item} current={item.id === current} onDelete={() => setToDelete(item)} />
                ))}
              </ul>
            </div>
          ))}
          {toDelete && (
            <Dialog onBackdrop={() => setToDelete(null)} onClose={() => setToDelete(null)}>
              <DialogTitle>Delete project?</DialogTitle>
              <DialogDescription asChild>
                <div>
                  <p className="m-0">
                    You are about to delete <strong className="font-semibold text-ink">{toDelete.description}</strong>.
                  </p>
                  <p className="m-0 mt-1">This also turns off its share link. This can’t be undone.</p>
                </div>
              </DialogDescription>
              <DialogFooter>
                <DialogButton type="secondary" onClick={() => setToDelete(null)}>
                  Cancel
                </DialogButton>
                <DialogButton
                  type="danger"
                  onClick={() => {
                    deleteItem(toDelete);
                    setToDelete(null);
                  }}
                >
                  Delete
                </DialogButton>
              </DialogFooter>
            </Dialog>
          )}
        </DialogRoot>
      </div>
      <div className="flex items-center border-t border-rule2 px-4 py-3">
        <a href="/projects" className="btn-ghost btn-sm -ml-2">
          All projects <Icon.ArrowRight size={14} />
        </a>
      </div>
    </div>
  );
}
