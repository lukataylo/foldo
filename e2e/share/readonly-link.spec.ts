// Step 5.8 — read-only share link.
//
// A board owner mints a share token; an anonymous visitor opens `/s/<token>`
// in a fresh BrowserContext (no auth cookies, no localStorage) and gets the
// dedicated ShareViewer route — a static, read-only grid of frame tiles
// rendered by apps/web/src/share/ShareViewer.tsx, NOT the live multiplayer
// canvas from App.tsx.
//
// Because ShareViewer is a separate route entirely (see apps/web/src/main.tsx
// — `path.startsWith('/s/')` short-circuits to the lazy `ShareViewer` chunk),
// the read-only assertions are *structural*: the LeftRail / EditPanel /
// PluginToolBar simply aren't in the DOM. We pick three specific can't-do
// assertions per the spec brief:
//
//   (a) the canvas LeftRail (foldo-canvas-leftrail) is NOT present
//       → no tool palette exists at all
//   (b) clicking a frame tile does NOT open an EditPanel
//       (foldo-edit-panel) — the tiles are not interactive editors
//   (c) the comment-tool button (foldo-rail-tool-comment) is NOT present
//       → the visitor has no path into the comment-drop flow
//
// The flow shipped: signup user A via API → mint a share on the seeded demo
// board via `POST /api/boards/:id/shares` → open `/s/<token>` in a fresh
// `browser.newContext()` (no auth) → assert the ShareViewer mounts and
// renders frames → assert (a)(b)(c).

import {
  expect,
  test,
  type APIRequestContext,
  type Browser,
} from '@playwright/test';
import { createUser, type TestUser } from '../helpers/factory';

const API = process.env.FOLDO_API ?? 'http://localhost:4000';
// Every new signup auto-joins this board as an editor (see
// apps/server/src/routes/auth.ts), which is enough to mint a share token.
const DEMO_BOARD_ID = 'board-acme-landing';

/** Mint a share token on `boardId` as `user`. Returns the token string. */
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
  const body = (await res.json()) as { token: string; url: string };
  if (!body.token) throw new Error('share response missing token');
  return body.token;
}

/**
 * Open `/s/<token>` in a brand-new BrowserContext — no cookies, no
 * localStorage, no auth headers. The viewer must work end-to-end without
 * any session at all; that's the whole point of a public share link.
 */
async function openShareAnonymously(
  browser: Browser,
  token: string,
): Promise<{
  context: import('@playwright/test').BrowserContext;
  page: import('@playwright/test').Page;
}> {
  const context = await browser.newContext();
  const page = await context.newPage();
  // Belt-and-braces: ensure no stray storage state leaked in. A fresh
  // newContext() already has clean storage, but the goto() below guarantees
  // we're hitting the share route with no auth side-effects.
  await page.goto(`/s/${token}`);
  return { context, page };
}

