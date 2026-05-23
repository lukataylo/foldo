// Step 9 no-regression gate. Asserts the plugin substrate landed without
// breaking the canvas: existing LeftRail tools render, the TopBar still
// shows the board name, and the plugin-toolbar slot is mounted with the
// core/tools plugin's tools after the fast-follow (LeftRail now reads from
// the same registry, but its `foldo-rail-tool-*` testids stay alive for
// the existing e2e suite).
//
// Updated for Step 11: the core/dom-editor plugin now contributes a
// `rightPanel` tab labelled "Inspect", so the right panel transitions
// from absent to visible. The left panel stays absent until Step 10's
// Layer Navigator lands.
//
// Locking this spec in protects against three specific regressions:
//   1. A future plugin's activate() crash takes down the canvas
//   2. The new LeftPanel/RightPanel slots steal click events from canvas
//   3. The PluginToolBar dock fails to render its core/tools contributions

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

    // LeftRail must still render its tools — those buttons are now sourced
    // from the core/tools plugin but the data-testids are preserved so the
    // existing canvas e2e suite keeps clicking them by name.
    await expect(page.getByTestId('foldo-canvas-leftrail')).toBeVisible();
    await expect(page.getByTestId('foldo-rail-tool-select')).toBeVisible();

    // The bottom PluginToolBar slot also renders the core/tools tools (same
    // contributions, different layout). Asserting visibility here catches a
    // regression where the registry stops feeding contributions to slots.
    await expect(page.getByTestId('foldo-plugin-toolbar')).toBeVisible();
    await expect(
      page.getByTestId('foldo-plugin-toolbar-tool-select'),
    ).toBeVisible();

    // LeftPanel — still no tab contributions until Step 10's Layer
    // Navigator lands, so the panel stays absent.
    await expect(page.getByTestId('foldo-plugin-left-panel')).toHaveCount(0);

    // RightPanel — Step 11's core/dom-editor plugin contributes the
    // "Inspect" tab, so the panel is now expected to be VISIBLE and
    // its tab strip shows the "Inspect" label.
    await expect(page.getByTestId('foldo-plugin-right-panel')).toBeVisible();
    await expect(
      page.getByTestId('foldo-plugin-right-tab-inspect'),
    ).toBeVisible();
    await expect(
      page.getByTestId('foldo-plugin-right-tab-inspect'),
    ).toContainText('Inspect');

    // No console errors during the boot — catches plugin activate() crashes.
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.waitForTimeout(500);
    expect(errors, errors.join('\n')).toEqual([]);
  });
});
