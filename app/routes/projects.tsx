import { json, type LoaderFunctionArgs } from '@remix-run/node';
import { useLoaderData, useRevalidator } from '@remix-run/react';
import { useState } from 'react';
import { toast } from 'react-toastify';
import { Logo } from '~/components/brand/Logo';
import { EventBar, type EventInfo } from '~/components/header/EventBar';
import { UserMenu } from '~/components/header/UserMenu';
import { iconFor } from '~/components/landing/starters';
import { Dialog, DialogButton, DialogDescription, DialogRoot, DialogTitle } from '~/components/ui/Dialog';
import { requireUser, shell } from '~/lib/.server/auth';
import { db } from '~/lib/.server/db';
import { timeAgo } from '~/utils/timeAgo';

export const meta = () => [{ title: 'Your projects · Foldo' }];

export async function loader({ request }: LoaderFunctionArgs) {
  const user = await requireUser(request);
  const projects = db
    .prepare(
      'SELECT id, description, share_id IS NOT NULL AS shared, updated FROM projects WHERE user_id = ? ORDER BY updated DESC',
    )
    .all(user.id);

  return json({ ...shell(user), projects });
}

export default function Projects() {
  const { email, name, admin, remaining, projects, event } = useLoaderData() as any as {
    email: string;
    name: string;
    admin: boolean;
    remaining: number;
    event: EventInfo | null;
    projects: { id: string; description: string | null; shared: number; updated: number }[];
  };
  const revalidator = useRevalidator();
  const [confirm, setConfirm] = useState<(typeof projects)[number] | null>(null);

  const remove = async (id: string) => {
    const res = await fetch('/api/projects', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });

    if (!res.ok) {
      return toast.error('Could not delete the project');
    }

    revalidator.revalidate();
  };

  return (
    <div className="h-full overflow-y-auto bg-bolt-elements-background-depth-1 text-bolt-elements-textPrimary">
      <header className="mx-auto flex max-w-[1100px] items-center justify-between px-6 py-5">
        <Logo size={32} />
        <UserMenu email={email} name={name} admin={admin} remaining={remaining} />
      </header>
      <EventBar event={event} />

      <main className="mx-auto max-w-[1100px] px-6 pb-16" data-testid="foldo-projects-page">
        <div className="mb-8 mt-4 flex items-center justify-between">
          <h1 className="text-3xl font-bold">Your projects</h1>
          <a
            href="/"
            className="flex items-center gap-1.5 rounded-lg bg-bolt-elements-button-primary-background px-4 py-2 text-sm font-semibold text-bolt-elements-button-primary-text hover:bg-bolt-elements-button-primary-backgroundHover"
          >
            <span className="i-ph:plus-bold" /> New project
          </a>
        </div>

        {projects.length === 0 ? (
          <div className="flex flex-col items-center rounded-3xl border border-dashed border-bolt-elements-borderColor py-14 text-center">
            <img src="/art/empty-projects.webp" alt="" width={220} className="mb-6 rounded-2xl" />
            <h2 className="text-xl font-semibold">No projects yet</h2>
            <p className="mb-5 mt-1 max-w-sm text-bolt-elements-textSecondary">
              Describe an app and Foldo will build it. Your projects live here so you can pick them up any time.
            </p>
            <a
              href="/"
              className="rounded-lg bg-bolt-elements-button-primary-background px-5 py-2.5 text-sm font-semibold text-bolt-elements-button-primary-text hover:bg-bolt-elements-button-primary-backgroundHover"
            >
              Build your first app
            </a>
          </div>
        ) : (
          <DialogRoot open={confirm !== null}>
            <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {projects.map((p) => (
                <li
                  key={p.id}
                  className="group relative overflow-hidden rounded-2xl border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 transition hover:-translate-y-0.5 hover:border-[var(--foldo-yellow)]"
                >
                  <a href={`/chat/${p.id}`} className="block">
                    <div className="paper-tile flex h-36 items-center justify-center">
                      <img src={`/art/icon-${iconFor(p.id, p.description)}.webp`} alt="" width={96} height={96} loading="lazy" />
                    </div>
                    <div className="p-4">
                      <div className="truncate font-semibold">{p.description || 'Untitled project'}</div>
                      <div className="mt-1 flex items-center gap-2 text-xs text-bolt-elements-textTertiary">
                        <span>Edited {timeAgo(p.updated)}</span>
                        {p.shared ? (
                          <span className="rounded-full bg-bolt-elements-item-backgroundAccent px-2 py-0.5 text-bolt-elements-item-contentAccent">
                            Shared
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </a>
                  <button
                    aria-label={`Delete ${p.description ?? 'project'}`}
                    onClick={() => setConfirm(p)}
                    className="i-ph:trash absolute right-3 top-3 hidden rounded-md bg-black/60 p-3 text-white hover:text-red-400 group-hover:block"
                  />
                </li>
              ))}
            </ul>
            <Dialog onBackdrop={() => setConfirm(null)} onClose={() => setConfirm(null)}>
              <DialogTitle>Delete project?</DialogTitle>
              <DialogDescription asChild>
                <div>
                  <p>
                    You are about to delete <strong>{confirm?.description || 'Untitled project'}</strong>.
                  </p>
                  <p className="mt-1">This also turns off its share link. This can't be undone.</p>
                </div>
              </DialogDescription>
              <div className="flex justify-end gap-2 bg-bolt-elements-background-depth-2 px-5 pb-4">
                <DialogButton type="secondary" onClick={() => setConfirm(null)}>
                  Cancel
                </DialogButton>
                <DialogButton
                  type="danger"
                  onClick={() => {
                    if (confirm) {
                      remove(confirm.id);
                    }

                    setConfirm(null);
                  }}
                >
                  Delete
                </DialogButton>
              </div>
            </Dialog>
          </DialogRoot>
        )}
      </main>
    </div>
  );
}
