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
// The CookieBanner is tiny but renders on every page; keep it lazy so the
// first route chunk stays lean.
const CookieBanner = lazy(() =>
  import('./marketing/CookieBanner').then((m) => ({ default: m.CookieBanner })),
);

const path = typeof location !== 'undefined' ? location.pathname : '/';

function pickRoot(): { node: React.ReactNode; label: string } {
  if (path.startsWith('/s/') || path.startsWith('/share/'))
    return { node: <ShareViewer />, label: 'share' };
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
    <Suspense fallback={null}>
      <CookieBanner />
    </Suspense>
  </React.StrictMode>,
);
