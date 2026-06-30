import { test, expect } from '@playwright/test';
import { apiCleanupByName } from './helpers';

const NAME_PREFIX = 'E2E creator';

// The creator side: open the Tests panel on the canvas, build a test, publish
// it, copy the link, open the (empty) results view, and delete it.
test('creator builds, publishes, inspects, and deletes a test', async ({
  page,
}) => {
  const name = `${NAME_PREFIX} ${Date.now()}`;
  // the Delete action uses window.confirm
  page.on('dialog', (d) => void d.accept());

  try {
    // `/` is the marketing landing; the canvas lives at `/app` (it then
    // redirects itself to /board/:boardId once the first board loads).
    await page.goto('/app');

    // Open the Tests panel from the top bar.
    await page.getByRole('button', { name: 'Tests' }).click();
    await expect(page.getByText('User tests')).toBeVisible();

    // Build a new test.
    await page.getByRole('button', { name: 'New test' }).click();
    await page
      .getByPlaceholder('e.g. Pricing page — first impressions')
      .fill(name);
    await page
      .getByPlaceholder('https://your-app.vercel.app')
      .fill('http://localhost:5174');
    await page.getByPlaceholder('Task title').fill('Look around');
    await page
      .getByPlaceholder(
        'What should the tester do? Shown in the task banner.',
      )
      .fill('Browse the homepage and think out loud.');
    await page.getByRole('button', { name: 'Create test' }).click();

    // Back on the list — the new card shows as a Draft.
    const card = page
      .locator('[data-testid="test-row"]')
      .filter({ hasText: name });
    await expect(card).toBeVisible();
    await expect(card.getByText('Draft')).toBeVisible();

    // Publish it.
    await card.getByRole('button', { name: 'Publish' }).click();
    await expect(card.getByText('Live')).toBeVisible();

    // Copy link gives feedback.
    await card.getByRole('button', { name: 'Copy link' }).click();
    await expect(card.getByText('Link copied!')).toBeVisible();

    // Results view opens and shows the empty state.
    await card.getByRole('button', { name: /^Results/ }).click();
    await expect(page.getByText('No sessions yet')).toBeVisible();
    await page.getByRole('button', { name: 'Back' }).click();

    // Delete it — the card disappears from the list.
    await card.getByRole('button', { name: 'Delete' }).click();
    await expect(
      page.locator('[data-testid="test-row"]').filter({ hasText: name }),
    ).toHaveCount(0);
  } finally {
    await apiCleanupByName(NAME_PREFIX);
  }
});
