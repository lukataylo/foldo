// Tiny routing for the marketing surface.
// The canvas (App) stays at `/app/...`; authenticated apps live at /home, /settings.
// Everything else is marketing.

import About from './About';
import Brand from './Brand';
import Changelog from './Changelog';
import CookiePolicy from './CookiePolicy';
import DataPolicy from './DataPolicy';
import Demo from './Demo';
import Docs from './Docs';
import Forgot from './Forgot';
import Security from './Security';
import Reset from './Reset';
import Verify from './Verify';
import Landing from './Landing';
import Login from './Login';
import NotFound from './NotFound';
import Pricing from './Pricing';
import Privacy from './Privacy';
import Signup from './Signup';
import Terms from './Terms';

// Re-export so old callers (`import { isMarketingPath } from './MarketingRouter'`)
// still work; new code should import directly from './path' to avoid pulling
// in this module's marketing-screen dependency graph.
export { isMarketingPath } from './path';

export default function MarketingRouter() {
  const path = typeof location !== 'undefined' ? location.pathname : '/';

  if (path === '/' || path === '/landing') return <Landing />;
  if (path === '/login') return <Login />;
  if (path === '/signup') return <Signup />;
  if (path === '/pricing') return <Pricing />;
  if (path === '/demo') return <Demo />;
  if (path === '/forgot') return <Forgot />;
  if (path === '/reset') return <Reset />;
  if (path === '/verify') return <Verify />;
  if (path === '/terms') return <Terms />;
  if (path === '/privacy') return <Privacy />;
  if (path === '/cookies' || path === '/cookie-policy') return <CookiePolicy />;
  if (path === '/security') return <Security />;
  if (path === '/data-policy') return <DataPolicy />;
  if (path === '/about') return <About />;
  if (path === '/brand') return <Brand />;
  if (path === '/changelog' || path === '/docs/changelog') return <Changelog />;
  if (path === '/docs') return <Docs slug="" />;
  if (path.startsWith('/docs/')) return <Docs slug={path.slice('/docs/'.length).replace(/\/+$/, '')} />;
  return <NotFound />;
}
