// Step 5.4 — "make edit from comment".
//
//   1. Drop a comment pin on the seeded markdown frame via the comment
//      tool (UI click — exercises the optimistic-comment swap + the
//      `comment.added` WS broadcast).
//   2. Type a body + Cmd+Enter → comment persists.
//   3. Click the pin → CommentPopover re-opens in read mode.
//   4. Click "Make this an edit" → CommentPopover closes, EditPanel mounts.
//   5. Assert the EditPanel intent textarea is pre-filled with the comment
//      text so the dispatch flow opens with the comment as the initial
//      intent.
//
// PIN-DROP FIX (A+ W2): both halves of the 5.4 flake are addressed:
//   1. The optimistic-comment swap in `useCommentHandlers.handleDropPin`
//      now preserves text typed during the in-flight POST (the previous
//      flake — empty `text:''` from the POST body overwriting the user's
//      typed body when the server response landed).
//   2. `onMakeEditFromComment` now synthesises a SelectedElement from
//      the comment's `pin` + frame for pin-only markdown (and app) frames
//      so the EditPanel mounts even when the comment has no code `target`
//      or doc `anchor`. The new branch lives directly below the existing
//      `c.anchor && f.kind === 'markdown'` branch.

import { expect, test } from '@playwright/test';
import { createUser, loginAs } from '../helpers/factory';
import { CanvasPage } from '../pages/CanvasPage';

const DEMO_BOARD_ID = 'board-acme-landing';
// Seeded markdown frame on the demo board — every new signup auto-joins
// this board so the frame is always present. We pin on the markdown frame
// because it doesn't depend on the sample-app iframe being live (mirrors
// the 5.3 / 5.6 specs).
const SEED_MD_FRAME = 'f-cta-prd';

test.describe('comments: make edit from comment', () => {
  test('pin → comment → make-edit opens EditPanel with intent pre-filled', async ({
    page,
  }) => {
    const user = await createUser();
    await loginAs(page, user);

    const canvas = new CanvasPage(page);
    await canvas.goto(DEMO_BOARD_ID);
    await canvas.waitReady();

    // ---------- 1. Drop the pin on the seeded markdown frame ----------
    const mdFrame = page.locator(
      `[data-testid="foldo-markdown-frame"][data-foldo-frame-id="${SEED_MD_FRAME}"]`,
    );
    await mdFrame.scrollIntoViewIfNeeded();
    await expect(mdFrame).toBeVisible({ timeout: 15_000 });

    await canvas.selectTool('comment');
    const mdBox = await mdFrame.boundingBox();
    if (!mdBox) throw new Error('markdown frame had no bounding box');
    // Same placement the 5.3 / 5.6 specs use — ~40% across, ~30% down,
    // well inside the frame body and away from the header.
    await page.mouse.click(
      mdBox.x + mdBox.width * 0.4,
      mdBox.y + mdBox.height * 0.3,
    );

    // ---------- 2. Compose the body ----------
    const composer = page.getByTestId('foldo-comment-text-input');
    await expect(composer).toBeVisible({ timeout: 5_000 });
    const bodyText = `make this an h1 instead — ${Date.now().toString(36)}`;
    await composer.fill(bodyText);
    await composer.press('Meta+Enter');

    // Popover should close + a pin appears on the frame.
    await expect(page.getByTestId('foldo-comment-popover')).toHaveCount(0, {
      timeout: 5_000,
    });
    const pin = page.getByTestId('foldo-comment-pin').first();
    await expect(pin).toBeVisible({ timeout: 10_000 });

    // ---------- 3. Click the pin → popover re-opens in read mode ----------
    await pin.click();
    const popover = page.getByTestId('foldo-comment-popover');
    await expect(popover).toBeVisible();
    await expect(page.getByTestId('foldo-comment-text')).toContainText(bodyText);

    // ---------- 4. Click "Make this an edit" ----------
    await page.getByTestId('foldo-comment-make-edit').click();

    // Popover closes — `onMakeEditFromComment` clears commentPopover.
    await expect(popover).toHaveCount(0, { timeout: 5_000 });

    // ---------- 5. EditPanel mounts, intent pre-filled with comment text -----
    const editPanel = page.getByTestId('foldo-edit-panel');
    await expect(editPanel).toBeVisible({ timeout: 5_000 });

    const intent = page.getByTestId('foldo-edit-panel-intent');
    await expect(intent).toBeVisible();
    await expect(intent).toHaveValue(bodyText);
  });
});
