// Opens a real, persistent-profile Chromium window at the xTrade client so a
// human can complete the B2C SSO + MFA login once. The profile (cookies +
// localStorage) is saved to disk under XT_PROFILE, so capture scripts can
// reopen the same profile already authenticated.
//
// Leave this window open, log in, then close it (or tell the agent) — the
// session persists in the profile dir either way.

import { chromium } from '@playwright/test';

const XT_PROFILE = '/Users/lukadadiani/Documents/Client/.xt-session';
const URL = 'http://localhost:8000';

const context = await chromium.launchPersistentContext(XT_PROFILE, {
  headless: false,
  viewport: { width: 1440, height: 900 },
  args: ['--no-first-run'],
});

const page = context.pages()[0] ?? (await context.newPage());
await page.goto(URL, { waitUntil: 'domcontentloaded' }).catch(() => {});

console.log(`xTrade login window open at ${URL}`);
console.log(`Profile: ${XT_PROFILE}`);
console.log('Log in (B2C SSO + MFA). The session persists to the profile dir.');

// Keep the process — and the window — alive until it's killed.
setInterval(() => {}, 1 << 30);
