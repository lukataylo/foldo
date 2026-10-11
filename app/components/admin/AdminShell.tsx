import type { ReactNode } from 'react';
import type { ShellData } from '~/components/PageShell';
import { UserMenu } from '~/components/header/UserMenu';
import { classNames } from '~/utils/classNames';

// short relative times for the console ("just now", "4 min ago", "3 h ago"); `now` comes from the loader so SSR and hydration agree
export function ago(ts: number | null | undefined, now: number) {
  if (!ts) {
    return '—';
  }

  const m = Math.floor(Math.max(0, now - ts) / 60_000);

  return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.floor(m / 60)} h ago` : `${Math.floor(m / 1440)} d ago`;
}

function countdown(endsAt: number, now: number) {
  const m = Math.floor((endsAt - now) / 60_000);

  if (m <= 0) {
    return 'ended';
  }

  const d = Math.floor(m / 1440);
  const h = Math.floor((m % 1440) / 60);

  return d > 0 ? `${d}d ${h}h` : h > 0 ? `${h}h ${m % 60}m` : `${m}m`;
}

const svg = (children: ReactNode) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0">
    {children}
  </svg>
);

export const SECTIONS = [
  {
    id: 'live',
    label: 'Live',
    icon: svg(
      <>
        <circle cx="12" cy="12" r="3" />
        <path d="M5.6 5.6a9 9 0 0 0 0 12.8M18.4 5.6a9 9 0 0 1 0 12.8" />
      </>,
    ),
  },
  {
    id: 'emergency',
    label: 'Emergency',
    icon: svg(
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M10 9v6M14 9v6" />
      </>,
    ),
  },
  {
    id: 'models',
    label: 'AI models',
    icon: svg(
      <>
        <rect x="6" y="6" width="12" height="12" rx="2" />
        <path d="M9 2v4M15 2v4M9 18v4M15 18v4M2 9h4M2 15h4M18 9h4M18 15h4" />
      </>,
    ),
  },
  {
    id: 'event',
    label: 'Event & limits',
    icon: svg(
      <>
        <rect x="3" y="5" width="18" height="16" rx="2" />
        <path d="M3 10h18M8 3v4M16 3v4" />
      </>,
    ),
  },
  {
    id: 'teams',
    label: 'Teams',
    icon: svg(
      <>
        <circle cx="9" cy="8" r="3" />
        <path d="M3 20a6 6 0 0 1 12 0M16 5a3 3 0 0 1 0 6M21 20a6 6 0 0 0-4-5.6" />
      </>,
    ),
  },
  {
    id: 'gallery',
    label: 'Gallery',
    icon: svg(
      <>
        <rect x="4" y="4" width="7" height="7" rx="1" />
        <rect x="13" y="4" width="7" height="7" rx="1" />
        <rect x="4" y="13" width="7" height="7" rx="1" />
        <rect x="13" y="13" width="7" height="7" rx="1" />
      </>,
    ),
  },
  {
    id: 'backups',
    label: 'Backups',
    icon: svg(
      <>
        <rect x="3" y="4" width="18" height="5" rx="1" />
        <path d="M5 9v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9M10 13h4" />
      </>,
    ),
  },
] as const;

export type SectionId = (typeof SECTIONS)[number]['id'];

/*
 * Organizer console frame (Admin board): 56px header with the mark and serif title, the event pill, Template packs and
 * the account menu; then the 1312 container with the section nav on the left and the cards on the right.
 */
export function AdminShell({
  data,
  now,
  page,
  active,
  badges = {},
  children,
}: {
  data: ShellData;
  now: number;
  page: 'console' | 'templates';
  active?: SectionId;
  badges?: Partial<Record<SectionId, ReactNode>>;
  children: ReactNode;
}) {
  const event = data.event;
  const base = page === 'console' ? '' : '/admin';

  return (
    <div className="h-full overflow-y-auto bg-paper text-[14px] leading-[1.5] text-ink" data-testid="foldo-admin-shell">
      <header className="flex h-[56px] items-center justify-between gap-3 border-b border-rule bg-paper px-[clamp(12px,2vw,20px)]">
        <div className="flex min-w-0 items-center gap-[10px]">
          <a href="/" aria-label="Foldo home" className="flex flex-none">
            <img src="/foldo-mark.svg" alt="" width={24} height={24} className="block rounded-[5px]" />
          </a>
          <span aria-hidden="true" className="h-[20px] w-px flex-none bg-rule" />
          {page === 'console' ? (
            <h1 className="m-0 whitespace-nowrap font-serif text-[21px] font-normal leading-none">Organizer console</h1>
          ) : (
            <a href="/admin" className="whitespace-nowrap font-serif text-[21px] font-normal leading-none text-ink no-underline hover:underline">
              Organizer console
            </a>
          )}
        </div>
        <div className="flex min-w-0 items-center gap-[10px]">
          {event?.name && (
            <span className="hidden h-[28px] items-center gap-2 overflow-hidden text-ellipsis whitespace-nowrap rounded-full bg-ink px-3 text-[12px] font-medium text-paper sm:inline-flex">
              <span aria-hidden="true" className="h-[6px] w-[6px] flex-none rounded-full bg-[#7FC79F]" />
              {event.name}
              {event.endsAt && (
                <>
                  {' · '}
                  <span className="font-mono">{countdown(event.endsAt, now)}</span>
                  {event.endsAt > now && ' left'}
                </>
              )}
            </span>
          )}
          <a
            href="/admin/templates"
            aria-current={page === 'templates' ? 'page' : undefined}
            className={classNames(
              'whitespace-nowrap text-[13px] font-medium text-ink2 decoration-field underline-offset-3 hover:text-ink',
              page === 'templates' ? 'text-ink underline' : 'no-underline hover:underline',
            )}
          >
            Template packs
          </a>
          <UserMenu email={data.email!} name={data.name} admin={data.admin} remaining={data.remaining} limit={data.limit} variant="avatar" />
        </div>
      </header>

      <div className="mx-auto flex max-w-[1312px] flex-wrap items-start gap-8 px-[clamp(16px,3vw,32px)] pb-16 pt-7">
        <nav aria-label="Console sections" className="flex max-w-full flex-[1_1_200px] flex-col gap-[14px] lg:sticky lg:top-7">
          <ul className="m-0 flex list-none flex-wrap gap-[2px] p-0">
            {SECTIONS.map((s) => {
              const current = page === 'console' && active === s.id;

              return (
                <li key={s.id} className="flex-[1_1_180px]">
                  <a
                    href={`${base}#${s.id}`}
                    aria-current={current ? 'true' : undefined}
                    className={classNames(
                      'flex h-[38px] items-center gap-[10px] rounded-[8px] border border-solid px-[10px] text-[14px] no-underline outline-none focus-visible:shadow-[0_0_0_2px_#16140F]',
                      current ? 'border-rule bg-sheet font-semibold text-ink' : 'border-transparent text-ink2 hover:bg-wash hover:text-ink',
                    )}
                  >
                    {s.icon}
                    {s.label}
                    {badges[s.id] !== undefined && <span className="ml-auto">{badges[s.id]}</span>}
                  </a>
                </li>
              );
            })}
          </ul>
          <p className="m-0 border-t border-rule px-[10px] pt-3 text-[12px] text-pencil [text-wrap:pretty]">
            {page === 'console' ? 'Numbers refresh every 10 seconds while this page is open.' : 'Sections open the organizer console.'}
          </p>
        </nav>
        <main className="flex min-w-0 flex-[999_1_720px] flex-col gap-6">{children}</main>
      </div>
    </div>
  );
}

// card recipe shared by every console section: Sheet, 1px Rule, r12, 20/24/22 padding, serif 30 title
export const cardClass = 'flex scroll-mt-6 flex-col rounded-[12px] border border-solid border-rule bg-sheet px-6 pb-[22px] pt-5';
export const h2Class = 'm-0 font-serif text-[30px] font-normal leading-[1.1]';
export const thClass = 'px-[14px] py-[9px] border-b border-rule font-mono text-[12px] font-medium uppercase tracking-[.08em] text-pencil';
// dense table buttons (32 high, r7, 13px) from the board
export const tableBtn = 'h-[32px] px-[10px] rounded-[7px] text-[13px] min-h-0';
