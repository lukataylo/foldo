// Tiny routing for the marketing surface.
// The canvas (App) stays at `/app/...`; authenticated apps live at /home, /settings.
// Everything else is marketing.

import About from './About';
import Brand from './Brand';
import Changelog from './Changelog';
import CookiePolicy from './CookiePolicy';
import Demo from './Demo';
import Docs from './Docs';
import Extension from './Extension';
import Forgot from './Forgot';
import Landing from './Landing';
import Login from './Login';
import NotFound from './NotFound';
import Pricing from './Pricing';
import Privacy from './Privacy';
import Signup from './Signup';
import Terms from './Terms';

const KNOWN_MARKETING_PATHS = new Set([
  '/',
  '/landing',
  '/login',
  '/signup',
  '/pricing',
  '/demo',
  '/docs',
  '/forgot',
  '/terms',
  '/privacy',
  '/about',
  '/brand',
  '/changelog',
  '/cookies',
  '/cookie-policy',
  '/extension',
]);

export function isMarketingPath(pathname: string): boolean {
  if (KNOWN_MARKETING_PATHS.has(pathname)) return true;
  if (pathname.startsWith('/docs/')) return true;
  // Authenticated surfaces own their prefixes; don't route them to marketing.
  if (pathname === '/home' || pathname.startsWith('/home/')) return false;
  if (pathname === '/settings' || pathname.startsWith('/settings/')) return false;
  // Share viewer owns /s/* and the legacy /share/*.
  if (pathname.startsWith('/s/') || pathname.startsWith('/share/')) return false;
  // Capture-by-URL viewer owns /c/*.
  if (pathname.startsWith('/c/')) return false;
  // The canvas owns these prefixes; defer to <App />.
  if (pathname.startsWith('/app') || pathname.startsWith('/board/')) return false;
  // Anything else marketing-ish (404 etc.) → marketing.
  return true;
}

export default function MarketingRouter() {
  const path = typeof location !== 'undefined' ? location.pathname : '/';

  if (path === '/' || path === '/landing') return <Landing />;
  if (path === '/login') return <Login />;
  if (path === '/signup') return <Signup />;
  if (path === '/pricing') return <Pricing />;
  if (path === '/demo') return <Demo />;
  if (path === '/forgot') return <Forgot />;
  if (path === '/terms') return <Terms />;
  if (path === '/privacy') return <Privacy />;
  if (path === '/cookies' || path === '/cookie-policy') return <CookiePolicy />;
  if (path === '/extension') return <Extension />;
  if (path === '/about') return <About />;
  if (path === '/brand') return <Brand />;
  if (path === '/changelog' || path === '/docs/changelog') return <Changelog />;
  if (path === '/docs') return <Docs slug="" />;
  if (path.startsWith('/docs/')) return <Docs slug={path.slice('/docs/'.length).replace(/\/+$/, '')} />;
  return <NotFound />;
}
