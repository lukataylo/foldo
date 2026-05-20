import { test, expect } from '@playwright/test';

// Full account-lifecycle auth flow against the running dev server:
//   signup → fetch verification email (dev endpoint) → verify
//   → request password reset → fetch reset email → reset → log in anew.
//
// The dev email transport keeps recent messages in an in-memory ring; the
// DEV-ONLY `GET /api/dev/last-email?to=` endpoint exposes the latest one so
// we can scrape the reset / verify links without real mail infrastructure.
// All helpers are inline here on purpose (e2e/helpers.ts is owned elsewhere).

const API = process.env.FOLDO_API ?? 'http://localhost:4000';

/** Pull a `/<path>?token=…` link of the given path out of an email's HTML. */
function extractToken(html: string, path: string): string {
  const re = new RegExp(`${path}\\?token=([A-Za-z0-9%._-]+)`);
  const m = re.exec(html);
  if (!m) throw new Error(`no ${path} link found in email`);
  return decodeURIComponent(m[1]);
}

/** Fetch the most recent dev email sent to an address (with retry). */
async function lastEmail(
  to: string,
): Promise<{ subject: string; html: string }> {
  for (let attempt = 0; attempt < 10; attempt++) {
    const res = await fetch(
      `${API}/api/dev/last-email?to=${encodeURIComponent(to)}`,
    );
    if (res.ok) {
      const json = (await res.json()) as {
        email: { subject: string; html: string };
      };
      return json.email;
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`no dev email for ${to} after retries`);
}

async function postJson(
  path: string,
  body: unknown,
): Promise<{ status: number; json: Record<string, unknown> }> {
  const res = await fetch(`${API}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  let json: Record<string, unknown> = {};
  try {
    json = (await res.json()) as Record<string, unknown>;
  } catch {
    /* empty body */
  }
  return { status: res.status, json };
}

test('signup → verify email → reset password → log in with new password', async () => {
  const stamp = Date.now();
  const email = `e2e-auth-${stamp}@example.test`;
  const originalPassword = 'original-pw-123';
  const newPassword = 'brand-new-pw-456';

  // 1. Sign up — server should report the email as not yet verified.
  const signup = await postJson('/api/auth/signup', {
    email,
    password: originalPassword,
    name: 'E2E Auth',
  });
  expect(signup.status).toBe(200);
  expect(signup.json.emailVerified).toBe(false);
  const signupToken = signup.json.token as string;
  expect(signupToken).toBeTruthy();

  // 2. The signup should have triggered a verification email.
  const verifyMail = await lastEmail(email);
  expect(verifyMail.subject).toMatch(/verify/i);
  const verifyToken = extractToken(verifyMail.html, '/verify-email');

  // 3. Verify the email; /api/auth/me now reports it verified.
  const verify = await postJson('/api/auth/verify-email', {
    token: verifyToken,
  });
  expect(verify.status).toBe(200);
  expect(verify.json.ok).toBe(true);

  const meRes = await fetch(`${API}/api/auth/me`, {
    headers: { Authorization: `Bearer ${signupToken}` },
  });
  expect(meRes.ok).toBe(true);
  const me = (await meRes.json()) as { emailVerified: boolean };
  expect(me.emailVerified).toBe(true);

  // A consumed verification token must not work twice.
  const reverify = await postJson('/api/auth/verify-email', {
    token: verifyToken,
  });
  expect(reverify.status).toBe(400);

  // 4. Request a password reset — always 200, never leaks account existence.
  const reqReset = await postJson('/api/auth/request-password-reset', {
    email,
  });
  expect(reqReset.status).toBe(200);
  expect(reqReset.json.ok).toBe(true);

  // Unknown emails get the SAME 200 response (no enumeration).
  const reqUnknown = await postJson('/api/auth/request-password-reset', {
    email: `nobody-${stamp}@example.test`,
  });
  expect(reqUnknown.status).toBe(200);

  // 5. Scrape the reset link from the reset email.
  const resetMail = await lastEmail(email);
  expect(resetMail.subject).toMatch(/reset/i);
  const resetToken = extractToken(resetMail.html, '/reset');

  // 6. Reset the password using the token.
  const reset = await postJson('/api/auth/reset-password', {
    token: resetToken,
    password: newPassword,
  });
  expect(reset.status).toBe(200);
  expect(reset.json.ok).toBe(true);

  // The reset token is single-use.
  const reuseReset = await postJson('/api/auth/reset-password', {
    token: resetToken,
    password: newPassword,
  });
  expect(reuseReset.status).toBe(400);

  // 7. The old password no longer works.
  const oldLogin = await postJson('/api/auth/login', {
    email,
    password: originalPassword,
  });
  expect(oldLogin.status).toBe(401);

  // 8. The new password logs in — email stays verified across the reset.
  const newLogin = await postJson('/api/auth/login', {
    email,
    password: newPassword,
  });
  expect(newLogin.status).toBe(200);
  expect(newLogin.json.token).toBeTruthy();
  expect(newLogin.json.emailVerified).toBe(true);
});

test('reset and verify pages render in the browser', async ({ page }) => {
  // The /reset page without a token shows the "no token" guidance.
  await page.goto('/reset');
  await expect(page.getByText('No reset token.')).toBeVisible();

  // The /verify-email page with a bogus token shows the failure state.
  await page.goto('/verify-email?token=definitely-not-valid');
  await expect(page.getByText("Couldn't verify.")).toBeVisible();

  // The forgot-password page submits and shows honest success copy.
  await page.goto('/forgot');
  await page
    .getByPlaceholder('you@company.com')
    .fill(`e2e-ui-${Date.now()}@example.test`);
  await page.getByRole('button', { name: /send me a reset link/i }).click();
  await expect(page.getByText('Check your inbox.')).toBeVisible();
});
