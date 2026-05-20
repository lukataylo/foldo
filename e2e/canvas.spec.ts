// Canvas-side E2E coverage for the plugin-arch branch:
//   * canvas boots
//   * sticky / comment / html-frame tools each round-trip through the server
//   * layers panel hides/locks
//   * design inspector recolors a sticky and persists
//   * an MCP-style POST /api/frames lands on the board live
//
// Tests share the seeded `board-acme-landing` and clean up after themselves
// by deleting frames / comments whose text contains a unique per-run marker.

import { test, expect, type Page } from '@playwright/test';
import {
  apiCleanupCommentsByText,
  apiCleanupFramesByText,
  apiCreateFrame,
  apiGetBoard,
  apiPickBranch,
  E2E_BOARD_ID,
} from './helpers';

const API = process.env.FOLDO_API ?? 'http://localhost:4000';
const BOARD_URL = `/board/${E2E_BOARD_ID}`;

async function deleteFrame(id: string): Promise<void> {
  await fetch(`${API}/api/frames/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: { Authorization: 'Bearer u-you' },
  }).catch(() => undefined);
}

async function openCanvas(page: Page): Promise<void> {
  // Suppress the cookie banner before navigation — it covers the bottom
  // strip of the canvas in headless tests and intercepts mouse clicks.
  await page.addInitScript(() => {
    try {
      localStorage.setItem('foldo:cookie-acked', '1');
    } catch {
      /* ignore */
    }
  });
  await page.goto(BOARD_URL);
  // The frame switch only renders after `snap.hydrated` flips true. Pin to
  // any seeded frame to know the WS / REST hydration completed.
  await expect(
    page.locator('[data-frame-kind="app"]').first(),
  ).toBeVisible({ timeout: 15_000 });
}

/**
 * After the canvas zoom-to-fits, the seeded frames cover most of the viewport
 * width. Right of the rightmost frame is empty canvas; the TopBar only spans
 * the top center. Aim for the upper-right strip to dodge both the FirstRunHint
 * (bottom-right) and the ZoomControl (bottom-centre).
 */
async function bgClickPoint(
  page: Page,
): Promise<{ x: number; y: number }> {
  const canvas = page.locator('.canvas-surface').first();
  const box = await canvas.boundingBox();
  if (!box) throw new Error('canvas not measured');
  return {
    x: box.x + box.width - 60, // far right
    y: box.y + 240, // below the TopBar but above the frames' vertical centre
  };
}

// ----- 1. smoke -----

test('canvas boots without console errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(String(err)));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  await openCanvas(page);
  // LeftRail is mounted (Select tool is the V button).
  await expect(page.getByRole('button', { name: /Select/i })).toBeVisible();
  // The Layers launcher (collapsed by default) is in the side-panel host.
  await expect(page.getByRole('button', { name: /Open Layers/i })).toBeVisible();

  // Ignore noisy benign warnings we know about (icons fetched lazily, etc).
  const fatal = errors.filter(
    (e) =>
      !/favicon|net::ERR_BLOCKED_BY_CLIENT|the server responded with a status of/i.test(
        e,
      ),
  );
  expect(fatal, fatal.join('\n')).toEqual([]);
});

// ----- 2. sticky -----

test('drop a sticky note via the rail, persist through reload', async ({
  page,
}) => {
  const marker = `E2E sticky ${Date.now()}`;
  try {
    await openCanvas(page);

    // Pick the sticky tool.
    await page.getByRole('button', { name: /Sticky note/i }).click();
    // Click on a known-background area of the canvas.
    const pt = await bgClickPoint(page);
    await page.mouse.click(pt.x, pt.y);

    // The new sticky frame must have appeared. Stickies render a textarea
    // with the "Type a note…" placeholder.
    const newSticky = page.locator('[data-frame-kind="sticky"]').last();
    await expect(newSticky).toBeVisible({ timeout: 6_000 });

    // Type into the sticky's textarea, blur to flush.
    const ta = newSticky.locator('textarea').first();
    await ta.click();
    await ta.fill(marker);
    // Tab away so the textarea blurs (flushes via onBlur).
    await page.keyboard.press('Tab');

    // Wait for the API to ack the update before reloading.
    await expect
      .poll(
        async () => {
          const snap = await apiGetBoard();
          return snap.frames.some(
            (f) =>
              f.kind === 'sticky' &&
              String(f.content.body ?? '').includes(marker),
          );
        },
        { timeout: 8_000 },
      )
      .toBe(true);

    // Reload — the sticky should still exist with the same body.
    await page.reload();
    await expect(
      page.locator(`[data-frame-kind="sticky"] textarea`).first(),
    ).toHaveValue(marker, { timeout: 8_000 });
  } finally {
    await apiCleanupFramesByText(marker);
  }
});

// ----- 3. pinned comment -----

test('drop a pinned comment on a seeded app frame', async ({ page }) => {
  const marker = `E2E comment ${Date.now()}`;
  try {
    await openCanvas(page);

    // Pick the Comment tool, then click somewhere inside the first app frame.
    await page.getByRole('button', { name: /Comment \(C\)/i }).click();
    const appFrame = page.locator('[data-frame-kind="app"]').first();
    await expect(appFrame).toBeVisible();
    const box = await appFrame.boundingBox();
    if (!box) throw new Error('app frame not measured');
    await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.4);

    // Compose popover opens with a focused textarea — match it by placeholder.
    const popoverTa = page.getByPlaceholder('Type your comment…');
    await popoverTa.waitFor({ state: 'visible', timeout: 6_000 });
    await popoverTa.fill(marker);

    // Tab off to blur the popover textarea so onUpdateText fires.
    await page.keyboard.press('Tab');

    // The new comment should be present on the board via API.
    await expect
      .poll(
        async () => {
          const snap = await apiGetBoard();
          return snap.comments.some((c) => c.text.includes(marker));
        },
        { timeout: 8_000 },
      )
      .toBe(true);
  } finally {
    await apiCleanupCommentsByText(marker);
  }
});

// ----- 4. HTML frame plugin -----

test('create an HTML frame via the plugin tool', async ({ page }) => {
  try {
    await openCanvas(page);

    // Snapshot the existing html-frame count so we can detect the new one.
    const initial = (await apiGetBoard()).frames.filter(
      (f) => f.kind === 'html',
    ).length;

    // The HTML tool: label "HTML block (Y)".
    await page.getByRole('button', { name: /HTML block/i }).click();
    const pt = await bgClickPoint(page);
    await page.mouse.click(pt.x, pt.y);

    // A new html-kind frame should appear in the API and on the canvas.
    await expect
      .poll(
        async () =>
          (await apiGetBoard()).frames.filter((f) => f.kind === 'html').length,
        { timeout: 6_000 },
      )
      .toBeGreaterThan(initial);

    const html = page.locator('[data-frame-kind="html"]');
    await expect(html.first()).toBeVisible({ timeout: 5_000 });
    await expect(html.first()).toContainText(/Hello|New HTML block/);
  } finally {
    // Cleanup: delete every html frame on the board.
    const snap = await apiGetBoard();
    for (const f of snap.frames) {
      if (f.kind === 'html') await deleteFrame(f.id);
    }
  }
});

// ----- 5. layers panel: hide + lock -----

test('open Layers panel, hide and lock a frame', async ({ page }) => {
  await openCanvas(page);

  // Open Layers from the collapsed launcher.
  await page.getByRole('button', { name: /Open Layers/i }).click();
  // Wait for the panel to render at least one row.
  await expect(
    page.locator('[data-layer-frame-id]').first(),
  ).toBeVisible({ timeout: 4_000 });

  const firstRow = page.locator('[data-layer-frame-id]').first();
  const frameId = await firstRow.getAttribute('data-layer-frame-id');
  expect(frameId).toBeTruthy();

  // Hide via the row's Hide button.
  await firstRow.getByRole('button', { name: 'Hide' }).click();
  await expect(
    page.locator(`[data-frame-id="${frameId}"]`),
  ).toHaveCount(0, { timeout: 4_000 });

  // Show again.
  await firstRow.getByRole('button', { name: 'Show' }).click();
  await expect(
    page.locator(`[data-frame-id="${frameId}"]`),
  ).toBeVisible({ timeout: 4_000 });

  // Lock — the frame root carries the locked inline style now.
  await firstRow.getByRole('button', { name: 'Lock' }).click();
  await expect(
    page.locator(`[data-frame-id="${frameId}"]`),
  ).toHaveCSS('pointer-events', 'none', { timeout: 4_000 });

  // Restore so the test doesn't pollute the seeded board for the next run.
  await firstRow.getByRole('button', { name: 'Unlock' }).click();
});

// ----- 6. design inspector recolors a sticky -----

test('design inspector recolors a sticky and persists', async ({ page }) => {
  const marker = `E2E design ${Date.now()}`;
  let createdFrameId: string | null = null;
  page.on('console', (msg) => {
    if (msg.type() === 'error' || msg.type() === 'warning') {
      // eslint-disable-next-line no-console
      console.log(`[browser] ${msg.type()}: ${msg.text()}`);
    }
  });
  try {
    // Arrange: create a sticky via API so we don't depend on tool clicks.
    const branch = await apiPickBranch();
    const f = await apiCreateFrame({
      boardId: E2E_BOARD_ID,
      branchId: branch.id,
      commitSha: branch.headSha,
      commitMessage: marker,
      kind: 'sticky',
      position: { x: 800, y: 0 },
      size: { width: 220, height: 180 },
      content: { kind: 'sticky', body: marker, color: 'yellow' },
    });
    createdFrameId = f.id;

    await openCanvas(page);

    // The new sticky is visible on the canvas.
    const sticky = page.locator(`[data-frame-id="${f.id}"]`);
    await expect(sticky).toBeVisible({ timeout: 6_000 });

    // Open the Layers panel and click our sticky's row to select it.
    await page.getByRole('button', { name: /Open Layers/i }).click();
    const stickyRow = page
      .locator(`[data-layer-frame-id="${f.id}"]`)
      .first();
    await stickyRow.scrollIntoViewIfNeeded();
    await stickyRow.locator('button').first().click();

    // Open the Design tool, then click an empty canvas spot so its
    // onBackgroundClick fires and dispatches `foldo:openSidePanel`.
    await page.getByRole('button', { name: /Design \(D\)/i }).click();
    const dp = await bgClickPoint(page);
    await page.mouse.click(dp.x, dp.y);

    // The right-side panel opens with Fill > Background. The color input has
    // an `aria-label="Background"`; the matching text input is the next
    // sibling. We set the magenta hex via the text input to dodge the native
    // color-picker dialog.
    const bg = page.getByLabel('Background', { exact: true }).first();
    await bg.waitFor({ state: 'visible', timeout: 6_000 });
    // The aria-labelled element is the <input type="color">. Its sibling text
    // input shares the same row. Use that to drive the hex.
    const bgHex = page.locator(
      'label:has(span:text("Background")) input[type="text"]',
    );
    await bgHex.fill('#ff00aa');
    await page.keyboard.press('Tab');

    // The sticky body's background should now be magenta. The sticky body
    // is the div that directly wraps the textarea.
    const innerBg = sticky.locator('textarea').first().locator('..');
    await expect
      .poll(
        async () =>
          innerBg.evaluate((el) => getComputedStyle(el).backgroundColor),
        { timeout: 6_000 },
      )
      .toBe('rgb(255, 0, 170)');

    // Persist across reload.
    await page.reload();
    const sticky2 = page.locator(`[data-frame-id="${f.id}"]`);
    await expect(sticky2).toBeVisible({ timeout: 6_000 });
    const innerBg2 = sticky2.locator('textarea').first().locator('..');
    await expect
      .poll(
        async () =>
          innerBg2.evaluate((el) => getComputedStyle(el).backgroundColor),
        { timeout: 6_000 },
      )
      .toBe('rgb(255, 0, 170)');

  } finally {
    if (createdFrameId) await deleteFrame(createdFrameId);
  }
});

// ----- 7. MCP-style import -----

test('frames POSTed via the REST API appear on the canvas live', async ({
  page,
}) => {
  const marker = `E2E mcp import ${Date.now()}`;
  let createdFrameId: string | null = null;
  try {
    await openCanvas(page);

    // Simulate an MCP / automation insert.
    const branch = await apiPickBranch();
    const f = await apiCreateFrame({
      boardId: E2E_BOARD_ID,
      branchId: branch.id,
      commitSha: branch.headSha,
      commitMessage: marker,
      kind: 'sticky',
      position: { x: 1400, y: 1400 },
      size: { width: 220, height: 180 },
      content: { kind: 'sticky', body: marker, color: 'green' },
    });
    createdFrameId = f.id;

    // The WS should drop a frame.added event so the canvas renders it without
    // a reload.
    await expect(
      page.locator(`[data-frame-id="${f.id}"]`),
    ).toBeVisible({ timeout: 6_000 });
    await expect(
      page.locator(`[data-frame-id="${f.id}"] textarea`),
    ).toHaveValue(marker);
  } finally {
    if (createdFrameId) await deleteFrame(createdFrameId);
  }
});
