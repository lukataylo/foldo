import * as RadixDialog from '@radix-ui/react-dialog';
import { json, type LoaderFunctionArgs } from '@remix-run/node';
import { useLoaderData, useRevalidator, useSearchParams } from '@remix-run/react';
import { motion } from 'framer-motion';
import { useMemo, useRef, useState } from 'react';
import { toast } from 'react-toastify';
import { ProjectThumb } from '~/components/home/ProjectThumb';
import {
  editedAgo,
  foldText,
  projectTag,
  projectTitle,
  PROMPT_PILL,
  TAG_PILL,
  type ProjectSummary,
  type TemplateInfo,
} from '~/components/home/projects';
import { PageShell, type ShellData } from '~/components/PageShell';
import { ShareDialog } from '~/components/share/ShareDialog';
import { dialogBackdropVariants, dialogVariants } from '~/components/ui/Dialog';
import { Icon } from '~/components/ui/icons';
import { requireUser, shell } from '~/lib/.server/auth';
import { db } from '~/lib/.server/db';

export const meta = () => [{ title: 'Your projects · Foldo' }];

export async function loader({ request }: LoaderFunctionArgs) {
  const user = await requireUser(request);
  const projects = db
    .prepare(
      'SELECT id, description, share_id AS shareId, listed, template, updated FROM projects WHERE user_id = ? ORDER BY updated DESC',
    )
    .all(user.id);

  return json({ ...shell(user), projects, now: Date.now() });
}


type Project = ProjectSummary & { listed: number };

const SORTS = {
  recent: { label: 'Recently edited', fn: (a: Project, b: Project) => b.updated - a.updated },
  oldest: { label: 'Oldest first', fn: (a: Project, b: Project) => a.updated - b.updated },
  name: { label: 'Name', fn: (a: Project, b: Project) => projectTitle(a).localeCompare(projectTitle(b)) },
};

type SortKey = keyof typeof SORTS;

const isSort = (v: string | null): v is SortKey => v !== null && v in SORTS;

// card actions: 34 high, radius 8 (Projects board)
const ACTION = 'btn-sm rounded-[8px]';

function EmptyState() {
  return (
    <section
      aria-labelledby="empty-title"
      data-testid="foldo-projects-empty"
      className="flex flex-1 flex-col items-center justify-center gap-[14px] rounded-[16px] border border-rule bg-sheet px-8 pb-10 pt-8 text-center"
    >
      <img
        src="/art/empty-projects.webp"
        alt="Foldo the paper dachshund peeking out of an empty folder"
        width={1024}
        height={1024}
        className="block h-[272px] w-[272px] rounded-[16px] border border-rule object-cover"
      />
      <h2 id="empty-title" className="m-0 mt-2 font-serif text-[40px] font-normal leading-[1.05]">
        No projects <span className="marker">yet</span>
      </h2>
      <p className="m-0 max-w-[320px] text-[16px] text-ink2 [text-wrap:balance]">
        Describe an idea or pick a starter. It saves here as you build.
      </p>
      <a href="/" className="btn-primary btn-lg mt-2">
        Start building <Icon.ArrowRight />
      </a>
    </section>
  );
}

