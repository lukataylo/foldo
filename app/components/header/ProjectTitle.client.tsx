import { useStore } from '@nanostores/react';
import { useRef, useState } from 'react';
import { toast } from 'react-toastify';
import { Icon } from '~/components/ui/icons';
import { chatId, description, lastSaved, saveState, shareId } from '~/lib/persistence';

const MAX = 80;
const FAILED = "Couldn't rename. Try again.";

/*
 * The project name in the studio header, click to rename (owners only). Enter or blur saves, Esc cancels, an empty name
 * reverts. The new name also goes into the description store, so the next autosave keeps it.
 */
export function ProjectTitle({ fallback }: { fallback?: string }) {
  const id = useStore(chatId);
  const title = useStore(description) ?? fallback ?? '';
  const [draft, setDraft] = useState<string | undefined>(undefined);
  const input = useRef<HTMLInputElement>(null);
  const done = useRef(false);

  const start = () => {
    done.current = false;
    setDraft(title);
    requestAnimationFrame(() => input.current?.select());
  };

  const commit = async () => {
    if (done.current || draft === undefined) {
      return;
    }

    done.current = true;

    const next = draft.trim().slice(0, MAX);
    setDraft(undefined);

    if (!next || next === title) {
      return;
    }

    const previous = description.get();
    description.set(next);

    // before the first save there is no project yet: the first save carries the name
    if (!id) {
      return;
    }

    saveState.set('saving');

    try {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        /*
         * share repeats the current state: a server without the rename action treats this POST as a share update, and
         * share: true keeps an existing link (and its gallery listing) exactly as it is instead of revoking it
         */
        body: JSON.stringify({ id, rename: next, share: Boolean(shareId.get()) }),
      });
      const body = res.ok ? ((await res.json()) as { ok?: boolean; description?: string }) : undefined;

      if (!body?.ok) {
        throw new Error(String(res.status));
      }

      if (body.description) {
        description.set(body.description);
      }

      saveState.set('saved');
      lastSaved.set(Date.now());
    } catch {
      description.set(previous);
      saveState.set('saved');
      toast.error(FAILED);
    }
  };

  if (draft !== undefined) {
    return (
      <input
        ref={input}
        aria-label="Project name"
        data-testid="foldo-project-title-input"
        value={draft}
        maxLength={MAX}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            commit();
          } else if (e.key === 'Escape') {
            done.current = true;
            setDraft(undefined);
          }
        }}
        className="m-0 h-[32px] w-[min(360px,40vw)] min-w-0 rounded-[6px] border border-ink bg-sheet px-[6px] font-serif text-[21px] leading-none text-ink outline-none shadow-[0_0_0_3px_rgba(255,194,26,.45)]"
      />
    );
  }

  return (
    <h1 className="m-0 flex min-w-0">
      <button
        type="button"
        title="Rename project"
        aria-label={`${title || 'New project'}, rename`}
        data-testid="foldo-project-title"
        onClick={start}
        className="group inline-flex h-[32px] min-w-0 items-center gap-[6px] rounded-[6px] border-0 bg-transparent px-[6px] -ml-[6px] font-serif text-[21px] font-normal leading-none text-ink outline-none hover:bg-wash focus-visible:shadow-[0_0_0_2px_#16140F]"
      >
        <span className="truncate">{title || 'New project'}</span>
        <Icon.Pencil size={14} className="flex-none text-pencil opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100" />
      </button>
    </h1>
  );
}
