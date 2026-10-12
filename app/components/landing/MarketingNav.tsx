import { useLoaderData } from '@remix-run/react';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Logo } from '~/components/brand/Logo';
import { Icon } from '~/components/ui/icons';

export interface NavLink {
  href: string;
  label: string;
  current?: boolean;
}

/*
 * Phone menu: a 44px button that opens the page's links. Closes on Escape (focus back on the button), on a click or focus
 * outside, and on scroll.
 */
export function NavMenu({
  links,
  children,
  tone = 'yellow',
  menuId,
}: {
  links: NavLink[];
  children?: ReactNode;
  tone?: 'yellow' | 'paper';
  menuId?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const autoId = useId();
  const id = menuId ?? autoId;

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    const outside = (e: Event) => {
      if (!ref.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        button.current?.focus();
      }
    };
    const scroll = () => setOpen(false);

    document.addEventListener('mousedown', outside);
    document.addEventListener('focusin', outside);
    document.addEventListener('keydown', key);
    document.addEventListener('scroll', scroll, true);

    return () => {
      document.removeEventListener('mousedown', outside);
      document.removeEventListener('focusin', outside);
      document.removeEventListener('keydown', key);
      document.removeEventListener('scroll', scroll, true);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        ref={button}
        type="button"
        aria-label={open ? 'Close menu' : 'Open menu'}
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen(!open)}
        className={`inline-flex h-[44px] w-[44px] cursor-pointer items-center justify-center rounded-[8px] border border-solid text-ink outline-none focus-visible:shadow-[0_0_0_2px_#16140F] ${
          tone === 'yellow' ? 'border-[rgba(22,20,15,.22)] bg-[rgba(255,255,255,.6)]' : 'border-rule bg-sheet hover:bg-wash'
        }`}
      >
        {open ? <Icon.Close size={20} /> : <Icon.Menu size={20} />}
      </button>
      {open && (
        <nav id={id} aria-label="Main" className="menu-panel absolute right-0 top-[52px] z-max flex w-[220px] flex-col">
          {links.map((l) => (
            <a key={l.href} href={l.href} aria-current={l.current ? 'page' : undefined} className="menu-item aria-[current=page]:font-semibold">
              {l.label}
            </a>
          ))}
          {children}
        </nav>
      )}
    </div>
  );
}

// phone header for signed-out pages (Landing-Mobile board): mark, Sign in, menu with Gallery / Sign in / Get started
export function MobileNav({ active, tone = 'yellow' }: { active?: 'gallery' | 'pricing'; tone?: 'yellow' | 'paper' }) {
  return (
    <header className="flex h-[64px] items-center justify-between gap-3 px-4">
      <Logo size={28} textSize={26} className="text-ink" />
      <div className="flex items-center gap-2">
        <a href="/login" className="inline-flex min-h-[40px] items-center rounded-[6px] px-3 text-[14px] font-medium text-ink no-underline">
          Sign in
        </a>
        <NavMenu
          tone={tone}
          menuId="mobile-menu"
          links={[
            { href: '/gallery', label: 'Gallery', current: active === 'gallery' },
            { href: '/pricing', label: 'Pricing', current: active === 'pricing' },
            { href: '/login', label: 'Sign in' },
          ]}
        >
          <div className="menu-separator" />
          <a href="/login?mode=register" className="btn-primary btn-md mt-1 w-full">
            Get started <Icon.ArrowRight />
          </a>
        </NavMenu>
      </div>
    </header>
  );
}

// marketing footer: Landing (stacked, 28 mark) and Gallery (one row, 24 mark) boards
export function SiteFooter({ compact = false }: { compact?: boolean }) {
  // every page with this footer spreads shell() into its loader
  const { eventMode, contactEmail } = (useLoaderData() ?? {}) as { eventMode?: boolean; contactEmail?: string };
  const year = new Date().getFullYear();
  const link =
    'min-h-[44px] items-center rounded-[6px] px-3 text-[15px] text-ink2 no-underline outline-none hover:text-ink hover:underline focus-visible:shadow-[0_0_0_2px_#16140F]';
  const copy = `© ${year} Foldo. Built on open source.`;

  return (
    <footer className="border-t border-solid border-ink">
      <div
        className={
          compact
            ? 'container-marketing flex flex-wrap items-center justify-between gap-x-3 gap-y-2 pb-6 pt-5 md:gap-6 md:pb-10 md:pt-8'
            : 'container-marketing flex flex-wrap items-center justify-between gap-x-3 gap-y-2 pb-6 pt-5 md:items-end md:gap-6 md:pb-12 md:pt-10'
        }
      >
        <div className={compact ? 'flex items-center gap-[10px]' : 'flex flex-col gap-3'}>
          {compact ? (
            <>
              <Logo size={24} textSize={24} className="gap-[10px] text-ink" />
              <span className="ml-3 hidden text-[14px] text-pencil md:inline">{copy}</span>
            </>
          ) : (
            <>
              <span className="md:hidden">
                <Logo size={24} textSize={24} className="text-ink" />
              </span>
              <span className="hidden md:block">
                <Logo size={28} textSize={28} className="gap-[10px] text-ink" />
              </span>
              <span className="hidden text-[14px] text-pencil md:block">{copy}</span>
            </>
          )}
        </div>
        <span className="text-[13px] text-pencil md:hidden">{copy}</span>
        {/* Pricing · Gallery · Privacy · Terms (+ Code of conduct while an event runs) · the contact address when set */}
        <nav aria-label="Footer" className="-ml-3 flex w-full flex-wrap gap-x-1 md:ml-0 md:w-auto">
          <a href="/pricing" className={`${link} inline-flex`}>
            Pricing
          </a>
          <a href="/gallery" className={`${link} inline-flex`}>
            Gallery
          </a>
          <a href="/privacy" className={`${link} inline-flex`}>
            Privacy
          </a>
          <a href="/terms" className={`${link} inline-flex`}>
            Terms
          </a>
          {eventMode && (
            <a href="/conduct" className={`${link} inline-flex`}>
              Code of conduct
            </a>
          )}
          {contactEmail && (
            <a href={`mailto:${contactEmail}`} className={`${link} inline-flex`}>
              {contactEmail}
            </a>
          )}
        </nav>
      </div>
    </footer>
  );
}