function ProjectCard({
  p,
  templates,
  now,
  onShare,
  onDelete,
  onRename,
}: {
  p: Project;
  templates: TemplateInfo[];
  now: number;
  onShare: () => void;
  onDelete: (trigger: HTMLButtonElement) => void;
  onRename: (name: string) => void;
}) {
  const tag = projectTag(p.template, templates);
  const title = projectTitle(p);
  const [editing, setEditing] = useState(false);
  const renameButton = useRef<HTMLButtonElement>(null);
  const done = useRef(false);

  // Enter or blur saves, Esc cancels; keyboard endings give focus back to the Rename button
  const finish = (value: string | null, refocus: boolean) => {
    if (done.current) {
      return;
    }

    done.current = true;
    setEditing(false);

    const name = value?.trim();

    if (name && name !== title) {
      onRename(name);
    }

    if (refocus) {
      requestAnimationFrame(() => renameButton.current?.focus());
    }
  };

  return (
    <li
      data-testid="foldo-project-card"
      data-project-id={p.id}
      className="group relative flex flex-col overflow-hidden rounded-[12px] border border-rule bg-sheet transition-[border-color,box-shadow] duration-fast hover:border-ink hover:shadow-[0_18px_40px_-28px_rgba(22,20,15,.35)] focus-within:border-ink"
    >
      <ProjectThumb template={p.template} height={176} />
      <div className="flex flex-col gap-2 px-4 pb-4 pt-[14px]">
        {editing ? (
          <input
            autoFocus
            aria-label={`Rename ${title}`}
            defaultValue={title}
            maxLength={80}
            data-testid="foldo-project-rename-input"
            onFocus={(e) => e.currentTarget.select()}
            onBlur={(e) => finish(e.currentTarget.value, false)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                finish(e.currentTarget.value, true);
              } else if (e.key === 'Escape') {
                e.preventDefault();
                finish(null, true);
              }
            }}
            className="relative z-2 -mx-[5px] -my-[3px] min-w-0 rounded-[6px] border border-ink bg-sheet px-1 py-[2px] font-serif text-[22px] leading-[1.15] text-ink shadow-[0_0_0_3px_rgba(255,194,26,.45)] outline-none"
          />
        ) : (
          <a
            href={`/chat/${p.id}`}
            data-testid="foldo-project-open"
            className="truncate font-serif text-[22px] leading-[1.15] text-ink no-underline decoration-1 underline-offset-[3px] outline-none after:absolute after:inset-0 after:rounded-[12px] after:content-[''] group-hover:underline focus-visible:after:shadow-[inset_0_0_0_2px_#16140F]"
          >
            {title}
          </a>
        )}
        <span className="flex flex-wrap items-center gap-2">
          <span className={tag.prompt ? PROMPT_PILL : TAG_PILL}>{tag.label}</span>
          {p.shareId && (
            <span className="pill-live px-[9px]">
              <span className="pill-dot" />
              Shared
            </span>
          )}
          <span className="ml-auto text-[13px] text-pencil">Edited {editedAgo(p.updated, now)}</span>
        </span>
      </div>
      <div className="absolute right-3 top-3 z-1 flex gap-[6px] opacity-0 transition-opacity duration-fast focus-within:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-100">
        <button
          ref={renameButton}
          type="button"
          aria-label={`Rename ${title}`}
          data-testid="foldo-project-rename"
          onClick={() => {
            done.current = false;
            setEditing(true);
          }}
          className={`btn-secondary ${ACTION} shadow-[0_1px_0_rgba(22,20,15,.04)]`}
        >
          <Icon.Pencil />
          Rename
        </button>
        <button
          type="button"
          aria-label={`Share ${title}`}
          data-testid="foldo-project-share"
          onClick={onShare}
          className={`btn-secondary ${ACTION} shadow-[0_1px_0_rgba(22,20,15,.04)]`}
        >
          <Icon.Share />
          Share
        </button>
        <button
          type="button"
          aria-label={`Delete ${title}`}
          data-testid="foldo-project-delete"
          onClick={(e) => onDelete(e.currentTarget)}
          className={`btn-danger ${ACTION}`}
        >
          <Icon.Trash />
          Delete
        </button>
      </div>
    </li>
  );
}

