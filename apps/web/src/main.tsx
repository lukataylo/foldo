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
import './index.css';

const path = typeof location !== 'undefined' ? location.pathname : '/';

// The /t/:token tester page is shown to external participants who never log
// in or open boards — the cookie banner doesn't apply and would just be noise.
const isTesterPage = path.startsWith('/t/');

function pickRoot(): React.ReactNode {
  if (path.startsWith('/s/') || path.startsWith('/share/')) return <ShareViewer />;
  if (path.startsWith('/c/')) return <CaptureViewer />;
  if (isTesterPage) return <TestRunner />;
  if (path === '/home' || path.startsWith('/home/')) return <HomeApp />;
  if (path === '/settings' || path.startsWith('/settings/')) return <SettingsApp />;
  if (isMarketingPath(path)) return <MarketingRouter />;
  return <App />;
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {pickRoot()}
    {!isTesterPage && <CookieBanner />}
  </React.StrictMode>,
);
