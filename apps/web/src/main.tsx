import React, { Suspense } from 'react';
import ReactDOM from 'react-dom/client';
import { CookieBanner } from './marketing/CookieBanner';
import { registerBuiltinFrameKinds } from './plugins/builtin';
import { registry as pluginRegistry } from './plugins/registry';
import { layersPlugin } from './plugins/layers';
import { designPlugin } from './plugins/design';
import { commentsPlugin } from './plugins/comments';
import { htmlFramePlugin } from './plugins/html-frame';
import './index.css';

// Lazy route roots — each becomes its own JS chunk at build time.
const App = React.lazy(() => import('./App'));
const MarketingRouter = React.lazy(() => import('./marketing/MarketingRouter'));
const HomeApp = React.lazy(() => import('./home/HomeApp'));
const SettingsApp = React.lazy(() => import('./settings/SettingsApp'));
const ShareViewer = React.lazy(() => import('./share/ShareViewer'));
const CaptureViewer = React.lazy(() => import('./capture/CaptureViewer'));
const TestRunner = React.lazy(() => import('./test/TestRunner'));

// Register the built-in canvas frame kinds before any component mounts. The
// canvas's frame renderer reads from the registry, so this MUST run before
// <App /> hits its first render pass.
registerBuiltinFrameKinds();

// First-party plugins shipped with the app.
pluginRegistry.load(layersPlugin);
pluginRegistry.load(designPlugin);
pluginRegistry.load(commentsPlugin);
pluginRegistry.load(htmlFramePlugin);

const path = typeof location !== 'undefined' ? location.pathname : '/';

// The /t/:token tester page is shown to external participants who never log
// in or open boards — the cookie banner doesn't apply and would just be noise.
const isTesterPage = path.startsWith('/t/');

// Inlined from marketing/MarketingRouter so that module can remain a pure
// lazy chunk (a static named import from it would pull it into the entry bundle).
const KNOWN_MARKETING_PATHS = new Set([
  '/', '/landing', '/login', '/signup', '/pricing', '/demo', '/docs',
  '/forgot', '/reset', '/verify-email', '/terms', '/privacy', '/about',
  '/brand', '/changelog', '/cookies', '/cookie-policy', '/extension',
]);
function isMarketingPath(pathname: string): boolean {
  if (KNOWN_MARKETING_PATHS.has(pathname)) return true;
  if (pathname.startsWith('/docs/')) return true;
  if (pathname === '/home' || pathname.startsWith('/home/')) return false;
  if (pathname === '/settings' || pathname.startsWith('/settings/')) return false;
  if (pathname.startsWith('/s/') || pathname.startsWith('/share/')) return false;
  if (pathname.startsWith('/c/')) return false;
  if (pathname.startsWith('/app') || pathname.startsWith('/board/')) return false;
  return true;
}

function pickRoot(): React.ReactNode {
  if (path.startsWith('/s/') || path.startsWith('/share/')) return <ShareViewer />;
  if (path.startsWith('/c/')) return <CaptureViewer />;
  if (isTesterPage) return <TestRunner />;
  if (path === '/home' || path.startsWith('/home/')) return <HomeApp />;
  if (path === '/settings' || path.startsWith('/settings/')) return <SettingsApp />;
  if (isMarketingPath(path)) return <MarketingRouter />;
  return <App />;
}

/** Minimal full-screen loading state matching the app's dark theme. */
function RouteLoadingFallback() {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#0e0e0f',
      }}
    >
      <div
        style={{
          fontSize: 13,
          color: 'rgba(255,255,255,0.35)',
          letterSpacing: '0.01em',
        }}
      >
        Loading…
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Suspense fallback={<RouteLoadingFallback />}>
      {pickRoot()}
    </Suspense>
    {!isTesterPage && <CookieBanner />}
  </React.StrictMode>,
);