test.describe('share: read-only link', () => {
  test('anonymous visitor sees frames, has no editing affordances', async ({
    browser,
    request,
  }) => {
    // ---------- 1. signup as user A + mint a share ----------
    const owner = await createUser();
    const token = await mintShare(request, owner, DEMO_BOARD_ID);

    // ---------- 2. open the share URL in a fresh, unauthenticated context ----------
    const { context, page } = await openShareAnonymously(browser, token);

    try {
      // ---------- 3. ShareViewer mounts and finishes loading ----------
      const root = page.getByTestId('foldo-share-viewer-root');
      await expect(root).toBeVisible({ timeout: 10_000 });
      // The viewer transitions loading → ready when /api/share/:token returns.
      await expect(root).toHaveAttribute('data-foldo-share-status', 'ready', {
        timeout: 10_000,
      });

      // The "you're viewing a read-only share" badge is the canonical
      // read-only signal the viewer ships today.
      await expect(
        page.getByTestId('foldo-share-readonly-badge'),
      ).toBeVisible();

      // Frames render — the demo board is seeded with multiple frames across
      // three branches, so at least one tile is guaranteed.
      const tiles = page.getByTestId('foldo-share-viewer-frame-tile');
      await expect(tiles.first()).toBeVisible({ timeout: 5_000 });
      expect(await tiles.count()).toBeGreaterThan(0);

      // ---------- 4. read-only assertion (a): no LeftRail / tool palette ----------
      // The full canvas LeftRail (foldo-canvas-leftrail) is mounted by
      // apps/web/src/App.tsx — it must NOT appear on the /s/:token route.
      await expect(page.getByTestId('foldo-canvas-leftrail')).toHaveCount(0);
      // The plugin-substrate PluginToolBar (bottom-center) is part of the
      // same App.tsx surface and also must not appear.
      await expect(
        page.locator('[data-testid^="foldo-rail-tool-"]'),
      ).toHaveCount(0);

      // ---------- 5. read-only assertion (b): clicking a tile does not open EditPanel ----------
      // The EditPanel is the right-hand dispatch surface in App.tsx; it
      // simply isn't part of the ShareViewer chunk. Clicking a frame tile
      // must remain inert with respect to the editor.
      await tiles.first().click();
      // No EditPanel anywhere in the DOM, before or after the click.
      await expect(page.getByTestId('foldo-edit-panel')).toHaveCount(0);

      // ---------- 6. read-only assertion (c): no comment-tool button ----------
      // The visitor has no path into the comment-drop flow — neither the
      // LeftRail's comment tool nor any other entry point with the
      // canonical `foldo-rail-tool-comment` testid exists.
      await expect(
        page.getByTestId('foldo-rail-tool-comment'),
      ).toHaveCount(0);
      // And the canvas comment text input (the popover composer) is
      // likewise absent — there's no comment surface to type into.
      await expect(
        page.getByTestId('foldo-comment-text-input'),
      ).toHaveCount(0);
    } finally {
      await context.close();
    }
  });

  test('share viewer fetches anonymously (no Authorization header sent)', async ({
    browser,
    request,
  }) => {
    // Belt-and-braces: prove the fetch the viewer issues to /api/share/:token
    // really does work without any auth at all. Done as a raw request so the
    // assertion doesn't depend on the rendering path.
    const owner = await createUser();
    const token = await mintShare(request, owner, DEMO_BOARD_ID);

    const anonCtx = await browser.newContext();
    try {
      const res = await anonCtx.request.get(
        `${API}/api/share/${encodeURIComponent(token)}`,
      );
      expect(res.ok()).toBe(true);
      const body = (await res.json()) as {
        readOnly: boolean;
        frames: unknown[];
        board: { id: string };
      };
      expect(body.readOnly).toBe(true);
      expect(body.board.id).toBe(DEMO_BOARD_ID);
      expect(Array.isArray(body.frames)).toBe(true);
    } finally {
      await anonCtx.close();
    }
  });

  test('revoked share token returns 404 to the viewer', async ({
    browser,
    request,
  }) => {
    // Owner mints, then revokes — the anonymous viewer should now see the
    // "no longer active" empty state, not the board.
    const owner = await createUser();
    const token = await mintShare(request, owner, DEMO_BOARD_ID);

    const revokeRes = await request.delete(
      `${API}/api/boards/${DEMO_BOARD_ID}/shares/${encodeURIComponent(token)}`,
      { headers: { Authorization: `Bearer ${owner.token}` } },
    );
    expect(revokeRes.ok()).toBe(true);

    const anonCtx = await browser.newContext();
    const page = await anonCtx.newPage();
    try {
      await page.goto(`/s/${token}`);
      const root = page.getByTestId('foldo-share-viewer-root');
      await expect(root).toBeVisible({ timeout: 10_000 });
      await expect(root).toHaveAttribute('data-foldo-share-status', 'error', {
        timeout: 10_000,
      });
      // No frame tiles render on the error state.
      await expect(
        page.getByTestId('foldo-share-viewer-frame-tile'),
      ).toHaveCount(0);
    } finally {
      await anonCtx.close();
    }
  });
});

// FOLLOW-UP — Step 5.8 gap: the spec brief asks for "comments visible
// (read-only)" on the share page. The current ShareViewer (apps/web/src/
// share/ShareViewer.tsx) fetches the comments array from
// `/api/share/:token` but does NOT render a pin layer or any per-frame
// comment summary — only a top-of-page CTA "Sign up to comment". Wiring
// a read-only comment surface into ShareViewer is out of scope for this
// PR (per the brief: "Don't fix ShareViewer itself in this PR.").
//
// When that gap closes, the assertion block below should activate without
// changes — the comments are already in the payload, so the renderer is
// the only missing piece. Two distinct read-only assertions:
//   1. a comment pin / summary for an existing seeded comment is visible
//   2. clicking the comment surface does NOT open a reply composer
//      (foldo-comment-text-input absent — already asserted above)
test.describe.skip('share: read-only comments rendered (FOLLOW-UP)', () => {
  test('seeded comments appear on the share page (read-only)', async ({
    browser,
    request,
  }) => {
    const owner = await createUser();
    const token = await mintShare(request, owner, DEMO_BOARD_ID);
    const anonCtx = await browser.newContext();
    const page = await anonCtx.newPage();
    try {
      await page.goto(`/s/${token}`);
      await expect(
        page.getByTestId('foldo-share-viewer-root'),
      ).toHaveAttribute('data-foldo-share-status', 'ready', {
        timeout: 10_000,
      });
      // Once ShareViewer renders comments, this testid should match at
      // least the seeded comment on the demo board.
      await expect(
        page.getByTestId('foldo-share-viewer-comment').first(),
      ).toBeVisible();
      // And still NO reply composer.
      await expect(
        page.getByTestId('foldo-comment-text-input'),
      ).toHaveCount(0);
    } finally {
      await anonCtx.close();
    }
  });
});
