// Push the (authenticated) xTrade client into Foldo as an image frame on the
// demo account, then exercise the canvas screen lock / unlock featureset.
//
// Prereqs:
//   - Foldo stack running: server :4000, web on $FOLDO_WEB (default :5273).
//   - xTrade client running at :8000.
//   - A logged-in xTrade session in the persistent profile XT_PROFILE
//     (run `node scripts/xt-session.mjs`, complete B2C SSO + MFA, close window).
//
//   node scripts/xt-to-foldo.mjs
//
// Phases: A capture xTrade  ->  B push into Foldo (u-you)  ->  C lock/unlock demo.

import { chromium } from '@playwright/test';
import { mkdir, writeFile, readFile } from 'node:fs/promises';

const XT_PROFILE = '/Users/lukadadiani/Documents/Client/.xt-session';
const XT_URL = 'http://localhost:8000';
const API = process.env.FOLDO_API ?? 'http://localhost:4000';
const WEB = process.env.FOLDO_WEB ?? 'http://localhost:5273';
const OUT = '/tmp/foldo-e2e/xt';
const AUTH = { Authorization: 'Bearer u-you' }; // demo account == u-you
const JSON_AUTH = { ...AUTH, 'Content-Type': 'application/json' };
const VW = { width: 1440, height: 900 };

await mkdir(OUT, { recursive: true });
const log = (...a) => console.log('[xt-to-foldo]', ...a);

// ---------- Phase A: capture xTrade ----------
log('Phase A: capturing xTrade from', XT_URL);
const ctx = await chromium.launchPersistentContext(XT_PROFILE, {
  headless: true,
  viewport: VW,
  args: ['--no-first-run'],
});
const page = ctx.pages()[0] ?? (await ctx.newPage());
await page.goto(XT_URL, { waitUntil: 'domcontentloaded', timeout: 30_000 }).catch(() => {});
await page.waitForTimeout(6000); // let any auth redirect / app boot settle

const landedUrl = page.url();
const authBtns = await page.locator('button:has-text("Authenticate")').count();
const authed = authBtns === 0 && landedUrl.includes('localhost:8000');
const bodyText = (await page.locator('body').innerText().catch(() => '')).slice(0, 200).replace(/\s+/g, ' ');
log(`landed=${landedUrl} authButtons=${authBtns} authed=${authed}`);
log(`screen text: ${bodyText}`);

const shotPath = `${OUT}/xtrade-capture.png`;
await page.screenshot({ path: shotPath, fullPage: false });
await ctx.close();
log('captured ->', shotPath, authed ? '(AUTHENTICATED)' : '(NOT logged in — pushing login screen)');

// ---------- Phase B: push into Foldo as u-you ----------
log('Phase B: uploading capture to Foldo + creating board/frame');
const png = await readFile(shotPath);
const upRes = await fetch(`${API}/api/uploads`, {
  method: 'POST',
  headers: JSON_AUTH,
  body: JSON.stringify({
    filename: 'xtrade-capture.png',
    contentType: 'image/png',
    dataBase64: png.toString('base64'),
  }),
});
if (!upRes.ok) throw new Error(`upload ${upRes.status}: ${await upRes.text()}`);
const { url: uploadUrl } = await upRes.json();
log('uploaded ->', uploadUrl);

// Create (or reuse) the demo board.
let boardId;
const mkBoard = await fetch(`${API}/api/boards`, {
  method: 'POST',
  headers: JSON_AUTH,
  body: JSON.stringify({ name: 'xTrade — demo', repoSlug: 'client/xtrade', devUrl: XT_URL }),
});
if (mkBoard.status === 201) {
  boardId = (await mkBoard.json()).board.id;
  log('created board', boardId);
} else if (mkBoard.status === 409) {
  // Reuse the existing board for client/xtrade.
  const list = await (await fetch(`${API}/api/boards`, { headers: AUTH })).json();
  boardId = (list.boards.find((b) => b.repoSlug === 'client/xtrade') || {}).id;
  log('reusing board', boardId);
} else {
  throw new Error(`create board ${mkBoard.status}: ${await mkBoard.text()}`);
}
if (!boardId) throw new Error('no boardId resolved');

