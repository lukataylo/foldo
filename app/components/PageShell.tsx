import type { ReactNode } from 'react';
import { Logo } from '~/components/brand/Logo';
import { EventBar, type EventInfo } from '~/components/header/EventBar';
import { UserMenu } from '~/components/header/UserMenu';
import { classNames } from '~/utils/classNames';

export interface ShellData {
  email?: string;
  name?: string;
  admin?: boolean;
  remaining?: number;
  event?: EventInfo | null;
}

const NAV = [
  { id: 'projects', href: '/projects', label: 'Projects', auth: true },
  { id: 'gallery', href: '/gallery', label: 'Gallery', auth: false },
] as const;

// Common frame for every page outside the studio: event strip, one header, consistent gutters.
export function PageShell({
  data,
  active,
  narrow,
  children,
}: {
  data: ShellData;
  active?: 'projects' | 'gallery' | 'admin' | 'settings';
  narrow?: boolean;
  children: ReactNode;
}) {
  const width = narrow ? 'max-w-[720px]' : 'max-w-[1100px]';

  return (
    <div className="h-full overflow-y-auto bg-bolt-elements-background-depth-1 text-bolt-elements-textPrimary">
      <EventBar event={data.event} />
      <header className={classNames('mx-auto flex h-16 w-full items-center gap-6 px-6', width)}>
        <Logo size={32} />
        <nav className="flex flex-1 items-center gap-1" aria-label="Main">
          {[...NAV, ...(data.admin ? [{ id: 'admin', href: '/admin', label: 'Admin', auth: true } as const] : [])]
            .filter((n) => data.email || !n.auth)
            .map((n) => (
            <a
              key={n.id}
              href={n.href}
              aria-current={active === n.id ? 'page' : undefined}
              className={classNames(
                'btn btn-md',
                active === n.id
                  ? 'bg-bolt-elements-item-backgroundActive text-bolt-elements-textPrimary'
                  : 'text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary hover:bg-bolt-elements-item-backgroundActive',
              )}
            >
              {n.label}
            </a>
          ))}
        </nav>
        {data.email ? (
          <UserMenu email={data.email} name={data.name} admin={data.admin} remaining={data.remaining} />
        ) : (
          <div className="flex items-center gap-2">
            <a href="/login" className="btn-ghost btn-md">
              Sign in
            </a>
            <a href="/login?mode=register" className="btn-primary btn-md">
              Sign up free
            </a>
          </div>
        )}
      </header>
      <div className={classNames('mx-auto w-full px-6 pb-16 pt-4', width)}>{children}</div>
    </div>
  );
}
