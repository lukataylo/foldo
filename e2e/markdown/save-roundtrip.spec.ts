// Step 5.5 — markdown frame save-roundtrip.
//
//   signup → create a fresh board → seed a markdown frame on it via the
//   REST API → open the canvas → edit the body via the UI → click Save
//   → reload the page → assert the new body survived.
//
// The save trigger under test is the header "Save" button in MarkdownFrame.tsx
// (the same handler the textarea's ⌘-Enter shortcut calls — exercised
// through the click path so the button itself stays covered).
//
// Each test arranges its own board + frame so the assertion that "the body
// we just wrote is what comes back" doesn't race against other markdown
// frames on the shared demo board.

import { expect, test } from '@playwright/test';
import {
  createBoard,
  createMarkdownFrame,
  createUser,
  loginAs,
} from '../helpers/factory';
import { CanvasPage } from '../pages/CanvasPage';
import { MarkdownFramePage } from '../pages/MarkdownFramePage';

test.describe('markdown: save roundtrip', () => {
  test('edit body → save → reload → new body persists', async ({ page }) => {
    const user = await createUser();
    await loginAs(page, user);

    const board = await createBoard(
      user,
      `md-roundtrip-${Date.now().toString(36)}`,
    );

    const seedBody = '# Seed\n\nOriginal body line.';
    const frame = await createMarkdownFrame(user, board.id, {
      body: seedBody,
    });

    const canvas = new CanvasPage(page);
    await canvas.goto(board.id);
    await canvas.waitReady();

    const md = new MarkdownFramePage(page, frame.id);
    await md.root().scrollIntoViewIfNeeded();
    await expect(md.root()).toBeVisible({ timeout: 10_000 });
    // The body lazily fetches from /api/sources on first viewport hit; wait
    // for the seeded text to land before we replace it, otherwise the edit
    // races the fetch and we'd save against an empty draft.
    await expect(md.body()).toContainText('Original body line.', {
      timeout: 10_000,
    });

    // Enter edit mode + write a fresh body. The marker text is unique per
    // test run so the post-reload assertion can't false-positive on stale
    // content cached anywhere up the stack.
    const stamp = Date.now().toString(36);
    const nextBody = [
      '# Edited',
      '',
      `roundtrip marker ${stamp}`,
      '',
      '- bullet survives',
    ].join('\n');

    await md.startEdit();
    await md.setBody(nextBody);
    await md.save();

    // Sanity: the rendered body reflects the save before we reload.
    await expect(md.body()).toContainText(`roundtrip marker ${stamp}`, {
      timeout: 5_000,
    });
    await expect(md.body()).not.toContainText('Original body line.');

    // Hard reload — re-runs the full hydrate path (board fetch + lazy
    // /api/sources fetch for the markdown body). This is the actual
    // roundtrip gate: if the save didn't persist to the sources table the
    // pre-edit body comes back here.
    await page.reload();
    await canvas.waitReady();

    const mdAfter = new MarkdownFramePage(page, frame.id);
    await mdAfter.root().scrollIntoViewIfNeeded();
    await expect(mdAfter.body()).toContainText(`roundtrip marker ${stamp}`, {
      timeout: 10_000,
    });
    await expect(mdAfter.body()).not.toContainText('Original body line.');
  });
});
