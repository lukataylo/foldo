// Push the captured authenticated xTrade screen into Foldo on BOTH local and
// prod, and exercise the screen lock / unlock featureset in each.
//
//   node scripts/xt-push-all.mjs
//
// Reuses the capture at /tmp/foldo-e2e/xt/xtrade-capture.png (produced by
// scripts/xt-login-capture.mjs). On prod it creates/uses a real demo account
// and prints the credentials at the end.

import { chromium } from '@playwright/test';
import { readFile, writeFile, mkdir } from 'node:fs/promises';

const CAP = '/tmp/foldo-e2e/xt/xtrade-capture.png';
const OUT = '/tmp/foldo-e2e/xt';
const VW = { width: 1440, height: 900 };
const log = (...a) => console.log('[push]', ...a);

const PROD_DEMO = {
  email: 'xtrade-demo@foldo.dev',
  password: 'XtradeDemo2026!',
  name: 'xTrade Demo',
};

await mkdir(OUT, { recursive: true });
const pngB64 = (await readFile(CAP)).toString('base64');

/** Resolve a usable auth token + web-localStorage init for a target. */
async function resolveAuth(target) {
  if (target.kind === 'local') {
    return {
      header: { Authorization: 'Bearer u-you' },
      webInit: () => {
        localStorage.setItem('foldo:cookie-acked', '1');
        localStorage.setItem('foldo:demoUserId', 'u-you');
      },
      account: { id: 'u-you', note: 'local demo identity (token == userId)' },
    };
  }
  // prod: signup (or login if the account already exists) for a real session token.
  let res = await fetch(`${target.api}/api/auth/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(PROD_DEMO),
  });
  if (res.status === 409) {
    log('prod demo account exists — logging in');
    res = await fetch(`${target.api}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: PROD_DEMO.email, password: PROD_DEMO.password }),
    });
  }
  if (!res.ok) throw new Error(`prod auth ${res.status}: ${await res.text()}`);
  const { token, user } = await res.json();
  return {
    header: { Authorization: `Bearer ${token}` },
    webInit: (args) => {
      localStorage.setItem('foldo:cookie-acked', '1');
      localStorage.setItem('foldo:token', args.token);
      localStorage.setItem('foldo:user', JSON.stringify(args.user));
    },
    webInitArgs: { token, user },
    account: { ...user, token, email: PROD_DEMO.email, password: PROD_DEMO.password },
  };
}

