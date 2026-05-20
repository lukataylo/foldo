import { test, expect, type Page } from '@playwright/test';

// E2E for board management on the /home dashboard: create a board, rename it,
// open the Members modal and invite a seeded user, change + remove that
// member, then delete the board.
//
// Auth: the home app gates on a `foldo:token` in localStorage and the server
// accepts a bare user id as a demo bearer token (see auth.ts). We seed that
// before every navigation via addInitScript so the auth gate doesn't bounce
// us to /login. Helpers here are inline — e2e/helpers.ts is off-limits.

const API = process.env.FOLDO_API ?? 'http://localhost:4000';
const ME = 'u-you';
const INVITEE = 'u-anna'; // seeded human user (Anna Cole)

/** Demo auth header — the bearer token is just the user id. */
function authHeaders(): Record<string, string> {
  return { Authorization: `Bearer ${ME}`, 'Content-Type': 'application/json' };
}

/** Best-effort: delete every board owned by ME whose name contains `needle`. */
async function cleanupBoardsByName(needle: string): Promise<void> {
  try {
    const res = await fetch(`${API}/api/home`, {
      headers: { Authorization: `Bearer ${ME}` },
    });
    if (!res.ok) return;
    const json = (await res.json()) as {
      boards: Array<{ id: string; name: string; role: string }>;
    };
    for (const b of json.boards) {
      if (b.name.includes(needle) && b.role === 'owner') {
        await fetch(`${API}/api/boards/${b.id}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${ME}` },
        }).catch(() => undefined);
      }
    }
  } catch {
    /* best-effort */
  }
}

/** Seed the localStorage token + cookie ack so /home doesn't redirect to /login. */
async function authedHome(page: Page): Promise<void> {
  await page.addInitScript((token) => {
    try {
      localStorage.setItem('foldo:token', token);
      localStorage.setItem('foldo:cookie-acked', '1');
    } catch {
      /* ignore */
    }
  }, ME);
  await page.goto('/home');
}

