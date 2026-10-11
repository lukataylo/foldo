import { useStore } from '@nanostores/react';
import type { ReactNode } from 'react';
import { Logo } from '~/components/brand/Logo';
import { EventBar, type EventInfo } from '~/components/header/EventBar';
import { UserMenu } from '~/components/header/UserMenu';
import { MobileNav, NavMenu } from '~/components/landing/MarketingNav';
import { Icon } from '~/components/ui/icons';
import { quota } from '~/lib/stores/ui';
import { classNames } from '~/utils/classNames';

export interface ShellData {
  email?: string;
  name?: string;
  admin?: boolean;
  remaining?: number;
  limit?: number;
  event?: EventInfo | null;
}

export type ShellSection = 'build' | 'projects' | 'gallery' | 'settings' | 'admin';

const APP_NAV = [
  { id: 'build', href: '/', label: 'Build' },
  { id: 'projects', href: '/projects', label: 'Your projects' },
  { id: 'gallery', href: '/gallery', label: 'Gallery' },
] as const;

// Signed-in header (Home, Projects, Settings boards): 64 high, 1312 container, nav, messages-left pill, account menu
export function AppHeader({ data, active }: { data: ShellData; active?: ShellSection }) {
  const live = useStore(quota);
  const left = live ?? data.remaining;

  return (
    <header className="shrink-0 border-b border-rule bg-paper">
      <div className="container-app flex h-[64px] items-center gap-3 md:gap-7">
        <Logo />
        <nav aria-label="Main" className="hidden items-center gap-1 md:flex">
          {APP_NAV.map((n) => (
            <a
              key={n.id}
              href={n.href}
              aria-current={active === n.id ? 'page' : undefined}
              className={classNames(
                'inline-flex min-h-[40px] items-center rounded-[6px] px-3 text-[14px] no-underline outline-none focus-visible:shadow-[0_0_0_2px_#16140F]',
                active === n.id ? 'bg-wash font-semibold text-ink' : 'font-medium text-ink2 hover:bg-wash hover:text-ink',
              )}
            >
              {n.label}
            </a>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-3">
          {left !== undefined && (
            <span className="hidden h-[28px] items-center rounded-full border border-rule bg-sheet px-3 font-mono text-[12px] font-medium text-ink2 sm:inline-flex">
              {left} {left === 1 ? 'message' : 'messages'} left today
            </span>
          )}
          {/* below md the nav labels move into a menu so the header never wraps */}
          <div className="md:hidden">
            <NavMenu tone="paper" links={APP_NAV.map((n) => ({ href: n.href, label: n.label, current: active === n.id }))} />
          </div>
          <UserMenu email={data.email!} name={data.name} admin={data.admin} remaining={data.remaining} limit={data.limit} />
        </div>
      </div>
    </header>
  );
}

// Signed-out header (Gallery, Landing boards): 84 high, 1344 container. tone "yellow" sits on the hero band (Ink primary).
export function SiteHeader({ active, tone = 'paper' }: { active?: 'gallery'; tone?: 'paper' | 'yellow' }) {
  const link = 'inline-flex min-h-[44px] items-center px-[14px] text-[15px] text-ink outline-none focus-visible:shadow-[0_0_0_2px_#16140F] rounded-[6px]';

  return (
    <>
      <div className="md:hidden">
        <MobileNav active={active} tone={tone} />
      </div>
      <header className="container-marketing hidden h-[84px] items-center justify-between gap-4 md:flex">
      <Logo size={32} textSize={30} className="gap-[10px] text-ink" />
      <nav aria-label="Main" className="flex items-center gap-[6px]">
        <a
          href="/gallery"
          aria-current={active === 'gallery' ? 'page' : undefined}
          className={classNames(
            link,
            active === 'gallery' ? 'font-semibold underline decoration-1 underline-offset-[6px]' : 'font-medium no-underline hover:underline',
          )}
        >
          Gallery
        </a>
        <a href="/login" className={classNames(link, 'font-medium no-underline hover:underline')}>
          Sign in
        </a>
        <a href="/login?mode=register" className={classNames(tone === 'yellow' ? 'btn-dark' : 'btn-primary', 'btn-lg ml-[6px]')}>
          Get started <Icon.ArrowRight />
        </a>
      </nav>
    </header>
    </>
  );
}

/*
 * Frame for every page outside the studio: event bar, one header, then <main> in the 1312 container.
 * Pages own their vertical rhythm: pass mainClassName to replace the default padding (48 top, 72 bottom). `footer` renders
 * after <main> (Gallery's marketing footer).
 */
export function PageShell({
  data,
  active,
  mainClassName = 'pt-12 pb-[72px]',
  footer,
  children,
}: {
  data: ShellData;
  active?: ShellSection;
  mainClassName?: string;
  footer?: ReactNode;
  children: ReactNode;
}) {
  const signedIn = Boolean(data.email);

  return (
    <div className="h-full overflow-y-auto bg-paper text-[15px] leading-[1.5] text-ink">
      <EventBar event={data.event} variant={signedIn ? 'app' : 'marketing'} />
      {signedIn ? <AppHeader data={data} active={active} /> : <SiteHeader active={active === 'gallery' ? 'gallery' : undefined} />}
      <main className={classNames(signedIn ? 'container-app' : 'container-marketing', mainClassName)}>{children}</main>
      {footer}
    </div>
  );
}
