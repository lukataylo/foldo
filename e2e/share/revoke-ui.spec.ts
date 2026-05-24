// A+ W2 product gaps — share-link revocation through the canvas TopBar UI.
//
// Flow:
//   1. Sign up as a fresh user, create a board, navigate to its canvas.
//   2. Mint a share token via the REST API (faster than driving the home UI).
//   3. Open the "Share links" menu via the new dropdown next to Share.
//   4. Confirm one row appears (the freshly-minted token).
//   5. Click Revoke. The row disappears from the modal.
//   6. Hit /api/share/<token> directly and assert 404.

import { expect, test, type APIRequestContext } from '@playwright/test';
import { createBoard, createUser, loginAs, type TestUser } from '../helpers/factory';

const API = process.env.FOLDO_API ?? 'http://localhost:4000';

async function mintShare(
  request: APIRequestContext,
  user: TestUser,
  boardId: string,
): Promise<string> {
  const res = await request.post(`${API}/api/boards/${boardId}/shares`, {
    headers: { Authorization: `Bearer ${user.token}` },
  });
  if (!res.ok()) {
    throw new Error(`mintShare ${res.status()}: ${await res.text()}`);
  }
  const body = (await res.json()) as { token: string };
  return body.token;
}

test.describe('share: revoke via TopBar manage modal', () => {
  test('revoke from the manage modal kills the public share token', async ({
    page,
    request,
  }) => {
    const user = await createUser();
    const board = await createBoard(user, `e2e-share-${Date.now().toString(36)}`);
    const token = await mintShare(request, user, board.id);

    // The /api/share/<token> endpoint should be live BEFORE we revoke.
    const preRes = await request.get(
      `${API}/api/share/${encodeURIComponent(token)}`,
    );
    expect(preRes.ok()).toBe(true);

    await loginAs(page, user);
    await page.goto(`/board/${board.id}`);

    // Wait for the canvas TopBar to mount.
    await expect(page.getByTestId('foldo-canvas-topbar-boardname')).toBeVisible({
      timeout: 15_000,
    });

    // Open the small share-menu chevron next to the Share button.
    await page.getByTestId('foldo-canvas-topbar-share-menu').click();
    await page.getByTestId('foldo-canvas-topbar-share-manage').click();

    // Modal renders with one row (the share we minted above).
    const modal = page.getByTestId('foldo-share-mgmt-modal');
    await expect(modal).toBeVisible();
    const rows = modal.getByTestId('foldo-share-mgmt-row');
    await expect(rows).toHaveCount(1, { timeout: 5_000 });
    await expect(rows.first()).toHaveAttribute('data-token', token);

    // Revoke.
    await rows.first().getByTestId('foldo-share-mgmt-revoke').click();

    // Optimistic UI: the row is gone (or the empty state appears).
    await expect(rows).toHaveCount(0, { timeout: 5_000 });

    // Server-side: the public /api/share/<token> route now 404s — proving
    // the revoke actually flipped revoked_at.
    const postRes = await request.get(
      `${API}/api/share/${encodeURIComponent(token)}`,
    );
    expect(postRes.status()).toBe(404);
  });
});
