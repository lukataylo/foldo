import { useStore } from '@nanostores/react';
import { useLoaderData } from '@remix-run/react';
import { useEffect, useRef, useState } from 'react';
import { SIcon } from '~/components/chat/studio-icons';
import { clock, useOnline } from '~/components/chat/studio-state';
import { Icon } from '~/components/ui/icons';
import { lastSaved, projectGone, saveState } from '~/lib/persistence';

// kept so the browser holds the popover's picture in its cache before the line drops
let offlineArt: HTMLImageElement | undefined;

/*
 * Next to the project name: "Saved" / "Saving…", or a Reconnecting pill while offline or a save is retrying. The pill
 * opens the "Listening for the line" popover (Offline board); it opens on its own the first time the line drops.
 */
export function SaveStatus() {
  const state = useStore(saveState);
  const isOnline = useOnline();
  const { updated } = useLoaderData() as { updated?: number };
  const saved = useStore(lastSaved) ?? updated;
  const [open, setOpen] = useState(false);
  const shownOnce = useRef(false);
  const wrap = useRef<HTMLSpanElement>(null);
  const gone = useStore(projectGone);
  const trouble = !isOnline || state === 'retrying' || state === 'failed';
  const [announce, setAnnounce] = useState('');
  const previous = useRef(state);

  // screen readers hear the outcome of a save (and a failure), not every "Saving…"
  useEffect(() => {
    if (state === 'saved' && previous.current !== 'saved') {
      setAnnounce('Saved');
    } else if (state === 'failed' && previous.current !== 'failed') {
      setAnnounce('Not saved');
    }

    previous.current = state;
  }, [state]);

  useEffect(() => {
    if (trouble && !shownOnce.current && !gone) {
      shownOnce.current = true;
      setOpen(true);
    }

    if (!trouble) {
      setOpen(false);
      shownOnce.current = false;
    }
  }, [trouble]);

  useEffect(() => {
    if (!offlineArt) {
      offlineArt = new Image();
      offlineArt.src = '/art/offline.webp';
    }
  }, []);

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    const onDown = (event: PointerEvent) => {
      if (!wrap.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && setOpen(false);

    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);

    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const live = (
    <span role="status" className="sr-only">
      {announce}
    </span>
  );

  if (!trouble) {
    return (
      <span data-testid="foldo-save-status" className="inline-flex flex-none items-center gap-1 whitespace-nowrap text-[12px] text-pencil">
        {state === 'saving' ? <SIcon.Arc /> : <Icon.Check size={14} strokeWidth={1.5} />}
        {state === 'saving' ? 'Saving…' : 'Saved'}
        {live}
      </span>
    );
  }

  return (
    <span ref={wrap} className="relative flex-none">
      <button
        type="button"
        data-testid="foldo-save-status"
        aria-expanded={open}
        aria-controls={open ? 'foldo-save-pop' : undefined}
        onClick={() => setOpen(!open)}
        className="inline-flex h-[24px] items-center gap-[5px] whitespace-nowrap rounded-full leading-[18px] border border-warning-border bg-warning-bg px-[9px] text-[12px] font-medium text-warning"
      >
        <SIcon.Arc size={13} />
        {state === 'failed' && isOnline ? 'Not saved' : 'Reconnecting…'}
      </button>
      {live}
      {open && (
        <div
          id="foldo-save-pop"
          role="dialog"
          aria-label="Connection status"
          className="absolute left-1/2 top-[calc(100%+23px)] z-max flex w-[360px] -translate-x-[231px] items-center gap-[14px] rounded-[12px] border border-rule bg-sheet p-[14px] shadow-float"
        >
          <span
            aria-hidden="true"
            className="absolute left-[236px] top-[-7px] h-[12px] w-[12px] rotate-45 border-l border-t border-rule bg-sheet"
          />
          <img
            src="/art/offline.webp"
            alt="Foldo holding a cup-and-string phone to its ear, listening"
            width={120}
            height={120}
            className="block h-[120px] w-[120px] flex-none rounded-[12px] border border-rule object-cover"
          />
          <div className="flex min-w-0 flex-1 flex-col gap-[6px]">
            <span className="font-serif text-[21px] leading-[1.1]">Listening for the line</span>
            <span className="text-[13px] text-ink2">Your last change is on screen. We’ll save it the moment the connection is back.</span>
            {saved && <span className="font-mono text-[12px] text-pencil">Last saved {clock(saved)}</span>}
          </div>
        </div>
      )}
    </span>
  );
}