function DeleteDialog({
  project,
  onClose,
  onDeleted,
  onCloseFocus,
}: {
  project: Project | null;
  onClose: () => void;
  onDeleted: (id: string) => void;
  onCloseFocus: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);

  const remove = async () => {
    if (!project || inFlight.current) {
      return;
    }

    inFlight.current = true;
    setBusy(true);

    try {
      const res = await fetch('/api/projects', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: project.id }),
      });

      // 404: already gone (another tab, or a repeat request): the same outcome for the team
      if (res.ok || res.status === 404) {
        toast.success('Project deleted.');
        onDeleted(project.id);
      } else {
        toast.error('Something went wrong on our side. Try again in a moment.');
      }
    } catch {
      toast.error("Couldn't delete that project. Check your connection and try again.");
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  return (
    <RadixDialog.Root open={project !== null} onOpenChange={(open) => !open && !busy && onClose()}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay asChild>
          <motion.div
            className="fixed inset-0 z-max bg-[rgba(22,20,15,.42)]"
            initial="closed"
            animate="open"
            exit="closed"
            variants={dialogBackdropVariants}
          />
        </RadixDialog.Overlay>
        <RadixDialog.Content
          asChild
          onCloseAutoFocus={(e) => {
            e.preventDefault();
            onCloseFocus();
          }}
        >
          <motion.div
            data-testid="foldo-delete-dialog"
            className="fixed left-[50%] top-[50%] z-max max-h-[90vh] w-[calc(100vw-32px)] max-w-[460px] overflow-y-auto rounded-[16px] border border-rule bg-sheet text-ink shadow-float focus:outline-none"
            initial="closed"
            animate="open"
            exit="closed"
            variants={dialogVariants}
          >
            <img
              src="/art/delete-wide.webp"
              alt="Foldo holding a paper sheet over a white bin, pausing before letting go"
              width={1380}
              height={600}
              className="block aspect-[23/10] h-auto w-full border-b border-rule"
            />
            <div className="flex items-start justify-between gap-4 px-6 pt-[22px]">
              <RadixDialog.Title className="m-0 font-serif text-[30px] font-normal leading-[1.1]">Delete project?</RadixDialog.Title>
              <RadixDialog.Close asChild>
                <button type="button" aria-label="Close" className="btn-icon -mr-2 -mt-1 h-[36px] w-[36px] rounded-[8px]">
                  <Icon.Close size={18} />
                </button>
              </RadixDialog.Close>
            </div>
            <RadixDialog.Description asChild>
              <div className="flex flex-col gap-3 px-6 pb-[22px] pt-3 text-[15px] text-ink2">
                <p className="m-0">You are about to delete</p>
                <div className="flex items-center gap-[10px] rounded-[8px] border border-rule2 bg-codebg px-3 py-[10px] font-mono text-[14px] font-medium leading-[normal] text-ink">
                  <Icon.Folder />
                  <span className="min-w-0 truncate">{project ? projectTitle(project) : ''}</span>
                </div>
                <p className="m-0 [text-wrap:pretty]">This also turns off its share link. This can't be undone.</p>
              </div>
            </RadixDialog.Description>
            <div className="flex justify-end gap-[10px] border-t border-rule2 px-6 py-4">
              <RadixDialog.Close asChild>
                <button type="button" className="btn-secondary btn-lg" disabled={busy}>
                  Cancel
                </button>
              </RadixDialog.Close>
              <button
                type="button"
                data-testid="foldo-delete-confirm"
                className="btn-destructive btn-lg"
                disabled={busy}
                aria-busy={busy || undefined}
                onClick={remove}
              >
                {busy ? <Icon.Spinner /> : <Icon.Trash size={18} />}
                {busy ? 'Deleting' : 'Delete project'}
              </button>
            </div>
          </motion.div>
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}

export default function Projects() {
  const data = useLoaderData() as unknown as ShellData & { projects: Project[]; templates: TemplateInfo[]; now: number };
  const { templates, now } = data;
  const revalidator = useRevalidator();
  const [params, setParams] = useSearchParams();
  const sortParam = params.get('sort');
  const sort: SortKey = isSort(sortParam) ? sortParam : 'recent';
  const [query, setQuery] = useState('');
  const [confirm, setConfirm] = useState<Project | null>(null);
  const [sharing, setSharing] = useState<Project | null>(null);

  // optimistic edits until the loader catches up: renamed titles, deleted cards
  const [names, setNames] = useState<Record<string, string>>({});
  const [removed, setRemoved] = useState<Set<string>>(new Set());
  const projects = useMemo(
    () => data.projects.filter((p) => !removed.has(p.id)).map((p) => (names[p.id] ? { ...p, description: names[p.id] } : p)),
    [data.projects, removed, names],
  );

  // where focus goes when the delete dialog closes: back to the card's Delete button, or (after deleting) the next card
  const deleteTrigger = useRef<HTMLButtonElement | null>(null);
  const focusAfterDelete = useRef<string | null | undefined>(undefined);
  const heading = useRef<HTMLHeadingElement>(null);

  const shown = useMemo(() => {
    const q = foldText(query.trim());

    return projects.filter((p) => !q || foldText(projectTitle(p)).includes(q)).sort(SORTS[sort].fn);
  }, [projects, query, sort]);

  const setSort = (next: SortKey) =>
    setParams(
      (prev) => {
        const p = new URLSearchParams(prev);

        if (next === 'recent') {
          p.delete('sort');
        } else {
          p.set('sort', next);
        }

        return p;
      },
      { replace: true, preventScrollReset: true },
    );

  const rename = async (p: Project, name: string) => {
    const before = names[p.id];
    setNames((n) => ({ ...n, [p.id]: name }));

    try {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: p.id, rename: name }),
      });

      if (!res.ok) {
        throw new Error(String(res.status));
      }

      const { description } = (await res.json()) as { description: string };
      setNames((n) => ({ ...n, [p.id]: description }));
      revalidator.revalidate();
    } catch {
      setNames((n) => {
        const next = { ...n };

        if (before) {
          next[p.id] = before;
        } else {
          delete next[p.id];
        }

        return next;
      });
      toast.error("Couldn't rename. Try again.");
    }
  };

  const count = `${projects.length} ${projects.length === 1 ? 'project' : 'projects'}`;

  return (
    <PageShell data={data} active="projects">
      {/* fills the viewport under the header so the empty state can centre itself (36 bar + 65 header + 48/72 padding) */}
      <div data-testid="foldo-projects-page" className="flex min-h-[calc(100vh-221px)] flex-col gap-7">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div className="flex items-baseline gap-4">
            <h1
              ref={heading}
              tabIndex={-1}
              className="m-0 font-serif text-[56px] font-normal leading-none tracking-[-.015em] outline-none max-sm:text-[44px]"
            >
              Your projects
            </h1>
            <span className="eyebrow font-medium" data-testid="foldo-projects-count">
              {count}
            </span>
          </div>
          {projects.length > 0 && (
            <a href="/" className="btn-primary btn-lg">
              <Icon.Plus size={18} />
              New project
            </a>
          )}
        </div>

        {projects.length === 0 ? (
          <EmptyState />
        ) : (
          <>
            <div role="search" className="flex flex-wrap items-center gap-3 border-t border-rule pt-5">
              <label htmlFor="proj-search" className="sr-only">
                Search projects
              </label>
              <div className="relative min-w-[240px] max-w-[420px] flex-1">
                <Icon.Search size={18} className="pointer-events-none absolute left-[14px] top-[14px] text-pencil" />
                <input
                  id="proj-search"
                  type="search"
                  placeholder="Search projects"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  className="input pl-[42px]"
                />
              </div>
              <div className="relative inline-flex h-[46px] items-center gap-2 rounded-[8px] border border-field bg-sheet px-[14px] text-[14px] font-medium text-ink focus-within:border-ink focus-within:shadow-[0_0_0_3px_rgba(255,194,26,.45)]">
                <span className="font-normal text-pencil">Sort</span>
                {SORTS[sort].label}
                <Icon.ChevronDown />
                <select
                  aria-label="Sort by"
                  value={sort}
                  onChange={(e) => setSort(e.target.value as SortKey)}
                  className="absolute inset-0 cursor-pointer opacity-0"
                >
                  {Object.entries(SORTS).map(([k, s]) => (
                    <option key={k} value={k}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </div>
              <span className="ml-auto text-[13px] text-pencil">
                Saved as you build. Shared projects keep working for anyone with the link.
              </span>
            </div>

            {shown.length === 0 ? (
              <p className="m-0 py-12 text-center text-[15px] text-ink2" role="status">
                No projects match “{query.trim()}”.{' '}
                <button type="button" className="btn-ghost inline p-0 text-[15px] underline" onClick={() => setQuery('')}>
                  Clear search
                </button>
              </p>
            ) : (
              <ul className="m-0 grid list-none gap-6 p-0 [grid-template-columns:repeat(auto-fit,minmax(min(340px,100%),1fr))]">
                {shown.map((p) => (
                  <ProjectCard
                    key={p.id}
                    p={p}
                    templates={templates}
                    now={now}
                    onShare={() => setSharing(p)}
                    onRename={(name) => rename(p, name)}
                    onDelete={(trigger) => {
                      deleteTrigger.current = trigger;
                      focusAfterDelete.current = undefined;
                      setConfirm(p);
                    }}
                  />
                ))}
              </ul>
            )}
          </>
        )}
      </div>

      <DeleteDialog
        project={confirm}
        onClose={() => setConfirm(null)}
        onDeleted={(id) => {
          const i = shown.findIndex((p) => p.id === id);
          focusAfterDelete.current = (shown[i + 1] ?? shown[i - 1])?.id ?? null;
          setRemoved((r) => new Set(r).add(id));
          setConfirm(null);
          revalidator.revalidate();
        }}
        onCloseFocus={() => {
          const next = focusAfterDelete.current;

          requestAnimationFrame(() => {
            if (next === undefined) {
              deleteTrigger.current?.focus();
            } else if (next) {
              document.querySelector<HTMLElement>(`[data-project-id="${next}"] [data-testid=foldo-project-open]`)?.focus();
            } else {
              heading.current?.focus();
            }
          });
        }}
      />

      {sharing && (
        <ShareDialog
          open
          onOpenChange={(open) => !open && setSharing(null)}
          projectId={sharing.id}
          title={sharing.description ?? undefined}
          state={{ shareId: sharing.shareId, listed: Boolean(sharing.listed) }}
          onChange={(next) => {
            // functional: a reply landing after the dialog was closed must not reopen it
            setSharing((cur) => (cur?.id === sharing.id ? { ...cur, shareId: next.shareId, listed: next.listed ? 1 : 0 } : cur));
            revalidator.revalidate();
          }}
        />
      )}
    </PageShell>
  );
}
