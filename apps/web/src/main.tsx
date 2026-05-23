import React, { Suspense, lazy } from 'react';
import ReactDOM from 'react-dom/client';
import { ErrorBoundary } from './components/ErrorBoundary';
import { isMarketingPath } from './marketing/path';
import './index.css';

// Route components are loaded lazily so the landing page doesn't ship the
// canvas bundle (and vice versa). Each route lives in its own JS chunk; the
// route bundle is fetched on demand the first time its URL is visited.
const App = lazy(() => import('./App'));
const MarketingRouter = lazy(() => import('./marketing/MarketingRouter'));
const HomeApp = lazy(() => import('./home/HomeApp'));
const SettingsApp = lazy(() => import('./settings/SettingsApp'));
const ShareViewer = lazy(() => import('./share/ShareViewer'));
const CaptureViewer = lazy(() => import('./capture/CaptureViewer'));
const TestRunner = lazy(() => import('./test/TestRunner'));
// The CookieBanner is tiny but renders on every non-tester page, so keep it
// lazy too — saves an extra request on the tester route.
const CookieBanner = lazy(() =>
  import('./marketing/CookieBanner').then((m) => ({ default: m.CookieBanner })),
);

const path = typeof location !== 'undefined' ? location.pathname : '/';

// The /t/:token tester page is shown to external participants who never log
// in or open boards — the cookie banner doesn't apply and would just be noise.
const isTesterPage = path.startsWith('/t/');

function pickRoot(): { node: React.ReactNode; label: string } {
  if (path.startsWith('/s/') || path.startsWith('/share/'))
    return { node: <ShareViewer />, label: 'share' };
  if (path.startsWith('/c/')) return { node: <CaptureViewer />, label: 'capture' };
  if (isTesterPage) return { node: <TestRunner />, label: 'test runner' };
  if (path === '/home' || path.startsWith('/home/'))
    return { node: <HomeApp />, label: 'home' };
  if (path === '/settings' || path.startsWith('/settings/'))
    return { node: <SettingsApp />, label: 'settings' };
  if (isMarketingPath(path))
    return { node: <MarketingRouter />, label: 'marketing' };
  return { node: <App />, label: 'canvas' };
}

const { node, label } = pickRoot();

// Suspense fallback is intentionally invisible — the chunk loads fast enough
// on local + behind a CDN that a flash of spinner is worse than a brief blank
// frame. Replace with a skeleton if the chunk grows past ~250 KB.
const SUSPENSE_FALLBACK: React.ReactNode = null;

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary label={label}>
      <Suspense fallback={SUSPENSE_FALLBACK}>{node}</Suspense>
    </ErrorBoundary>
    {!isTesterPage && (
      <Suspense fallback={null}>
        <CookieBanner />
      </Suspense>
    )}
  </React.StrictMode>,
);
