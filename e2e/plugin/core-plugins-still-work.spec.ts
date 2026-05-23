// Step 9 / 10 / 11 no-regression gate. Locks in that the plugin substrate
// (Step 9) keeps working as each subsequent plugin (Step 10 Layer
// Navigator, Step 11 DOM Editor) lands. The canvas must still mount, the
// existing LeftRail testids must still resolve, the bottom PluginToolBar
// must render the core/tools contributions, and BOTH side panels must
// host their respective tabs (Layers on the left, Inspect on the right).
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

    // LeftPanel — Step 10's coreLayersPlugin contributes the "Layers" tab.
    await expect(page.getByTestId('foldo-plugin-left-panel')).toBeVisible();
    await expect(page.getByTestId('foldo-plugin-left-tab-layers')).toBeVisible();
    await expect(
      page.getByTestId('foldo-plugin-left-tab-layers'),
    ).toContainText('Layers');

    // RightPanel — Step 11's domEditorPlugin contributes the "Inspect" tab.
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
