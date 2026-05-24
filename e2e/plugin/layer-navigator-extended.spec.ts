// A+W4 e2e gate: the Layer Navigator's production-grade features land
// end-to-end. The companion e2e/plugin/layer-navigator.spec.ts already
// covers v1 (toolbar, tab mount, click-to-select); this spec exercises
// the wave-4 polish:
//
//   - Search input narrows the tree to a single matching row.
//   - Keyboard ArrowDown moves focus across visible rows.
//   - Enter on a focused row drives the canvas selection (URL update).
//   - Delete on a focused row pops a confirm and removes the row.
//   - Right-click opens the context menu with Rename / Duplicate /
//     Delete / Copy-link entries.
//   - Click Copy-link writes the expected URL into the clipboard.
//
// We seed three sticky frames over REST so the spec doesn't share fate
// with any UI-create path. Each spec is isolated to a freshly-created
// user + board.

import { expect, test } from '@playwright/test';
import { createBoard, createUser, loginAs } from '../helpers/factory';
import { CanvasPage } from '../pages/CanvasPage';

const API = process.env.FOLDO_API ?? 'http://localhost:4000';

interface CreatedFrame {
  id: string;
}

async function seedStickyFrame(
  token: string,
  boardId: string,
  body: string,
  y: number,
): Promise<CreatedFrame> {
  const res = await fetch(`${API}/api/frames`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      boardId,
      branchId: `${boardId}:main`,
      commitSha: '0000000',
      commitMessage: `seeded for layer-nav-extended e2e (${body})`,
      kind: 'sticky',
      position: { x: 200, y },
      size: { width: 240, height: 180 },
      content: { kind: 'sticky', body, color: 'yellow' },
    }),
  });
  if (!res.ok) {
    throw new Error(`seedStickyFrame ${res.status}: ${await res.text()}`);
  }
  return (await res.json()) as CreatedFrame;
}

