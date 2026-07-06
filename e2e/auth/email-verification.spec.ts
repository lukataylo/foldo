// Step 2 — end-to-end email-verification flow.
//   signup → email-outbox holds a verify link → home banner shows "verify"
//   → creating a public share link is BLOCKED (403)
//   → visit /verify?token=… → success state
//   → resending again returns alreadyVerified
//   → creating the share link now SUCCEEDS

import { expect, test } from '@playwright/test';
import { createUser, loginAs } from '../helpers/factory';
import { deleteEmail, extractLink, waitForEmail } from '../helpers/email-outbox';

test.describe('auth: email verification', () => {
  test('signup → link → verify → unblocks creating a share link', async ({ page, request }) => {
    // Explicitly opt OUT of auto-verification — this spec exercises the
    // signup → verify-link → verify flow itself, so the user MUST start
    // unverified.
    const user = await createUser({ verified: false });

    // 1. Signup should have minted + sent a verification email.
    const verifyEmail = await waitForEmail({
      kind: 'email-verification',
      to: user.email,
    });
    const verifyUrl = extractLink(verifyEmail, '/verify?');
    await deleteEmail(verifyEmail);

    // 2. Home banner is visible for the unverified user.
    await loginAs(page, user);
    await page.goto('/home');
    await expect(page.getByTestId('foldo-home-verify-banner')).toContainText(
      user.email,
    );

    // 3. Creating a public share link on the seeded demo board (signups
    // auto-join it as editors) must 403 EMAIL_NOT_VERIFIED — it's the
    // outward-facing action the verification gate protects.
    const blocked = await request.post(
      'http://localhost:4000/api/boards/board-acme-landing/shares',
      { headers: { Authorization: `Bearer ${user.token}` } },
    );
    expect(blocked.status()).toBe(403);
    const blockedBody = (await blocked.json()) as { code?: string };
    expect(blockedBody.code).toBe('EMAIL_NOT_VERIFIED');

    // 4. Click the verify link — success state renders.
    await page.goto(verifyUrl);
    await expect(page.getByTestId('foldo-verify-success')).toBeVisible();

    // 5. Resending now reports alreadyVerified=true (rate-limited but idempotent).
    const resend = await request.post(
      'http://localhost:4000/api/auth/resend-verification',
      { headers: { Authorization: `Bearer ${user.token}` } },
    );
    expect(resend.status()).toBe(200);
    const resendBody = (await resend.json()) as { alreadyVerified?: boolean };
    expect(resendBody.alreadyVerified).toBe(true);

    // 6. Creating the share link now succeeds.
    const shareOk = await request.post(
      'http://localhost:4000/api/boards/board-acme-landing/shares',
      { headers: { Authorization: `Bearer ${user.token}` } },
    );
    expect([200, 201]).toContain(shareOk.status());
    const share = (await shareOk.json()) as { token?: string; share?: { token?: string } };
    const shareToken = share.token ?? share.share?.token;
    expect(shareToken).toBeTruthy();

    // 7. Banner is gone on a fresh /home load (the cached me state is updated
    // server-side; the client refetches on navigate).
    await page.goto('/home');
    await expect(page.getByTestId('foldo-home-verify-banner')).toHaveCount(0);

    // Cleanup the share link we created.
    await request.delete(
      `http://localhost:4000/api/boards/board-acme-landing/shares/${shareToken}`,
      { headers: { Authorization: `Bearer ${user.token}` } },
    );
  });

  test('verify route surfaces a clean error for invalid/expired token', async ({ page }) => {
    await page.goto('/verify?token=this-token-doesnt-exist-anywhere-' + Date.now());
    await expect(page.getByTestId('foldo-verify-error')).toContainText(/invalid|expired/i);
  });

  test('verify route surfaces a clean error when token query param is missing', async ({ page }) => {
    await page.goto('/verify');
    await expect(page.getByTestId('foldo-verify-error')).toContainText(/missing/i);
  });
});
