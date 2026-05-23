// Step 2 — end-to-end email-verification flow.
//   signup → email-outbox holds a verify link → home banner shows "verify"
//   → publishing a test is BLOCKED (403)
//   → visit /verify?token=… → success state
//   → resending again returns alreadyVerified
//   → publishing the test now SUCCEEDS

import { expect, test } from '@playwright/test';
import { createUser, loginAs } from '../helpers/factory';
import { deleteEmail, extractLink, waitForEmail } from '../helpers/email-outbox';

test.describe('auth: email verification', () => {
  test('signup → link → verify → unblocks publishing a test', async ({ page, request }) => {
    const user = await createUser();

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

    // 3. Try to publish a test on the seeded demo board — must 403 EMAIL_NOT_VERIFIED.
    const createRes = await request.post('http://localhost:4000/api/tests', {
      headers: { Authorization: `Bearer ${user.token}`, 'Content-Type': 'application/json' },
      data: {
        boardId: 'board-acme-landing',
        name: `e2e-verify-${Date.now().toString(36)}`,
        targetUrl: 'http://localhost:5174',
        recordingModes: ['voice_only'],
        tasks: [{ title: 'Look', instruction: 'Browse' }],
      },
    });
    // POST /api/tests is a real REST create — returns 201 Created.
    expect([200, 201]).toContain(createRes.status());
    const created = (await createRes.json()) as { test: { id: string } };
    const testId = created.test.id;

    const publishBlocked = await request.patch(
      `http://localhost:4000/api/tests/${testId}`,
      {
        headers: { Authorization: `Bearer ${user.token}`, 'Content-Type': 'application/json' },
        data: { status: 'live' },
      },
    );
    expect(publishBlocked.status()).toBe(403);
    const blockedBody = (await publishBlocked.json()) as { code?: string };
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

    // 6. Publishing now succeeds.
    const publishOk = await request.patch(
      `http://localhost:4000/api/tests/${testId}`,
      {
        headers: { Authorization: `Bearer ${user.token}`, 'Content-Type': 'application/json' },
        data: { status: 'live' },
      },
    );
    expect(publishOk.status()).toBe(200);

    // 7. Banner is gone on a fresh /home load (the cached me state is updated
    // server-side; the client refetches on navigate).
    await page.goto('/home');
    await expect(page.getByTestId('foldo-home-verify-banner')).toHaveCount(0);

    // Cleanup the test we created.
    await request.delete(`http://localhost:4000/api/tests/${testId}`, {
      headers: { Authorization: `Bearer ${user.token}` },
    });
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
