import type { ReactNode } from 'react';
import { Logo } from '~/components/brand/Logo';

/*
 * Auth screens (Signup, Signin-Error, Signups-Closed boards): 50/50 split, form on Paper left, full-bleed panel right.
 * Yellow panel for the happy path, paper panels for edge cases. The panel hides below md.
 */
export type AuthPanel = 'welcome' | 'invite' | 'closed';

const PANELS: Record<AuthPanel, { bg: string; label: string; alt: string }> = {
  welcome: {
    bg: "#FDB10B url('/art/signup-panel.webp') center 62%/cover no-repeat",
    label: 'Welcome',
    alt: 'Foldo the paper dachshund on a cushion, wearing one name badge and holding out a second one',
  },
  invite: {
    bg: "#FEFCF6 url('/art/invite-invalid-panel.webp') center 45%/cover no-repeat",
    label: 'Invite code help',
    alt: 'Detective Foldo in a deerstalker peering through a magnifying glass at a blank ticket, a question mark above',
  },
  closed: {
    bg: "#FDFBF5 url('/art/signups-closed-panel.webp') center 45%/cover no-repeat",
    label: 'Sign-ups closed',
    alt: 'Foldo as a doorman in a bow tie, standing politely beside a velvet rope',
  },
};

export function AuthSplit({
  panel,
  eventName,
  closesAt,
  children,
}: {
  panel: AuthPanel;
  eventName: string;
  closesAt: string;
  children: ReactNode;
}) {
  const p = PANELS[panel];

  return (
    <div className="grid min-h-full bg-paper font-sans text-[15px] leading-[1.5] text-ink md:grid-cols-2">
      <div className="flex min-w-0 flex-col">
        <header className="flex h-[84px] items-center justify-between gap-4 px-[clamp(16px,4vw,64px)]">
          <Logo size={32} textSize={30} className="gap-[10px] text-ink" />
          <a
            href="/gallery"
            className="inline-flex min-h-[44px] items-center rounded-[6px] px-1 text-[15px] font-medium text-ink no-underline outline-none hover:underline focus-visible:shadow-[0_0_0_2px_#16140F]"
          >
            Gallery
          </a>
        </header>
        <main className="flex flex-1 items-center justify-center px-[clamp(16px,4vw,64px)] pb-16 pt-6">{children}</main>
      </div>

      <aside
        aria-label={p.label}
        className={`relative hidden min-w-0 flex-col px-12 py-10 md:flex ${panel === 'welcome' ? 'justify-between' : 'justify-end border-l border-solid border-rule'}`}
        style={{ background: p.bg }}
      >
        <span role="img" aria-label={p.alt} className="absolute inset-0" />
        {panel === 'welcome' && (
          <>
            <p className="relative m-0 max-w-[360px] text-balance font-serif text-[40px] leading-[1.02] tracking-[-.01em] text-ink">
              One badge for you. One for whoever brings the coffee.
            </p>
            <span className="relative font-mono text-[12px] text-ink opacity-75">
              Free for every {eventName ? `${eventName} ` : ''}team.{closesAt ? ` Demo by ${closesAt}, sleep optional.` : ''}
            </span>
          </>
        )}
        {panel === 'invite' && (
          <div className="relative flex max-w-[380px] flex-col gap-[6px]">
            <p className="m-0 font-serif text-[36px] leading-[1.05] text-ink">Hmm, that code didn't match.</p>
            <p className="m-0 text-pretty text-[15px] text-ink2">Check for a missing letter or number, or ask at the help desk.</p>
          </div>
        )}
        {panel === 'closed' && <span className="relative font-mono text-[12px] text-pencil">The rope is up, for now.</span>}
      </aside>
    </div>
  );
}