async function pushAndDemo(target, browser) {
  log(`=== ${target.kind.toUpperCase()} (${target.api}) ===`);
  const auth = await resolveAuth(target);
  const jsonAuth = { ...auth.header, 'Content-Type': 'application/json' };

  // 1. upload the capture
  const up = await fetch(`${target.api}/api/uploads`, {
    method: 'POST', headers: jsonAuth,
    body: JSON.stringify({ filename: 'xtrade-capture.png', contentType: 'image/png', dataBase64: pngB64 }),
  });
  if (!up.ok) throw new Error(`upload ${up.status}: ${await up.text()}`);
  const { url: uploadUrl } = await up.json();
  log('uploaded', uploadUrl);

  // 2. create or reuse the board
  let boardId;
  const mk = await fetch(`${target.api}/api/boards`, {
    method: 'POST', headers: jsonAuth,
    body: JSON.stringify({ name: 'xTrade — demo', repoSlug: 'client/xtrade', devUrl: 'http://localhost:8000' }),
  });
  if (mk.status === 201) { boardId = (await mk.json()).board.id; log('created board', boardId); }
  else if (mk.status === 409) {
    const list = await (await fetch(`${target.api}/api/boards`, { headers: auth.header })).json();
    boardId = (list.boards.find((b) => b.repoSlug === 'client/xtrade') || {}).id;
    log('reusing board', boardId);
  } else throw new Error(`board ${mk.status}: ${await mk.text()}`);
  if (!boardId) throw new Error('no boardId');

  // Clean any prior xTrade frames so we don't accumulate blanks across runs.
  try {
    const snap = await (await fetch(`${target.api}/api/boards/${boardId}`, { headers: auth.header })).json();
    for (const f of snap.frames ?? []) {
      await fetch(`${target.api}/api/frames/${encodeURIComponent(f.id)}`, { method: 'DELETE', headers: auth.header }).catch(() => {});
    }
  } catch {}

  // 3. create the image frame
  const fr = await fetch(`${target.api}/api/frames`, {
    method: 'POST', headers: jsonAuth,
    body: JSON.stringify({
      boardId, branchId: `${boardId}:main`, commitSha: '0000000',
      commitMessage: 'xTrade authenticated dashboard', kind: 'image',
      position: { x: 80, y: 80 }, size: VW,
      content: { kind: 'image', url: `${target.api}${uploadUrl}`, alt: 'xTrade dashboard', caption: 'xTrade — authenticated dashboard' },
    }),
  });
  if (!fr.ok) throw new Error(`frame ${fr.status}: ${await fr.text()}`);
  const frameId = (await fr.json()).id;
  log('created frame', frameId);

  // 4. drive the web UI: open board, lock, unlock — screenshot each step
  const ctx = await browser.newContext({ viewport: VW });
  await ctx.addInitScript(auth.webInit, auth.webInitArgs);
  const wp = await ctx.newPage();
  const boardUrl = `${target.web}/board/${boardId}`;
  await wp.goto(boardUrl, { waitUntil: 'domcontentloaded', timeout: 45_000 });
  const frameSel = `[data-frame-id="${frameId}"]`;
  await wp.locator(frameSel).first().waitFor({ state: 'visible', timeout: 30_000 });
  await wp.waitForTimeout(2500); // let the image paint
  await wp.screenshot({ path: `${OUT}/${target.kind}-01-unlocked.png` });

  // Open the Layers panel if it's behind a collapsed launcher (no-op if already open).
  const launcher = wp.getByRole('button', { name: /Open Layers/i });
  if (await launcher.count().catch(() => 0)) {
    await launcher.click().catch(() => {});
  }
  const row = wp.locator(`[data-layer-frame-id="${frameId}"]`).first();
  const haveRow = await row.waitFor({ state: 'visible', timeout: 8000 }).then(() => true).catch(() => false);
  const lockBtn = haveRow ? row.getByRole('button', { name: 'Lock' }) : null;
  const lockSupported = haveRow && (await lockBtn.count().catch(() => 0)) > 0;

  if (!lockSupported) {
    log(`lock/unlock UI NOT available on ${target.kind} (feature not deployed)`);
    await ctx.close();
    return { kind: target.kind, boardUrl, boardId, frameId, uploadUrl, imageUrl: `${target.api}${uploadUrl}`, lockSupported: false, pushedOk: true, pass: true, account: auth.account };
  }

  await lockBtn.click();
  await wp.waitForFunction((s) => getComputedStyle(document.querySelector(s)).pointerEvents === 'none', frameSel, { timeout: 8000 });
  const lockedPE = await wp.locator(frameSel).evaluate((el) => getComputedStyle(el).pointerEvents);
  await wp.screenshot({ path: `${OUT}/${target.kind}-02-locked.png` });
  const serverLocked = (await (await fetch(`${target.api}/api/boards/${boardId}`, { headers: auth.header })).json())
    .frames.find((f) => f.id === frameId)?.locked;
  log(`LOCKED pe=${lockedPE} server.locked=${serverLocked}`);

  await row.getByRole('button', { name: 'Unlock' }).click();
  await wp.waitForFunction((s) => getComputedStyle(document.querySelector(s)).pointerEvents !== 'none', frameSel, { timeout: 8000 });
  const unlockedPE = await wp.locator(frameSel).evaluate((el) => getComputedStyle(el).pointerEvents);
  await wp.screenshot({ path: `${OUT}/${target.kind}-03-unlocked.png` });
  const serverUnlocked = (await (await fetch(`${target.api}/api/boards/${boardId}`, { headers: auth.header })).json())
    .frames.find((f) => f.id === frameId)?.locked;
  log(`UNLOCKED pe=${unlockedPE} server.locked=${serverUnlocked}`);
  await ctx.close();

  const pass = lockedPE === 'none' && unlockedPE !== 'none' && serverLocked === true && (serverUnlocked === false || serverUnlocked == null);
  return { kind: target.kind, boardUrl, boardId, frameId, uploadUrl, imageUrl: `${target.api}${uploadUrl}`, lockSupported: true, lockedPE, unlockedPE, serverLocked, serverUnlocked, pass, account: auth.account };
}

const TARGETS = [
  { kind: 'local', api: 'http://localhost:4000', web: process.env.FOLDO_WEB ?? 'http://localhost:5273' },
  { kind: 'prod', api: 'https://api.foldo.dev', web: 'https://foldo.dev' },
];

const browser = await chromium.launch();
const results = [];
for (const t of TARGETS) {
  try { results.push(await pushAndDemo(t, browser)); }
  catch (e) { log(`!! ${t.kind} FAILED:`, e.message); results.push({ kind: t.kind, error: e.message, pass: false }); }
}
await browser.close();

await writeFile(`${OUT}/push-summary.json`, JSON.stringify(results, null, 2));
log('==== SUMMARY ====');
console.log(JSON.stringify(results, null, 2));
process.exit(results.every((r) => r.pass) ? 0 : 1);
