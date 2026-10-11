import * as RadixDialog from '@radix-ui/react-dialog';
import { json, type LoaderFunctionArgs } from '@remix-run/node';
import { useLoaderData, useRevalidator } from '@remix-run/react';
import { motion } from 'framer-motion';
import { useMemo, useState } from 'react';
import { toast } from 'react-toastify';
import { ProjectThumb } from '~/components/home/ProjectThumb';
import {
  editedAgo,
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

  return json({ ...shell(user), projects });
}

type Project = ProjectSummary & { listed: number };

const SORTS = {
  recent: { label: 'Recently edited', fn: (a: Project, b: Project) => b.updated - a.updated },
  oldest: { label: 'Oldest first', fn: (a: Project, b: Project) => a.updated - b.updated },
  name: { label: 'Name', fn: (a: Project, b: Project) => projectTitle(a).localeCompare(projectTitle(b)) },
};

type SortKey = keyof typeof SORTS;

const FOCUS = 'outline-none focus-visible:shadow-[0_0_0_2px_#FBF8F1,0_0_0_4px_#16140F]';

function EmptyState() {
  return (
    <section
      aria-labelledby="empty-title"
      data-testid="foldo-projects-empty"
      className="flex flex-col items-center justify-center gap-[14px] rounded-[16px] border border-rule bg-sheet px-8 pb-16 pt-14 text-center"
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
  onShare,
  onDelete,
}: {
  p: Project;
  templates: TemplateInfo[];
  onShare: () => void;
  onDelete: () => void;
}) {
  const tag = projectTag(p.template, templates);
  const title = projectTitle(p);

  return (
    <li
      data-testid="foldo-project-card"
      className="group relative flex flex-col overflow-hidden rounded-[12px] border border-rule bg-sheet transition-[border-color,box-shadow] duration-fast hover:border-ink hover:shadow-prompt focus-within:border-ink"
    >
      <ProjectThumb template={p.template} height={176} />
      <a
        href={`/chat/${p.id}`}
        data-testid="foldo-project-open"
        className="flex flex-col gap-2 px-4 pb-4 pt-[14px] text-ink no-underline outline-none after:absolute after:inset-0 after:rounded-[12px] after:content-[''] focus-visible:after:shadow-[inset_0_0_0_2px_#16140F]"
      >
        <span className="truncate font-serif text-[22px] leading-[1.15] decoration-1 underline-offset-[3px] group-hover:underline">
          {title}
        </span>
        <span className="flex flex-wrap items-center gap-2">
          <span className={tag.prompt ? PROMPT_PILL : TAG_PILL}>{tag.label}</span>
          {p.shareId && (
            <span className="pill-live px-[9px]">
              <span className="pill-dot" />
              Shared
            </span>
          )}
          <span className="ml-auto text-[13px] text-pencil">Edited {editedAgo(p.updated)}</span>
        </span>
      </a>
      <div className="absolute right-3 top-3 z-1 flex gap-[6px] opacity-0 transition-opacity duration-fast focus-within:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-100">
        <button
          type="button"
          aria-label={`Share ${title}`}
          data-testid="foldo-project-share"
          onClick={onShare}
          className="btn-secondary btn-sm shadow-[0_1px_0_rgba(22,20,15,.04)]"
        >
          <Icon.Share />
          Share
        </button>
        <button type="button" aria-label={`Delete ${title}`} data-testid="foldo-project-delete" onClick={onDelete} className="btn-danger btn-sm">
          <Icon.Trash />
          Delete
        </button>
      </div>
    </li>
  );
}

function DeleteDialog({ project, onClose, onDeleted }: { project: Project | null; onClose: () => void; onDeleted: () => void }) {
  const [busy, setBusy] = useState(false);

  const remove = async () => {
    if (!project) {
      return;
    }

    setBusy(true);

    try {
      const res = await fetch('/api/projects', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: project.id }),
      });

      if (!res.ok) {
        throw new Error(String(res.status));
      }

      toast.success('Project deleted.');
      onDeleted();
    } catch {
      toast.error("Couldn't delete that project. Check your connection and try again.");
    } finally {
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
        <RadixDialog.Content asChild>
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
                <button type="button" aria-label="Close" className="btn-icon -mr-2 -mt-1 h-[36px] w-[36px]">
                  <Icon.Close size={18} />
                </button>
              </RadixDialog.Close>
            </div>
            <RadixDialog.Description asChild>
              <div className="flex flex-col gap-3 px-6 pb-[22px] pt-3 text-[15px] text-ink2">
                <p className="m-0">You are about to delete</p>
                <div className="flex items-center gap-[10px] rounded-[8px] border border-rule2 bg-codebg px-3 py-[10px] font-mono text-[14px] font-medium text-ink">
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
  const data = useLoaderData() as unknown as ShellData & { projects: Project[]; templates: TemplateInfo[] };
  const { projects, templates } = data;
  const revalidator = useRevalidator();
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<SortKey>('recent');
  const [confirm, setConfirm] = useState<Project | null>(null);
  const [sharing, setSharing] = useState<Project | null>(null);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();

    return projects.filter((p) => !q || projectTitle(p).toLowerCase().includes(q)).sort(SORTS[sort].fn);
  }, [projects, query, sort]);

  const count = `${projects.length} ${projects.length === 1 ? 'project' : 'projects'}`;

  return (
    <PageShell data={data} active="projects">
      <div data-testid="foldo-projects-page" className="flex flex-col gap-7">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div className="flex items-baseline gap-4">
            <h1 className="m-0 font-serif text-[56px] font-normal leading-none tracking-[-.015em] max-sm:text-[44px]">Your projects</h1>
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
                  <ProjectCard key={p.id} p={p} templates={templates} onShare={() => setSharing(p)} onDelete={() => setConfirm(p)} />
                ))}
              </ul>
            )}
          </>
        )}
      </div>

      <DeleteDialog
        project={confirm}
        onClose={() => setConfirm(null)}
        onDeleted={() => {
          setConfirm(null);
          revalidator.revalidate();
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
