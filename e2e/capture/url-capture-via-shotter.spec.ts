// Step 4 — capture-from-URL via the local shotter, no extension required.
//
// The flow:
//   1. Sign up + create a fresh board (the e2e factory does both).
//   2. Open the canvas at /board/:id, wait for hydration.
//   3. Open "Capture from URL", paste http://localhost:5174 (the sample-app),
//      click Freeze.
//   4. The web app POSTs to the local shotter (port 5175, brought up by the
//      Playwright `webServer` block) and ships the resulting PNG to the
//      server as the new frame's `screenshot`.
//   5. Assert: an image-kind frame appears under foldo-canvas-frames, its
//      <img src> is a data URL beginning with image/png base64 bytes.
//
// All of this exercises the real path — no mocks. The shotter actually
// launches Chromium under the hood; the spec waits up to 30s for the
// round-trip to complete before failing.

import { expect, test } from '@playwright/test';
import { createBoard, createUser, loginAs } from '../helpers/factory';
import { CanvasPage } from '../pages/CanvasPage';
import { CapturePage } from '../pages/CapturePage';

// FOLLOW-UP — Step 4: requires the shotter service to be running on :5175.
// scripts/dev.mjs now boots it conditionally on FOLDO_SHOTTER_DEV=1; this
// spec needs to either also set that env or accept a longer warm-up. Skip
// pending a CI-friendly wiring (see scripts/dev.mjs).
test.describe.skip('capture: from URL via shotter', () => {
  test('opens modal, calls shotter, renders an image frame', async ({ page }) => {
    // Step 4's exit criterion is the user does nothing in chrome://extensions.
    // The test mirrors that: no extension install, only the modal.
    const user = await createUser();
    const board = await createBoard(user, `e2e-capture-${Date.now().toString(36)}`);
    await loginAs(page, user);

    const canvas = new CanvasPage(page);
    await canvas.goto(board.id);
    await canvas.waitReady();

    const capture = new CapturePage(page);
    await expect(capture.framesLayer()).toBeVisible();
    // A fresh board has no image frames yet.
    await expect(capture.imageFrames()).toHaveCount(0);

    // Pre-flight: confirm the shotter itself is reachable from the test
    // runner. If this fails, the rest of the spec can't possibly pass and
    // failing fast here gives a far clearer error than a 30s wait below.
    const shotterHealth = await page.request.get('http://localhost:5175/health');
    expect(shotterHealth.ok()).toBe(true);

    // Drive the modal end-to-end.
    await capture.captureFromUrl('http://localhost:5174');

    // The full path: modal → fetch shotter PNG → POST /api/captures → server
    // broadcasts frame.added → store upserts → ImageFrame renders.
    // The shotter cold-start can spend a few seconds launching Chromium.
    const firstImage = capture.imageFrames().first();
    await expect(firstImage).toBeVisible({ timeout: 30_000 });

    // Confirm what landed is actually a PNG, not the iframe fallback.
    const imgSrc = await firstImage.locator('img').first().getAttribute('src');
    expect(imgSrc).toBeTruthy();
    expect(imgSrc!.startsWith('data:image/png;base64,')).toBe(true);
    // base64 of a non-trivial PNG should be > 200 chars; the sample app
    // landing page is much larger than that, this just rules out an empty payload.
    expect(imgSrc!.length).toBeGreaterThan(200);
  });
});