test('owner creates, renames, manages members, and deletes a board', async ({
  page,
}) => {
  const stamp = Date.now();
  const NAME = `E2E board ${stamp}`;
  const RENAMED = `E2E renamed ${stamp}`;
  const repoSlug = `e2e/board-${stamp}`;

  try {
    await authedHome(page);

    // ---- Create a board via the New board modal ----
    await page.getByRole('button', { name: 'New board' }).first().click();
    const createDialog = page.getByRole('dialog', { name: 'Create a new board' });
    await createDialog.getByPlaceholder('acme landing').fill(NAME);
    await createDialog.getByPlaceholder('acme/landing').fill(repoSlug);
    await createDialog.getByRole('button', { name: 'Create board' }).click();

    // The new card shows up in the grid.
    const card = page.locator('.home-card').filter({ hasText: NAME });
    await expect(card).toBeVisible();

    // ---- Rename it via the kebab menu ----
    await card.getByRole('button', { name: 'Board actions' }).click();
    await page.getByRole('menuitem', { name: 'Rename' }).click();
    const renameDialog = page.getByRole('dialog', { name: 'Rename board' });
    const renameInput = renameDialog.getByLabel('Board name');
    await renameInput.fill(RENAMED);
    await renameDialog.getByRole('button', { name: 'Save' }).click();

    const renamedCard = page.locator('.home-card').filter({ hasText: RENAMED });
    await expect(renamedCard).toBeVisible();
    await expect(page.locator('.home-card').filter({ hasText: NAME })).toHaveCount(0);

    // ---- Open Members + invite a seeded user ----
    await renamedCard.getByRole('button', { name: 'Board actions' }).click();
    await page.getByRole('menuitem', { name: 'Members' }).click();
    const membersDialog = page.getByRole('dialog', { name: /Members of/ });
    await expect(membersDialog).toBeVisible();

    // The owner (us) is listed.
    await expect(
      membersDialog.locator('[data-testid="member-row"]'),
    ).toHaveCount(1);

    // Invite by (demo) user id — Anna has no seeded email, the server
    // accepts a bare user id as a fallback for demo accounts.
    await membersDialog.getByPlaceholder('teammate@acme.dev').fill(INVITEE);
    await membersDialog.getByRole('button', { name: 'Invite' }).click();

    // Anna's row appears.
    const annaRow = membersDialog
      .locator('[data-testid="member-row"]')
      .filter({ hasText: 'Anna Cole' });
    await expect(annaRow).toBeVisible();
    await expect(
      membersDialog.locator('[data-testid="member-row"]'),
    ).toHaveCount(2);

    // ---- Change her role to viewer ----
    await annaRow.getByRole('combobox', { name: 'Role for Anna Cole' }).selectOption('viewer');
    // Optimistic — the select reflects the new value immediately.
    await expect(
      annaRow.getByRole('combobox', { name: 'Role for Anna Cole' }),
    ).toHaveValue('viewer');

    // ---- Remove her ----
    await annaRow.getByRole('button', { name: 'Remove Anna Cole' }).click();
    await expect(
      membersDialog.locator('[data-testid="member-row"]').filter({ hasText: 'Anna Cole' }),
    ).toHaveCount(0);
    await expect(
      membersDialog.locator('[data-testid="member-row"]'),
    ).toHaveCount(1);

    await membersDialog.getByRole('button', { name: 'Done' }).click();
    await expect(membersDialog).toBeHidden();

    // ---- Inviting a non-existent account surfaces a clear error ----
    await renamedCard.getByRole('button', { name: 'Board actions' }).click();
    await page.getByRole('menuitem', { name: 'Members' }).click();
    const members2 = page.getByRole('dialog', { name: /Members of/ });
    await members2.getByPlaceholder('teammate@acme.dev').fill('nobody@nowhere.test');
    await members2.getByRole('button', { name: 'Invite' }).click();
    await expect(members2.getByRole('alert')).toContainText('No Foldo account');
    await members2.getByRole('button', { name: 'Done' }).click();

    // ---- Delete the board (with confirm step) ----
    await renamedCard.getByRole('button', { name: 'Board actions' }).click();
    await page.getByRole('menuitem', { name: 'Delete board' }).click();
    const deleteDialog = page.getByRole('dialog', { name: 'Delete board' });
    await expect(deleteDialog).toBeVisible();
    await deleteDialog.getByRole('button', { name: 'Delete board' }).click();

    // The card is gone from the grid.
    await expect(
      page.locator('.home-card').filter({ hasText: RENAMED }),
    ).toHaveCount(0);
  } finally {
    await cleanupBoardsByName('E2E board ');
    await cleanupBoardsByName('E2E renamed ');
  }
});

test('a non-owner cannot rename or delete via the API', async () => {
  // Authorization guard: u-claude is an editor on the seeded demo board, not
  // an owner — rename + delete must be rejected with 403.
  const BOARD = 'board-acme-landing';
  const editorHeaders = {
    Authorization: 'Bearer u-claude',
    'Content-Type': 'application/json',
  };

  const renameRes = await fetch(`${API}/api/boards/${BOARD}`, {
    method: 'PATCH',
    headers: editorHeaders,
    body: JSON.stringify({ name: 'hijacked' }),
  });
  expect(renameRes.status).toBe(403);

  const deleteRes = await fetch(`${API}/api/boards/${BOARD}`, {
    method: 'DELETE',
    headers: { Authorization: 'Bearer u-claude' },
  });
  expect(deleteRes.status).toBe(403);

  // And an editor cannot invite members either.
  const inviteRes = await fetch(`${API}/api/boards/${BOARD}/members`, {
    method: 'POST',
    headers: editorHeaders,
    body: JSON.stringify({ email: 'u-anna', role: 'viewer' }),
  });
  expect(inviteRes.status).toBe(403);

  // Sanity: the owner of a fresh board CAN rename it.
  const created = await fetch(`${API}/api/boards`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({
      name: `E2E auth ${Date.now()}`,
      repoSlug: `e2e/auth-${Date.now()}`,
    }),
  });
  expect(created.status).toBe(201);
  const { board } = (await created.json()) as { board: { id: string } };
  const ok = await fetch(`${API}/api/boards/${board.id}`, {
    method: 'PATCH',
    headers: authHeaders(),
    body: JSON.stringify({ name: 'E2E auth renamed' }),
  });
  expect(ok.status).toBe(200);
  await fetch(`${API}/api/boards/${board.id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${ME}` },
  });
});
