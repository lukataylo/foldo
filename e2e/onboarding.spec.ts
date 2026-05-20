// Onboarding + comment-inbox E2E coverage for the plugin-arch branch:
//   * a brand-new (zero-frame) board opens to the EmptyBoardState panel with
//     its three first-frame actions, and the panel disappears once a frame
//     lands on the board
//   * the Comments inbox plugin lists a seeded comment, and clicking the row
//     focuses that comment's frame on the canvas
//
// Each test provisions its own fresh board via the REST API and tears it down
// afterwards, so it never touches the shared seeded board. Test helpers are
// inline here (e2e/helpers.ts is owned by another agent).

import { test, expect, type Page } from '@playwright/test';

const API = process.env.FOLDO_API ?? 'http://localhost:4000';
const AUTH = { Authorization: 'Bearer u-you' };
const JSON_HEADERS = { 'Content-Type': 'application/json', ...AUTH };

// ---- inline API helpers (do not edit e2e/helpers.ts) ----

async function createBoard(): Promise<{ id: string }> {
  const stamp = Date.now() + '-' + Math.floor(Math.random() * 1e6);
  const res = await fetch(`${API}/api/boards`, {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify({
      name: `E2E onboarding ${stamp}`,
      repoSlug: `e2e/onboarding-${stamp}`,
    }),
  });
  if (!res.ok) {
    throw new Error(`createBoard ${res.status}: ${await res.text()}`);
  }
  const json = (await res.json()) as { board: { id: string } };
  return json.board;
}

async function getBranch(boardId: string): Promise<{ id: string; headSha: string }> {
  const res = await fetch(`${API}/api/boards/${boardId}`, { headers: AUTH });
  if (!res.ok) throw new Error(`getBranch ${res.status}: ${await res.text()}`);
  const json = (await res.json()) as {
    branches: Array<{ id: string; headSha: string }>;
  };
  return json.branches[0];
}

async function createFrame(
  body: Record<string, unknown>,
): Promise<{ id: string }> {
  const res = await fetch(`${API}/api/frames`, {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`createFrame ${res.status}: ${await res.text()}`);
  return (await res.json()) as { id: string };
}

async function createComment(body: Record<string, unknown>): Promise<{ id: string }> {
  const res = await fetch(`${API}/api/comments`, {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`createComment ${res.status}: ${await res.text()}`);
  }
  return (await res.json()) as { id: string };
}

async function deleteBoard(id: string): Promise<void> {
  await fetch(`${API}/api/boards/${id}`, {
    method: 'DELETE',
    headers: AUTH,
  }).catch(() => undefined);
}

async function openBoard(page: Page, boardId: string): Promise<void> {
  // The cookie banner covers the bottom strip of the canvas in headless runs.
  await page.addInitScript(() => {
    try {
      localStorage.setItem('foldo:cookie-acked', '1');
    } catch {
      /* ignore */
    }
  });
  await page.goto(`/board/${boardId}`);
}

// ---- 1. empty-board onboarding state ----

test('a fresh board shows the empty-state panel until the first frame lands', async ({
  page,
}) => {
  const board = await createBoard();
  try {
    await openBoard(page, board.id);

    // The empty-state panel appears once the board hydrates with zero frames.
    const panel = page.getByTestId('empty-board-state');
    await expect(panel).toBeVisible({ timeout: 15_000 });

    // All three first-frame actions are taught.
    await expect(page.getByTestId('empty-board-capture')).toBeVisible();
    await expect(page.getByTestId('empty-board-mcp')).toBeVisible();
    await expect(page.getByTestId('empty-board-sketch')).toBeVisible();
    await expect(panel).toContainText('Capture a URL');
    await expect(panel).toContainText('Push from Claude Code');

    // Clicking "Capture a URL" opens the CaptureModal — its "Freeze this"
    // action button is unique to the open modal.
    await page.getByTestId('empty-board-capture').click();
    const cancel = page.getByRole('button', { name: 'Cancel' });
    await expect(cancel).toBeVisible({ timeout: 4_000 });
    // Close the modal so it doesn't keep the empty-state panel suppressed.
    await cancel.click();
    await expect(page.getByTestId('empty-board-state')).toBeVisible();

    // Add a frame via the API — the empty state must disappear (WS-driven).
    const branch = await getBranch(board.id);
    await createFrame({
      boardId: board.id,
      branchId: branch.id,
      commitSha: branch.headSha,
      commitMessage: 'E2E onboarding first frame',
      kind: 'sticky',
      position: { x: 0, y: 0 },
      size: { width: 220, height: 180 },
      content: { kind: 'sticky', body: 'first frame', color: 'yellow' },
    });

    await expect(page.getByTestId('empty-board-state')).toHaveCount(0, {
      timeout: 8_000,
    });
    await expect(
      page.locator('[data-frame-kind="sticky"]').first(),
    ).toBeVisible({ timeout: 8_000 });
  } finally {
    await deleteBoard(board.id);
  }
});

// ---- 2. comment inbox ----

test('the Comments inbox lists a comment and focuses its frame on click', async ({
  page,
}) => {
  const board = await createBoard();
  try {
    const branch = await getBranch(board.id);
    // Seed a frame + a comment on it.
    const frame = await createFrame({
      boardId: board.id,
      branchId: branch.id,
      commitSha: branch.headSha,
      commitMessage: 'E2E inbox frame',
      kind: 'sticky',
      position: { x: 600, y: 400 },
      size: { width: 220, height: 180 },
      content: { kind: 'sticky', body: 'inbox frame', color: 'green' },
    });
    const commentText = `E2E inbox comment ${Date.now()}`;
    await createComment({
      boardId: board.id,
      frameId: frame.id,
      text: commentText,
      pin: { x: 0.5, y: 0.5 },
    });

    await openBoard(page, board.id);
    await expect(
      page.locator(`[data-frame-id="${frame.id}"]`),
    ).toBeVisible({ timeout: 15_000 });

    // Open the Comments inbox from the right-slot collapsed launcher.
    await page.getByRole('button', { name: /Open Comments/i }).click();

    // The seeded comment is listed.
    const row = page.locator(`[data-comment-inbox-id]`).filter({
      hasText: commentText,
    });
    await expect(row).toBeVisible({ timeout: 5_000 });
    await expect(row).toContainText(commentText);

    // Clicking the row focuses the frame on the canvas and deep-links the URL
    // (path scheme: /board/:id/frame/:frameId).
    await row.click();
    await expect
      .poll(() => new URL(page.url()).pathname, { timeout: 5_000 })
      .toContain(`/frame/${frame.id}`);
  } finally {
    await deleteBoard(board.id);
  }
});
