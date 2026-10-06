import { useStore } from '@nanostores/react';
import type { LinksFunction } from '@remix-run/node';
import { Links, Meta, Outlet, Scripts, ScrollRestoration, isRouteErrorResponse, useRouteError } from '@remix-run/react';
import tailwindReset from '@unocss/reset/tailwind-compat.css?url';
import { themeStore } from './lib/stores/theme';
import { stripIndents } from './utils/stripIndent';
import { createHead } from 'remix-island';
import { useEffect } from 'react';

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
    href: 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&family=Luckiest+Guy&display=swap',
  },
];

const inlineThemeCode = stripIndents`
  setTutorialKitTheme();

  function setTutorialKitTheme() {
    let theme = localStorage.getItem('bolt_theme');

    if (!theme) {
      theme = 'dark';
    }

    document.querySelector('html')?.setAttribute('data-theme', theme);
  }
`;

export const Head = createHead(() => (
  <>
    <meta charSet="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="theme-color" content="#1e1e1e" />
    <Meta />
    <Links />
    <script dangerouslySetInnerHTML={{ __html: inlineThemeCode }} />
  </>
));

export function Layout({ children }: { children: React.ReactNode }) {
  const theme = useStore(themeStore);

  useEffect(() => {
    document.querySelector('html')?.setAttribute('data-theme', theme);
  }, [theme]);

  return (
    <>
      {children}
      <ScrollRestoration />
      <Scripts />
    </>
  );
}

export default function App() {
  return <Outlet />;
}

export function ErrorBoundary() {
  const error = useRouteError();
  const notFound = isRouteErrorResponse(error) && error.status === 404;
  const raw = isRouteErrorResponse(error) ? String(error.data || error.statusText) : '';
  const detail = /^Error:|No route/.test(raw) ? undefined : raw || undefined;

  // renderHeadToString yields an empty <head> when no route matched, so the boundary brings its own stylesheets
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 bg-bolt-elements-background-depth-1 p-6 text-center text-bolt-elements-textPrimary">
      <Links />
      <img src={notFound ? '/art/not-found.webp' : '/art/sleepy.webp'} alt="" width={260} className="rounded-3xl" />
      <h1 className="font-display text-4xl">{notFound ? 'Nothing here.' : 'Something went wrong.'}</h1>
      <p className="max-w-sm text-bolt-elements-textSecondary">
        {notFound
          ? detail || "We couldn't find that page. It may have been deleted or the link may be wrong."
          : 'Try again in a moment. If it keeps happening, let us know.'}
      </p>
      <a href="/" className="btn-primary btn-lg">
        Back to Foldo
      </a>
    </div>
  );
}
