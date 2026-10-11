import type { LinksFunction } from '@remix-run/node';
import { Links, Meta, Outlet, Scripts, ScrollRestoration, isRouteErrorResponse, useRouteError } from '@remix-run/react';
import tailwindReset from '@unocss/reset/tailwind-compat.css?url';
import { createHead } from 'remix-island';
import { useEffect, useState } from 'react';
import { toast } from 'react-toastify';
import { Icon } from './components/ui/icons';
import { Toaster } from './components/ui/Toaster';

import reactToastifyStyles from 'react-toastify/dist/ReactToastify.css?url';
import globalStyles from './styles/index.scss?url';
import xtermStyles from '@xterm/xterm/css/xterm.css?url';

import 'virtual:uno.css';

export const links: LinksFunction = () => [
  { rel: 'icon', href: '/favicon.svg', type: 'image/svg+xml' },
  { rel: 'icon', href: '/favicon-32.png', type: 'image/png', sizes: '32x32' },
  { rel: 'shortcut icon', href: '/favicon.ico' },
  { rel: 'apple-touch-icon', href: '/apple-touch-icon.png' },
  { rel: 'manifest', href: '/manifest.webmanifest' },
  { rel: 'stylesheet', href: reactToastifyStyles },
  { rel: 'stylesheet', href: tailwindReset },
  { rel: 'stylesheet', href: globalStyles },
  { rel: 'stylesheet', href: xtermStyles },
  {
    rel: 'preconnect',
    href: 'https://fonts.googleapis.com',
  },
  {
    rel: 'preconnect',
    href: 'https://fonts.gstatic.com',
    crossOrigin: 'anonymous',
  },
  {
    rel: 'stylesheet',
    href: 'https://fonts.googleapis.com/css2?family=Instrument+Sans:wght@400;500;600&family=Instrument+Serif:ital@0;1&family=JetBrains+Mono:wght@400;500&display=swap',
  },
];

export const Head = createHead(() => (
  <>
    <meta charSet="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="theme-color" content="#FBF8F1" />
    <Meta />
    <Links />
  </>
));

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <Toaster />
      <ScrollRestoration />
      <Scripts />
    </>
  );
}

export default function App() {
  return <Outlet />;
}

// the moment the error was seen, rendered on the client only (avoids a hydration mismatch)
function useSeen() {
  const [seen, setSeen] = useState<{ path: string; time: string; iso: string; ref: string } | null>(null);

  useEffect(() => {
    const now = new Date();
    const code = now.getTime().toString(36).toUpperCase().slice(-8);

    setSeen({
      path: location.pathname,
      time: now.toTimeString().slice(0, 5),
      iso: now.toISOString(),
      ref: `${code.slice(0, 4)}-${code.slice(4)}`,
    });
  }, []);

  return seen;
}

// NotFound and ServerError boards: own header, framed image, one headline, two actions
export function ErrorBoundary() {
  const error = useRouteError();
  const notFound = isRouteErrorResponse(error) && error.status === 404;
  const raw = isRouteErrorResponse(error) ? String(error.data || error.statusText) : '';
  const detail = /^Error:|No route/.test(raw) ? undefined : raw || undefined;
  const seen = useSeen();

  // renderHeadToString yields an empty <head> when no route matched, so the boundary brings its own stylesheets
  return (
    <div className="flex h-full min-h-[600px] flex-col overflow-auto bg-paper text-[16px] leading-[1.5] text-ink">
      <Links />
      <header className="flex h-[56px] flex-none items-center border-b border-rule px-[clamp(16px,4vw,64px)]">
        <a href="/" aria-label="Foldo home" className="flex items-center gap-2 text-ink no-underline">
          <img src="/foldo-mark.svg" alt="" width={24} height={24} className="block" />
          <span className="font-serif text-[22px] leading-none">Foldo</span>
        </a>
      </header>
      <main className="flex min-h-0 flex-1 items-center justify-center px-4 pb-14 pt-10">
        <div className="flex w-full max-w-[560px] flex-col items-center gap-7 text-center">
          <img
            src={notFound ? '/art/empty-404.webp' : '/art/server-error.webp'}
            alt={
              notFound
                ? 'Foldo the paper dachshund standing on an unfolded map, lost, with a question mark overhead'
                : 'Foldo the paper dachshund tangled in yellow tape, looking sheepish'
            }
            width={380}
            height={380}
            className="block aspect-square h-auto w-[min(380px,100%)] rounded-[16px] border border-rule object-cover"
          />
          <div className="flex flex-col items-center gap-3">
            <span className="eyebrow">Error {notFound ? 404 : isRouteErrorResponse(error) ? error.status : 500}</span>
            <h1 className="m-0 font-serif text-[72px] font-normal leading-[.95] tracking-[-.02em]">
              {notFound ? (
                <>
                  Nothing <span className="marker">here.</span>
                </>
              ) : (
                <>
                  Something went <span className="italic">wrong.</span>
                </>
              )}
            </h1>
            <p className="m-0 max-w-[420px] text-[18px] text-ink2">
              {notFound
                ? detail || 'We couldn’t find that page. It may have been deleted or the link may be wrong.'
                : 'Try again in a moment. If it keeps happening, let us know.'}
            </p>
          </div>
          <div className="flex flex-wrap justify-center gap-3">
            {notFound ? (
              <>
                <a href="/" className="btn-primary btn-lg">
                  Back to Foldo
                  <Icon.ArrowRight />
                </a>
                <a href="/gallery" className="btn-secondary btn-lg">
                  Browse the gallery
                </a>
              </>
            ) : (
              <>
                <button type="button" className="btn-primary btn-lg" onClick={() => location.reload()}>
                  <Icon.Refresh />
                  Try again
                </button>
                <a href="/" className="btn-secondary btn-lg">
                  Back to Foldo
                </a>
              </>
            )}
          </div>
          {notFound ? (
            <span className="min-h-[18px] font-mono text-[12px] text-pencil">
              {seen ? `404 · ${seen.path} · ${seen.time}` : ''}
            </span>
          ) : (
            <div className="inline-flex h-[32px] items-center gap-1 rounded-[8px] border border-rule bg-sheet pl-3 pr-1">
              <span className="font-mono text-[12px] text-ink2">Ref {seen?.ref ?? '····-····'}</span>
              <button
                type="button"
                aria-label="Copy reference code"
                className="btn-icon h-[26px] w-[26px]"
                onClick={async () => {
                  if (!seen) {
                    return;
                  }

                  // ref, page and time: enough for an organizer to find the matching server log line
                  try {
                    await navigator.clipboard.writeText(`Ref ${seen.ref} · ${seen.path} · ${seen.iso}`);
                    toast.success('Reference copied.');
                  } catch {
                    toast.error('Couldn’t copy. Select the code and copy it by hand.');
                  }
                }}
              >
                <Icon.Copy size={14} />
              </button>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
