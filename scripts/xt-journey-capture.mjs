// Open xTrade (persistent profile), wait for B2C+MFA login, then auto-traverse
// the main nav capturing the WHOLE DOM state + a screenshot at each screen.
//
// Each screen is serialized as a self-contained HTML file: a <base href> is
// injected so relative asset/stylesheet URLs resolve against the live app
// origin, and <script> tags are stripped so the SPA can't re-boot or redirect
// to login — i.e. a static but faithfully-styled snapshot of the rendered DOM.
//
//   node scripts/xt-journey-capture.mjs
//
// Writes screen-NN.{html,png} + journey.json to /tmp/foldo-e2e/xt/journey/.

import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';

const PROFILE = '/Users/lukadadiani/Documents/Client/.xt-session';
const XT_URL = 'http://localhost:8000';
const OUT = '/tmp/foldo-e2e/xt/journey';
const DEADLINE_MS = 10 * 60 * 1000;
const log = (...a) => console.log('[journey]', ...a);

// Main-nav destinations to visit (by visible label). Best-effort: missing ones
// are skipped. The landing screen is always captured first.
const NAV = ['Dashboard', 'New quote', 'Risk editor'];

function serializeDom(origin) {
  // Runs in the page. Clone <html>, inject <base>, strip scripts.
  const root = document.documentElement.cloneNode(true);
  root.querySelectorAll('script').forEach((s) => s.remove());
  root.querySelectorAll('[onclick],[onload],[onerror]').forEach((el) => {
    for (const a of [...el.attributes]) if (a.name.startsWith('on')) el.removeAttribute(a.name);
  });
  let head = root.querySelector('head');
  if (!head) { head = document.createElement('head'); root.insertBefore(head, root.firstChild); }
  const base = document.createElement('base');
  base.setAttribute('href', origin + '/');
  head.insertBefore(base, head.firstChild);
  return '<!doctype html>\n' + root.outerHTML;
}

await mkdir(OUT, { recursive: true });
const ctx = await chromium.launchPersistentContext(PROFILE, {
  headless: false, viewport: { width: 1440, height: 900 }, args: ['--no-first-run'],
});
const page = ctx.pages()[0] ?? (await ctx.newPage());

// Intercept image/font responses as the live (authenticated) app loads them.
// The wallpaper/logo on the client's Azure blob are auth+Referer gated and 403
// for any later anonymous re-fetch, so we capture their bytes here and inline
// them as data: URLs to make the snapshot self-contained.
const assets = new Map();
page.on('response', async (resp) => {
  try {
    const u = resp.url();
    if (resp.status() !== 200) return;
    if (!/blob\.core\.windows\.net|\.(jpe?g|png|svg|webp|gif|woff2?|ico)(\?|$)/i.test(u)) return;
    const buf = await resp.body();
    if (!buf || buf.length === 0 || buf.length > 4 * 1024 * 1024) return;
    const ct = (resp.headers()['content-type'] || 'application/octet-stream').split(';')[0];
    assets.set(u, `data:${ct};base64,${buf.toString('base64')}`);
  } catch { /* body may be unavailable; skip */ }
});

await page.goto(XT_URL, { waitUntil: 'domcontentloaded' }).catch(() => {});

log('>>> Complete B2C SSO + MFA in the window. Auto-capturing the journey once logged in...');
// Require POSITIVE proof of the authenticated app — the Dashboard + New quote
// nav both visible — not merely the absence of the Authenticate button (which
// briefly disappears mid-redirect and produced false positives / sparse snaps).
const start = Date.now();
let authed = false;
while (Date.now() - start < DEADLINE_MS) {
  await page.waitForTimeout(3000);
  let u = ''; try { u = page.url(); } catch { continue; }
  if (/b2clogin\.com|microsoftonline\.com/.test(u)) continue;
  if (!u.includes('localhost:8000')) continue;
  const hasDash = await page.getByText('Dashboard', { exact: false }).count().catch(() => 0);
  const hasNewQuote = await page.getByText('New quote', { exact: false }).count().catch(() => 0);
  const authBtn = await page.locator('button:has-text("Authenticate")').count().catch(() => 1);
  if (hasDash > 0 && hasNewQuote > 0 && authBtn === 0) {
    await page.waitForTimeout(2500); // confirm stable
    if ((await page.getByText('Dashboard', { exact: false }).count().catch(() => 0)) > 0) { authed = true; break; }
  }
}
if (!authed) { log('NOT_AUTHED — authenticated dashboard not detected in time'); await ctx.close(); process.exit(2); }
await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
await page.waitForTimeout(3000); // let wallpaper/assets finish loading (for interception)
log('authenticated — traversing journey');

const screens = [];
async function capture(name) {
  await page.waitForTimeout(2500);
  const origin = new URL(page.url()).origin;
  let html = await page.evaluate(serializeDom, origin);
  // Inline every intercepted asset so the wallpaper/logo render without a live
  // (auth-gated) re-fetch.
  let inlined = 0;
  for (const [u, dataUrl] of assets) {
    if (html.includes(u)) { html = html.split(u).join(dataUrl); inlined++; }
  }
  const file = `${OUT}/${String(screens.length).padStart(2, '0')}-${name}`;
  await writeFile(`${file}.html`, html);
  await page.screenshot({ path: `${file}.png`, fullPage: false });
  const title = await page.title().catch(() => '');
  screens.push({ name, htmlFile: `${file}.html`, pngFile: `${file}.png`, url: page.url(), title, bytes: html.length });
  log(`captured "${name}" (${html.length} bytes DOM, ${inlined} assets inlined)`);
}

await capture('landing');
for (const label of NAV) {
  try {
    const el = page.getByText(label, { exact: false }).first();
    if (!(await el.count())) { log(`nav "${label}" not found — skip`); continue; }
    await el.click({ timeout: 5000 });
    await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
    await capture(label.toLowerCase().replace(/\s+/g, '-'));
  } catch (e) { log(`nav "${label}" failed: ${e.message}`); }
}

await writeFile(`${OUT}/journey.json`, JSON.stringify(screens, null, 2));
log(`DONE — ${screens.length} screens captured`);
console.log('JOURNEY ' + JSON.stringify(screens.map((s) => ({ name: s.name, bytes: s.bytes })), null, 2));
await ctx.close();
process.exit(0);
