// One-shot DOM-state capture for Foldo's key screens.
//
// Drives a headless Chromium through each screen (signed in where needed) and
// writes the rendered DOM + a screenshot to ./dom-capture/. Use it to review
// the state of every surface at a glance, or to diff screens across changes.
//
//   node scripts/capture-dom.mjs
//
// Requires the dev stack running (npm run dev). Auth is injected via the
// localStorage token a real signup mints — no UI login step.

import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const WEB = process.env.FOLDO_WEB ?? 'http://localhost:5173';
const OUT = resolve(process.cwd(), 'dom-capture');

// A signed-in session for the authed screens. Override via env if the token
// rotates. These are the credentials the test account was provisioned with.
const SESSION = {
  token:
    process.env.FOLDO_CAPTURE_TOKEN ??
    'sk_1bbe26f8e436400a28a4f34859e22200f930ba4e89eef464a5b22abe1d044389',
  user: {
    id: 'u-e0394fd7b5386469',
    name: 'Luka Dadiani',
    initial: 'L',
    color: '#7fd49a',
    email: 'luk.dadiani@me.com',
    kind: 'human',
  },
};

/** name, path, whether it needs a signed-in session, and a settle hint. */
const SCREENS = [
  { name: 'marketing-landing', path: '/', auth: false },
  { name: 'login', path: '/login', auth: false },
  { name: 'signup', path: '/signup', auth: false },
  { name: 'home-dashboard', path: '/home', auth: true },
  {
    name: 'canvas-board',
    path: '/board/board-acme-landing',
    auth: true,
    waitFor: '[data-frame-kind]',
  },
  { name: 'settings', path: '/settings', auth: true },
];

async function main() {
  await mkdir(OUT, { recursive: true });
  const browser = await chromium.launch();
  const results = [];

  for (const screen of SCREENS) {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
    });
    // Suppress the cookie banner; inject the session for authed screens.
    await context.addInitScript(
      ({ auth, session }) => {
        try {
          localStorage.setItem('foldo:cookie-acked', '1');
          if (auth) {
            localStorage.setItem('foldo:token', session.token);
            localStorage.setItem('foldo:user', JSON.stringify(session.user));
          }
        } catch {
          /* ignore */
        }
      },
      { auth: screen.auth, session: SESSION },
    );

    const page = await context.newPage();
    let status = 'ok';
    try {
      await page.goto(`${WEB}${screen.path}`, {
        waitUntil: 'domcontentloaded',
        timeout: 20_000,
      });
      if (screen.waitFor) {
        await page
          .waitForSelector(screen.waitFor, { timeout: 12_000 })
          .catch(() => {
            status = 'rendered (selector not found)';
          });
      }
      // Let async data + animations settle.
      await page.waitForTimeout(1500);

      const html = await page.content();
      const title = await page.title();
      await writeFile(resolve(OUT, `${screen.name}.html`), html, 'utf8');
      await page.screenshot({
        path: resolve(OUT, `${screen.name}.png`),
        fullPage: true,
      });
      results.push({
        screen: screen.name,
        path: screen.path,
        title,
        bytes: html.length,
        status,
      });
    } catch (err) {
      results.push({
        screen: screen.name,
        path: screen.path,
        status: `FAILED: ${err instanceof Error ? err.message : String(err)}`,
      });
    } finally {
      await context.close();
    }
  }

  await browser.close();
  await writeFile(
    resolve(OUT, 'index.json'),
    JSON.stringify({ capturedAt: new Date().toISOString(), results }, null, 2),
    'utf8',
  );

  console.log(`\nDOM capture → ${OUT}\n`);
  for (const r of results) {
    console.log(
      `  ${r.status === 'ok' ? '✓' : '!'} ${r.screen.padEnd(20)} ${r.path.padEnd(28)} ${
        r.title ? `"${r.title}"` : ''
      } ${r.status === 'ok' ? `${r.bytes}b` : r.status}`,
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
