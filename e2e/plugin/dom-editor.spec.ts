// Step 11 v1 spec: the DOM Editor plugin's right-panel surface mounts,
// shows the "Select an element" empty state, and the "Pick element"
// button toggles the panel into pick mode (button label + data-attr).
//
// This spec deliberately does NOT exercise the iframe-side picker —
// the iframe-side handler is a documented fast-follow (see
// inspect-bridge.ts). What it locks in:
//   - The plugin is wired into BUILTIN_PLUGINS and its rightPanel
//     surface renders.
//   - The empty-state copy is present until an element is picked.
//   - Clicking "Pick element" puts the panel into pick mode (visible
//     via the data-pick-mode attribute and the label change).

import { expect, test } from '@playwright/test';
import { createUser, loginAs } from '../helpers/factory';
import { HomePage } from '../pages/HomePage';
import { CanvasPage } from '../pages/CanvasPage';

test.describe('DOM editor plugin (rightPanel surface)', () => {
  test('Inspect panel renders empty-state + Pick element toggles pick mode', async ({
    page,
  }) => {
    const user = await createUser();
    await loginAs(page, user);

    const home = new HomePage(page);
    await home.goto();

    const boardName = `e2e-dom-editor-${Date.now().toString(36)}`;
    await home.newBoardButton().click();
    await home.nameInput().fill(boardName);
    await home.repoSlugInput().fill(`e2e-org/${boardName}`);
    await home.submitNewBoard().click();
    await home.openBoard(boardName);
    await page.waitForURL(/\/board\/.+/, { timeout: 10_000 });

    const canvas = new CanvasPage(page);
    await canvas.waitReady();

    // The right panel mounts because the DOM editor plugin contributes
    // a rightPanel tab.
    await expect(page.getByTestId('foldo-plugin-right-panel')).toBeVisible();
    const inspectTab = page.getByTestId('foldo-plugin-right-tab-inspect');
    await expect(inspectTab).toBeVisible();
    await expect(inspectTab).toContainText('Inspect');

    // Empty state — no element picked yet.
    const empty = page.getByTestId('foldo-dom-editor-empty');
    await expect(empty).toBeVisible();
    await expect(empty).toContainText('Select an element');

    // Pick button starts in the off state and shows the idle label.
    const pickBtn = page.getByTestId('foldo-dom-editor-pick');
    await expect(pickBtn).toBeVisible();
    await expect(pickBtn).toHaveAttribute('data-pick-mode', 'off');
    await expect(pickBtn).toContainText('Pick element');

    // Click → enter pick mode. Label flips, data-attr flips. The
    // iframe-side picker isn't wired yet (fast-follow), so the panel
    // stays in pick mode until a `foldo:inspect:picked` message
    // arrives — which is exactly what we assert here.
    await pickBtn.click();
    await expect(pickBtn).toHaveAttribute('data-pick-mode', 'on');
    await expect(pickBtn).toContainText('Pick mode');

    // Empty state still visible (no element picked yet); controls
    // section therefore does not appear.
    await expect(empty).toBeVisible();
    await expect(page.getByTestId('foldo-dom-editor-selector')).toHaveCount(0);
    await expect(page.getByTestId('foldo-dom-editor-save')).toHaveCount(0);

    // No console errors during the boot + pick toggle.
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.waitForTimeout(300);
    expect(errors, errors.join('\n')).toEqual([]);
  });
});
