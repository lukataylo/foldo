import { useEffect, useRef, useState } from 'react';
import { Logo } from '~/components/brand/Logo';
import { Icon } from '~/components/ui/icons';

/*
 * Phone header for the marketing pages (Landing-Mobile board): mark, Sign in, and a menu button that opens
 * Gallery / Sign in / Get started. Desktop uses the shared SiteHeader.
 */
export function MobileNav() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !ref.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    };

    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);

    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', close);
    };
  }, [open]);

  return (
    <header className="relative flex h-[64px] items-center justify-between gap-3 px-4">
      <Logo size={28} textSize={26} className="text-ink" />
      <div ref={ref} className="flex items-center gap-2">
        <a href="/login" className="inline-flex min-h-[40px] items-center rounded-[6px] px-3 text-[14px] font-medium text-ink no-underline">
          Sign in
        </a>
        <button
          type="button"
          aria-label={open ? 'Close menu' : 'Open menu'}
          aria-expanded={open}
          aria-controls="mobile-menu"
          onClick={() => setOpen(!open)}
          className="inline-flex h-[44px] w-[44px] cursor-pointer items-center justify-center rounded-[8px] border border-solid border-[rgba(22,20,15,.22)] bg-[rgba(255,255,255,.6)] text-ink outline-none focus-visible:shadow-[0_0_0_2px_#16140F]"
        >
          {open ? (
            <Icon.Close size={20} />
          ) : (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
              <path d="M4 7h16M4 12h16M4 17h16" />
            </svg>
          )}
        </button>
        {open && (
          <nav id="mobile-menu" aria-label="Main" className="menu-panel absolute right-4 top-[60px] z-max flex w-[220px] flex-col">
            <a href="/gallery" className="menu-item">
              Gallery
            </a>
            <a href="/login" className="menu-item">
              Sign in
            </a>
            <div className="menu-separator" />
            <a href="/login?mode=register" className="btn-primary btn-md mt-1 w-full">
              Get started <Icon.ArrowRight />
            </a>
          </nav>
        )}
      </div>
    </header>
  );
}

// marketing footer: Landing (stacked, 28 mark) and Gallery (one row, 24 mark) boards
export function SiteFooter({ compact = false }: { compact?: boolean }) {
  const year = new Date().getFullYear();
  const link =
    'inline-flex min-h-[44px] items-center rounded-[6px] px-3 text-[15px] text-ink2 no-underline outline-none hover:text-ink hover:underline focus-visible:shadow-[0_0_0_2px_#16140F]';

  return (
    <footer className="border-t border-solid border-ink">
      <div
        className={
          compact
            ? 'container-marketing flex flex-wrap items-center justify-between gap-6 pb-10 pt-8'
            : 'container-marketing flex items-center justify-between gap-3 pb-7 pt-5 md:flex-wrap md:items-end md:gap-6 md:pb-12 md:pt-10'
        }
      >
        <div className={compact ? 'flex items-center gap-[10px]' : 'flex flex-col gap-3'}>
          {compact ? (
            <>
              <Logo size={24} textSize={24} className="gap-[10px] text-ink" />
              <span className="ml-3 text-[14px] text-pencil">© {year} Foldo. Built on open source.</span>
            </>
          ) : (
            <>
              <span className="md:hidden">
                <Logo size={24} textSize={24} className="text-ink" />
              </span>
              <span className="hidden md:block">
                <Logo size={28} textSize={28} className="gap-[10px] text-ink" />
              </span>
              <span className="hidden text-[14px] text-pencil md:block">© {year} Foldo. Built on open source.</span>
            </>
          )}
        </div>
        {!compact && <span className="text-[13px] text-pencil md:hidden">© {year} Foldo. Built on open source.</span>}
        <nav aria-label="Footer" className={compact ? 'flex gap-1' : 'hidden gap-1 md:flex md:flex-wrap'}>
          <a href="/gallery" className={link}>
            Gallery
          </a>
          <a href="/login" className={link}>
            Sign in
          </a>
          <a href="/login?mode=register" className={link}>
            Get started
          </a>
        </nav>
      </div>
    </footer>
  );
}