// Create the image frame carrying the capture.
const frameRes = await fetch(`${API}/api/frames`, {
  method: 'POST',
  headers: JSON_AUTH,
  body: JSON.stringify({
    boardId,
    branchId: `${boardId}:main`,
    commitSha: '0000000',
    commitMessage: 'xTrade capture',
    kind: 'image',
    position: { x: 80, y: 80 },
    size: VW,
    content: { kind: 'image', url: uploadUrl, alt: 'xTrade client', caption: 'xTrade — captured screen' },
  }),
});
if (!frameRes.ok) throw new Error(`create frame ${frameRes.status}: ${await frameRes.text()}`);
const frame = await frameRes.json();
const frameId = frame.id;
log('created image frame', frameId, 'on board', boardId);

// ---------- Phase C: lock / unlock in the Foldo web UI ----------
log('Phase C: driving lock/unlock in the Foldo canvas');
const browser = await chromium.launch();
const webCtx = await browser.newContext({ viewport: VW });
await webCtx.addInitScript(() => {
  try {
    localStorage.setItem('foldo:cookie-acked', '1');
    localStorage.setItem('foldo:demoUserId', 'u-you');
  } catch {}
});
const wp = await webCtx.newPage();
const boardUrl = `${WEB}/board/${boardId}`;
await wp.goto(boardUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 });

const frameSel = `[data-frame-id="${frameId}"]`;
await wp.locator(frameSel).first().waitFor({ state: 'visible', timeout: 15_000 });
await wp.screenshot({ path: `${OUT}/01-board-unlocked.png` });
log('board open, frame visible -> 01-board-unlocked.png');

// Open Layers panel.
await wp.getByRole('button', { name: /Open Layers/i }).click();
const row = wp.locator(`[data-layer-frame-id="${frameId}"]`).first();
await row.waitFor({ state: 'visible', timeout: 5000 });

// LOCK
await row.getByRole('button', { name: 'Lock' }).click();
await wp.waitForFunction(
  (sel) => getComputedStyle(document.querySelector(sel)).pointerEvents === 'none',
  frameSel,
  { timeout: 5000 },
);
const lockedPE = await wp.locator(frameSel).evaluate((el) => getComputedStyle(el).pointerEvents);
await wp.screenshot({ path: `${OUT}/02-locked.png` });
log(`LOCKED -> frame pointer-events=${lockedPE} -> 02-locked.png`);

// Verify lock persisted server-side.
const afterLock = await (await fetch(`${API}/api/boards/${boardId}`, { headers: AUTH })).json();
const lockedFrame = afterLock.frames.find((f) => f.id === frameId);
log('server says locked =', lockedFrame?.locked);

// UNLOCK
await row.getByRole('button', { name: 'Unlock' }).click();
await wp.waitForFunction(
  (sel) => getComputedStyle(document.querySelector(sel)).pointerEvents !== 'none',
  frameSel,
  { timeout: 5000 },
);
const unlockedPE = await wp.locator(frameSel).evaluate((el) => getComputedStyle(el).pointerEvents);
await wp.screenshot({ path: `${OUT}/03-unlocked.png` });
log(`UNLOCKED -> frame pointer-events=${unlockedPE} -> 03-unlocked.png`);

const afterUnlock = await (await fetch(`${API}/api/boards/${boardId}`, { headers: AUTH })).json();
const unlockedFrame = afterUnlock.frames.find((f) => f.id === frameId);
log('server says locked =', unlockedFrame?.locked);

await browser.close();

// ---------- summary ----------
const ok =
  lockedPE === 'none' &&
  unlockedPE !== 'none' &&
  lockedFrame?.locked === true &&
  (unlockedFrame?.locked === false || unlockedFrame?.locked == null);
const summary = {
  xtradeAuthenticated: authed,
  boardId,
  frameId,
  boardUrl,
  uploadUrl,
  lock: { pointerEvents: lockedPE, serverLocked: lockedFrame?.locked },
  unlock: { pointerEvents: unlockedPE, serverLocked: unlockedFrame?.locked },
  pass: ok,
  screenshots: [`${OUT}/01-board-unlocked.png`, `${OUT}/02-locked.png`, `${OUT}/03-unlocked.png`, shotPath],
};
await writeFile(`${OUT}/summary.json`, JSON.stringify(summary, null, 2));
log('SUMMARY', JSON.stringify(summary, null, 2));
log(ok ? 'PASS ✅ lock/unlock verified end-to-end' : 'CHECK ⚠ see summary');
process.exit(ok ? 0 : 1);
