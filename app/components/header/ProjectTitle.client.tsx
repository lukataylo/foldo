import { useStore } from '@nanostores/react';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'react-toastify';
import { SIcon } from '~/components/chat/studio-icons';
import { Icon } from '~/components/ui/icons';
import { chatId, description } from '~/lib/persistence';

const MAX = 80;
const FAILED = "Couldn't rename. Try again.";

/*
 * The project name in the studio header, click to rename (owners only). Enter or blur saves, Esc cancels, an empty name
 * reverts. The new name also goes into the description store, so the next autosave keeps it. A rename has its own
 * pending state: it never touches the autosave status next to it.
 */
export function ProjectTitle({ fallback }: { fallback?: string }) {
  const id = useStore(chatId);
  const title = useStore(description) ?? fallback ?? '';
  const [draft, setDraft] = useState<string | undefined>(undefined);
  const [pending, setPending] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const done = useRef(false);
  const name = title || 'New project';

  useEffect(() => {
    document.title = `${name} · Foldo`;
  }, [name]);

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

    setPending(true);

    try {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, rename: next }),
      });
      const body = res.ok ? ((await res.json()) as { ok?: boolean; description?: string }) : undefined;

      if (!body?.ok) {
        throw new Error(String(res.status));
      }

      if (body.description) {
        description.set(body.description);
      }
    } catch {
      description.set(previous);
      toast.error(FAILED);
    } finally {
      setPending(false);
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

  // the hover chip (Wash + pencil) is drawn outside the layout box, so the save status stays 10px after the name
  return (
    <div className="group relative flex min-w-0 items-center" aria-busy={pending || undefined}>
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -inset-y-[4px] -left-[6px] -right-[26px] z-1 rounded-[6px] bg-wash opacity-0 group-hover:opacity-100 group-focus-within:opacity-100"
      />
      <h1 className="relative z-2 m-0 min-w-0 truncate font-serif text-[21px] font-normal leading-none" data-testid="foldo-project-title">
        {name}
      </h1>
      <span aria-hidden="true" className="pointer-events-none absolute -right-[21px] z-2 text-pencil opacity-0 group-hover:opacity-100 group-focus-within:opacity-100">
        {pending ? <SIcon.Arc size={14} /> : <Icon.Pencil size={14} />}
      </span>
      <button
        type="button"
        aria-label="Rename project"
        title="Rename project"
        data-testid="foldo-project-rename"
        onClick={start}
        className="absolute -inset-y-[4px] -left-[6px] -right-[26px] z-3 cursor-text rounded-[6px] border-0 bg-transparent p-0 outline-none focus-visible:shadow-[0_0_0_2px_#16140F]"
      />
    </div>
  );
}
