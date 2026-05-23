import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import MarketingRouter, { isMarketingPath } from './marketing/MarketingRouter';
import HomeApp from './home/HomeApp';
import SettingsApp from './settings/SettingsApp';
import ShareViewer from './share/ShareViewer';
import CaptureViewer from './capture/CaptureViewer';
import TestRunner from './test/TestRunner';
import { CookieBanner } from './marketing/CookieBanner';
import { ErrorBoundary } from './components/ErrorBoundary';
import './index.css';

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

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary label={label}>{node}</ErrorBoundary>
    {!isTesterPage && <CookieBanner />}
  </React.StrictMode>,
);
