// Path classifier kept in a tiny standalone module so main.tsx can ask "is this
// route marketing?" without statically importing all 16 marketing screens — the
// whole point of the route-level lazy() split. `MarketingRouter.tsx` re-exports
// this so existing call-sites stay valid.

const KNOWN_MARKETING_PATHS = new Set<string>([
  '/',
  '/landing',
  '/login',
  '/signup',
  '/pricing',
  '/demo',
  '/docs',
  '/forgot',
  '/reset',
  '/verify',
  '/terms',
  '/privacy',
  '/about',
  '/brand',
  '/changelog',
  '/cookies',
  '/cookie-policy',
  '/security',
  '/data-policy',
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
