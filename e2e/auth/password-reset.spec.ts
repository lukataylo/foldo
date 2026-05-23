// Step 1 — real password-reset flow, end-to-end.
//
//   signup → log out → /forgot → submit email → poll outbox for the link
//   → visit /reset?token=… → set a new password → land on /home
//   → confirm the new password logs in
//   → confirm the old password no longer works
//   → confirm a pre-existing session was invalidated

import { expect, test } from '@playwright/test';
import { createUser, loginAs, loginViaApi } from '../helpers/factory';
import { deleteEmail, extractLink, waitForEmail } from '../helpers/email-outbox';

test.describe('auth: password reset', () => {
  test('end-to-end reset via email link', async ({ page, request }) => {
    const user = await createUser();
    const oldPassword = user.password;
    const newPassword = `e2e-newpw-${Date.now().toString(36)}`;

    // Pre-existing session (the token returned by signup). After the reset
    // completes, the server should have revoked this token.
    const preExistingToken = user.token;

    // 1. /forgot — submit the email.
    await page.goto('/forgot');
    await page.getByTestId('foldo-forgot-email').fill(user.email);
    await page.getByTestId('foldo-forgot-submit').click();
    await expect(page.getByTestId('foldo-forgot-confirmation')).toBeVisible();

    // 2. Read the reset link out of the stub outbox.
    const msg = await waitForEmail({ kind: 'password-reset', to: user.email });
    const resetUrl = extractLink(msg, '/reset?');

    // 3. Open the reset page + set a new password.
    await page.goto(resetUrl);
    await page.getByTestId('foldo-reset-password').fill(newPassword);
    await page.getByTestId('foldo-reset-confirm').fill(newPassword);
    await page.getByTestId('foldo-reset-submit').click();

    // 4. Server should auto-log the user in by setting localStorage + redirecting.
    await page.waitForURL(/\/home(\?|$)/, { timeout: 10_000 });

    // 5. New password works.
    const fresh = await loginViaApi(user.email, newPassword);
    expect(fresh.user.id).toBe(user.id);

    // 6. Old password is rejected.
    const oldRes = await request.post('http://localhost:4000/api/auth/login', {
      data: { email: user.email, password: oldPassword },
    });
    expect(oldRes.status()).toBe(401);

    // 7. Pre-existing session token was revoked.
    const preRes = await request.get('http://localhost:4000/api/boards', {
      headers: { Authorization: `Bearer ${preExistingToken}` },
    });
    expect(preRes.status()).toBe(401);

    await deleteEmail(msg);
  });

  test('expired or unknown token surfaces a clean error', async ({ page }) => {
    await page.goto('/reset?token=this-token-does-not-exist-and-never-will-' + Date.now());
    await page.getByTestId('foldo-reset-password').fill('this-is-a-long-enough-password');
    await page.getByTestId('foldo-reset-confirm').fill('this-is-a-long-enough-password');
    await page.getByTestId('foldo-reset-submit').click();
    await expect(page.getByTestId('foldo-reset-error')).toContainText(/invalid|expired/i);
  });

  test('forgot for an unknown email still returns success (no enumeration)', async ({ page }) => {
    await page.goto('/forgot');
    await page
      .getByTestId('foldo-forgot-email')
      .fill(`no-such-user-${Date.now().toString(36)}@foldo.test`);
    await page.getByTestId('foldo-forgot-submit').click();
    await expect(page.getByTestId('foldo-forgot-confirmation')).toBeVisible();
  });

  test('mismatched confirm field is rejected before the request', async ({ page }) => {
    await page.goto('/reset?token=' + 'a'.repeat(64));
    await page.getByTestId('foldo-reset-password').fill('a-good-strong-password');
    await page.getByTestId('foldo-reset-confirm').fill('a-different-password-oops');
    await page.getByTestId('foldo-reset-submit').click();
    await expect(page.getByTestId('foldo-reset-error')).toContainText(
      /don.?t match|do not match/i,
    );
  });
});
