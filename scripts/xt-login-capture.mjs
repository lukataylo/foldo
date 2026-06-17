// Opens the xTrade client in a headed persistent-profile window, waits for the
// human to complete B2C SSO + MFA, then captures the authenticated screen from
// the SAME live context (no profile handoff -> no lost-session risk).
//
//   node scripts/xt-login-capture.mjs
//
// Writes the capture to /tmp/foldo-e2e/xt/xtrade-capture.png and exits 0 on
// success, 2 if login wasn't completed within the timeout.

import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

const PROFILE = '/Users/lukadadiani/Documents/Client/.xt-session';
const URL = 'http://localhost:8000';
const OUT = '/tmp/foldo-e2e/xt/xtrade-capture.png';
const DEADLINE_MS = 10 * 60 * 1000; // 10 min for SSO + MFA

await mkdir('/tmp/foldo-e2e/xt', { recursive: true });
const ctx = await chromium.launchPersistentContext(PROFILE, {
  headless: false,
  viewport: { width: 1440, height: 900 },
  args: ['--no-first-run'],
});
const page = ctx.pages()[0] ?? (await ctx.newPage());
await page.goto(URL, { waitUntil: 'domcontentloaded' }).catch(() => {});

console.log('>>> xTrade window open at', URL);
console.log('>>> Complete B2C SSO + MFA in the window. Auto-capturing once logged in...');

const start = Date.now();
let authed = false;
while (Date.now() - start < DEADLINE_MS) {
  await page.waitForTimeout(3000);
  let url = '';
  try { url = page.url(); } catch { continue; }
  if (/b2clogin\.com|microsoftonline\.com|login\.live/.test(url)) continue; // mid-login redirect
  if (!url.includes('localhost:8000')) continue;
  const authBtn = await page.locator('button:has-text("Authenticate")').count().catch(() => 1);
  if (authBtn === 0) {
    await page.waitForTimeout(2500); // settle, then re-confirm it's stable
    const again = await page.locator('button:has-text("Authenticate")').count().catch(() => 1);
    if (again === 0) { authed = true; break; }
  }
}

if (!authed) {
  console.log('NOT_AUTHED — login not detected within timeout');
  await ctx.close();
  process.exit(2);
}

await page.waitForTimeout(2500); // let the authenticated view paint fully
await page.screenshot({ path: OUT, fullPage: false });
const title = await page.title().catch(() => '');
const text = (await page.locator('body').innerText().catch(() => '')).replace(/\s+/g, ' ').slice(0, 180);
console.log('CAPTURED', OUT, '| title:', title);
console.log('screen:', text);
await ctx.close();
process.exit(0);
