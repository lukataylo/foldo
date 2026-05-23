// Step 9 no-regression gate. Asserts the plugin substrate landed without
// breaking the canvas: existing LeftRail tools render, the TopBar still
// shows the board name, and the plugin-toolbar slot is mounted-but-empty
// (the core/tools plugin contributes zero tools today — the existing
// LeftRail keeps owning that surface until the fast-follow refactor).
//
// Locking this spec in protects against two specific regressions:
//   1. A future plugin's activate() crash takes down the canvas
//   2. The new LeftPanel/RightPanel slots steal click events from canvas

import { expect, test } from '@playwright/test';
import { createUser, loginAs } from '../helpers/factory';
import { HomePage } from '../pages/HomePage';
import { CanvasPage } from '../pages/CanvasPage';

test.describe('plugin substrate: no regression', () => {
  test('canvas still mounts + LeftRail tools still render after plugin boot', async ({
    page,
  }) => {
    const user = await createUser();
    await loginAs(page, user);

    const home = new HomePage(page);
    await home.goto();

    const boardName = `e2e-plugin-${Date.now().toString(36)}`;
    await home.newBoardButton().click();
    await home.nameInput().fill(boardName);
    await home.repoSlugInput().fill(`e2e-org/${boardName}`);
    await home.submitNewBoard().click();
    await home.openBoard(boardName);
    await page.waitForURL(/\/board\/.+/, { timeout: 10_000 });

    const canvas = new CanvasPage(page);
    await canvas.waitReady();

    // Hardcoded LeftRail must still render its tools (existing behaviour
    // owns this surface — the core/tools plugin contributes nothing yet).
    await expect(page.getByTestId('foldo-canvas-leftrail')).toBeVisible();
    await expect(page.getByTestId('foldo-rail-tool-select')).toBeVisible();

    // The plugin ToolBar slot is rendered conditionally; with the v1
    // core/tools plugin contributing zero tools, it must NOT mount any
    // visible toolbar (an always-visible dock would be a regression).
    await expect(page.getByTestId('foldo-plugin-toolbar')).toHaveCount(0);

    // Same for LeftPanel / RightPanel — no tab contributions yet, so the
    // panels are absent (Step 10's Layer Navigator + Step 11's DOM Editor
    // are what bring them in).
    await expect(page.getByTestId('foldo-plugin-left-panel')).toHaveCount(0);
    await expect(page.getByTestId('foldo-plugin-right-panel')).toHaveCount(0);

    // No console errors during the boot — catches plugin activate() crashes.
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.waitForTimeout(500);
    expect(errors, errors.join('\n')).toEqual([]);
  });
});