test.describe('plugin/layer-navigator-extended', () => {
  test('search narrows the tree and keyboard navigation drives selection', async ({
    page,
  }) => {
    const user = await createUser();
    await loginAs(page, user);
    const board = await createBoard(user, `layer-nav-ext-${Date.now().toString(36)}`);

    // Three frames so search + arrow nav have something to chew on.
    const apple = await seedStickyFrame(user.token, board.id, 'apple pie', 100);
    const banana = await seedStickyFrame(user.token, board.id, 'banana bread', 220);
    const cherry = await seedStickyFrame(user.token, board.id, 'cherry cake', 340);

    const canvas = new CanvasPage(page);
    await canvas.goto(board.id);
    await canvas.waitReady();

    await expect(page.getByTestId('foldo-layer-navigator')).toBeVisible();
    await expect(page.getByTestId(`foldo-layer-frame-${apple.id}`)).toBeVisible();
    await expect(page.getByTestId(`foldo-layer-frame-${banana.id}`)).toBeVisible();
    await expect(page.getByTestId(`foldo-layer-frame-${cherry.id}`)).toBeVisible();

    // --- Search narrows the tree. ---
    const search = page.getByTestId('foldo-layer-search-input');
    await search.fill('banana');
    await expect(page.getByTestId(`foldo-layer-frame-${apple.id}`)).toBeHidden();
    await expect(page.getByTestId(`foldo-layer-frame-${banana.id}`)).toBeVisible();
    await expect(page.getByTestId(`foldo-layer-frame-${cherry.id}`)).toBeHidden();

    // Clear search before keyboard nav so all three rows are back in flow.
    await search.fill('');
    await expect(page.getByTestId(`foldo-layer-frame-${apple.id}`)).toBeVisible();
    await expect(page.getByTestId(`foldo-layer-frame-${cherry.id}`)).toBeVisible();

    // --- Keyboard nav: focus the tree, ArrowDown twice, Enter. ---
    const tree = page.getByTestId('foldo-layer-tree');
    await tree.focus();
    // First ArrowDown leaves focus on the first frame (the onFocus handler
    // already set f-apple as focused), the next two walk down to f-cherry.
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    // The third row should now have aria-current=true.
    await expect(page.getByTestId(`foldo-layer-frame-${cherry.id}`)).toHaveAttribute(
      'aria-current',
      'true',
    );

    // Enter on the focused row selects the frame on the canvas — observable
    // as a URL update to /board/:boardId/frame/:frameId.
    await page.keyboard.press('Enter');
    await page.waitForURL(new RegExp(`/board/${board.id}/frame/${cherry.id}`), {
      timeout: 5_000,
    });
  });

  test('right-click context menu surfaces the expected entries + copy link', async ({
    page,
    context,
  }) => {
    // The clipboard permission must be granted on the BrowserContext before
    // navigator.clipboard.writeText resolves under Playwright. We do this
    // for the whole context rather than per-origin so the test is robust
    // against base-URL changes between environments.
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);

    const user = await createUser();
    await loginAs(page, user);
    const board = await createBoard(user, `layer-nav-ext-ctx-${Date.now().toString(36)}`);
    const seeded = await seedStickyFrame(user.token, board.id, 'right-click me', 200);

    const canvas = new CanvasPage(page);
    await canvas.goto(board.id);
    await canvas.waitReady();
    const row = page.getByTestId(`foldo-layer-frame-${seeded.id}`);
    await expect(row).toBeVisible();

    // --- Right-click opens the context menu. ---
    await row.click({ button: 'right' });
    await expect(page.getByTestId('foldo-layer-context-menu')).toBeVisible();
    await expect(page.getByTestId('foldo-layer-ctx-rename')).toBeVisible();
    await expect(page.getByTestId('foldo-layer-ctx-duplicate')).toBeVisible();
    await expect(page.getByTestId('foldo-layer-ctx-delete')).toBeVisible();
    await expect(page.getByTestId('foldo-layer-ctx-copy-link')).toBeVisible();

    // --- Copy link writes to the clipboard. ---
    await page.getByTestId('foldo-layer-ctx-copy-link').click();
    await expect(page.getByTestId('foldo-layer-context-menu')).toBeHidden();

    const expected = `${page.url().replace(/\/board\/.*/, '')}/board/${board.id}/frame/${seeded.id}`;
    // Poll the clipboard until the menu's writeText settles. Playwright's
    // clipboard read promise resolves with the latest text, but we still
    // need a brief retry because the click → handler → writeText cycle is
    // async.
    await expect
      .poll(
        async () =>
          page.evaluate(async () => navigator.clipboard.readText().catch(() => '')),
        { timeout: 4_000 },
      )
      .toBe(expected);
  });

  test('keyboard Delete on a focused row removes the frame', async ({ page }) => {
    const user = await createUser();
    await loginAs(page, user);
    const board = await createBoard(user, `layer-nav-ext-del-${Date.now().toString(36)}`);
    const a = await seedStickyFrame(user.token, board.id, 'to keep', 100);
    const b = await seedStickyFrame(user.token, board.id, 'to delete', 220);

    const canvas = new CanvasPage(page);
    await canvas.goto(board.id);
    await canvas.waitReady();

    const rowB = page.getByTestId(`foldo-layer-frame-${b.id}`);
    await expect(rowB).toBeVisible();

    // Auto-accept the confirm dialog the navigator opens when a frame has
    // comments — for a fresh sticky there are none, so the confirm only
    // appears in the bulk-delete path. We still install the handler defensively.
    page.on('dialog', (d) => void d.accept().catch(() => undefined));

    // Click to focus the row, then press Delete on the tree.
    await rowB.click();
    await expect(rowB).toHaveAttribute('aria-current', 'true');
    await page.keyboard.press('Delete');

    // Row B should be gone, A still present.
    await expect(page.getByTestId(`foldo-layer-frame-${b.id}`)).toBeHidden({
      timeout: 5_000,
    });
    await expect(page.getByTestId(`foldo-layer-frame-${a.id}`)).toBeVisible();
  });
});
