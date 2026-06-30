// Step 5.1 — first spec on the new test-conventions track. Exercises the
// end-to-end "I signed up, I make a new board, I land on its canvas"
// flow without touching the seeded demo board. Locks the page-object +
// factory pattern in place for every later spec.

import { expect, test } from '@playwright/test';
import { createUser, loginAs } from '../helpers/factory';
import { HomePage } from '../pages/HomePage';
import { CanvasPage } from '../pages/CanvasPage';

test.describe('home: create + open a board', () => {
  test('signed-up user can create and open a board', async ({ page }) => {
    const user = await createUser();
    await loginAs(page, user);

    const home = new HomePage(page);
    await home.goto();

    const boardName = `e2e-board-${Date.now().toString(36)}`;
    const repoSlug = `e2e-org/${boardName}`;

    await home.newBoardButton().click();
    await home.nameInput().fill(boardName);
    await home.repoSlugInput().fill(repoSlug);
    await home.submitNewBoard().click();

    // The modal closes + the new card appears in the grid.
    await expect(home.boardCard(boardName).first()).toBeVisible();

    // Opening it navigates to the canvas.
    await home.openBoard(boardName);
    await page.waitForURL(/\/board\/.+/, { timeout: 10_000 });

    const canvas = new CanvasPage(page);
    await canvas.waitReady();
    await expect(canvas.topBarBoardName()).toContainText(repoSlug);
  });
});
