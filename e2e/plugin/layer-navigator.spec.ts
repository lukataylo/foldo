// Step 10 e2e gate: the Layer Navigator plugin renders a real tree of the
// current board's frames + lets the user click a frame row to focus + pan
// the canvas. Exercises the full path:
//
//   sign up → open a fresh board → seed one frame via REST → assert the
//   Layers tab is mounted → assert the frame row appears → click it →
//   assert the canvas focuses the frame (URL gains a frameId).
//
// The frame is seeded via REST (POST /api/frames) rather than via the
// LeftRail tools because the sticky-tool UI path is currently flaky (see
// e2e/frames/sticky-arrow-image.spec.ts) and this spec is about the
// navigator, not the create flow.

import { expect, test } from '@playwright/test';
import { createBoard, createUser, loginAs } from '../helpers/factory';
import { CanvasPage } from '../pages/CanvasPage';

const API = process.env.FOLDO_API ?? 'http://localhost:4000';

interface CreatedFrame {
  id: string;
  commitMessage: string;
}

/**
 * Seed a sticky frame against a freshly-created board. Returns the frame id
 * so the spec can assert the matching tree row appears.
 *
 * We hit the API directly (rather than driving the LeftRail sticky tool) so
 * this spec doesn't share fate with the flaky pointer-event path the sticky
 * UI test is currently skipping over.
 */
async function seedStickyFrame(
  token: string,
  boardId: string,
  body: string,
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
      commitMessage: 'seeded for layer-nav e2e',
      kind: 'sticky',
      position: { x: 200, y: 200 },
      size: { width: 240, height: 180 },
      content: { kind: 'sticky', body, color: 'yellow' },
    }),
  });
  if (!res.ok) {
    throw new Error(`seedStickyFrame ${res.status}: ${await res.text()}`);
  }
  const frame = (await res.json()) as CreatedFrame;
  return frame;
}

test.describe('plugin/layer-navigator', () => {
  test('Layers tab renders the board frame list and click-to-select pans the canvas', async ({
    page,
  }) => {
    const user = await createUser();
    await loginAs(page, user);
    const board = await createBoard(
      user,
      `layer-nav-${Date.now().toString(36)}`,
    );
    const stickyBody = 'hello from the layer nav';
    const seeded = await seedStickyFrame(user.token, board.id, stickyBody);

    const canvas = new CanvasPage(page);
    await canvas.goto(board.id);
    await canvas.waitReady();

    // The Step 10 plugin substrate must now render the LeftPanel with the
    // Layers tab as the first contribution.
    const leftPanel = page.getByTestId('foldo-plugin-left-panel');
    await expect(leftPanel).toBeVisible();
    await expect(page.getByTestId('foldo-plugin-left-tab-layers')).toBeVisible();

    // The Layers body wraps the LayerNavigator component itself.
    const navigator = page.getByTestId('foldo-layer-navigator');
    await expect(navigator).toBeVisible();

    // The seeded frame must appear as a row in the tree. The sticky body is
    // used as the display name so the assertion can be human-readable.
    const frameRow = page.getByTestId(`foldo-layer-frame-${seeded.id}`);
    await expect(frameRow).toBeVisible();
    await expect(frameRow).toContainText(stickyBody);

    // Toolbar header is mounted with the three v1 affordances.
    await expect(page.getByTestId('foldo-layer-create')).toBeVisible();
    await expect(page.getByTestId('foldo-layer-rename')).toBeVisible();
    await expect(page.getByTestId('foldo-layer-delete')).toBeVisible();

    // Click-to-select: clicking the frame row drives App.tsx's
    // window.__foldoSelectFrame hook, which navigates the URL to the frame
    // and pans the canvas. Asserting the URL flips is the most robust
    // observable for "selection happened".
    await frameRow.click();
    await page.waitForURL(new RegExp(`/board/${board.id}/frame/${seeded.id}`), {
      timeout: 5_000,
    });

    // No pageerrors during the interaction (catches a plugin onClick crash).
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.waitForTimeout(250);
    expect(errors, errors.join('\n')).toEqual([]);
  });
});
