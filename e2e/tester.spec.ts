import { test, expect } from '@playwright/test';
import { apiCleanupByName, apiCreateTest, apiListSessions } from './helpers';

const NAME_PREFIX = 'E2E tester';

test.afterAll(async () => {
  await apiCleanupByName(NAME_PREFIX);
});

// The full tester journey on /t/:token for a voice-only test: intro → consent
// → fake-mic recording → task loop → questionnaire → upload → done, then the
// session is verified server-side.
test('tester runs a voice-only test end to end', async ({ page }) => {
  const created = await apiCreateTest({
    name: `${NAME_PREFIX} happy ${Date.now()}`,
    recordingModes: ['voice_only'],
    tasks: [{ title: 'Look around', instruction: 'Browse the homepage.' }],
    questionnaire: [
      { id: 'q-ease', kind: 'rating', prompt: 'How easy was it?', required: true },
      {
        id: 'q-notes',
        kind: 'long_text',
        prompt: 'Anything confusing?',
      },
    ],
    publish: true,
  });

  await page.goto(`/t/${created.shareToken}`);

  // Intro
  await expect(page.getByRole('heading', { name: created.name })).toBeVisible();
  await page.getByRole('button', { name: 'Continue' }).click();

  // Setup — consent + start (chromium fake media auto-grants the mic)
  await expect(page.getByText('Before you start')).toBeVisible();
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Start the test' }).click();

  // Running — task banner is up, recording
  await expect(page.getByText('Browse the homepage.')).toBeVisible();
  await page.waitForTimeout(1500); // let the recorder capture a moment

  // Single task → its button reads "Finish"
  await page.getByRole('button', { name: 'Finish' }).click();

  // Questionnaire
  await expect(page.getByText('A few last questions')).toBeVisible();
  await page.getByRole('button', { name: '4', exact: true }).click();
  await page
    .getByText('Anything confusing?')
    .locator('xpath=following-sibling::textarea')
    .fill('The pricing toggle was unclear.');
  await page.getByRole('button', { name: 'Finish' }).click();

  // Done
  await expect(page.getByRole('heading', { name: 'Thanks!' })).toBeVisible({
    timeout: 20_000,
  });

  // Verify the session landed server-side with a recording + answers.
  const sessions = await apiListSessions(created.id);
  expect(sessions.length).toBe(1);
  expect(sessions[0].status).toBe('completed');
  expect(sessions[0].recordingUrl).toBeTruthy();
  expect(sessions[0].responses?.length).toBe(2);
});

// A required questionnaire question blocks "Finish" until answered.
test('required questionnaire question is enforced', async ({ page }) => {
  const created = await apiCreateTest({
    name: `${NAME_PREFIX} required ${Date.now()}`,
    recordingModes: ['voice_only'],
    tasks: [{ title: 'Glance', instruction: 'Take a look.' }],
    questionnaire: [
      {
        id: 'q-need',
        kind: 'short_text',
        prompt: 'Required answer',
        required: true,
      },
    ],
    publish: true,
  });

  await page.goto(`/t/${created.shareToken}`);
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Start the test' }).click();
  await page.getByRole('button', { name: 'Finish' }).click();

  await expect(page.getByText('A few last questions')).toBeVisible();
  // Try to finish without answering the required question.
  await page.getByRole('button', { name: 'Finish' }).click();
  await expect(page.getByText(/is required/i)).toBeVisible();

  // Answer it and finish for real.
  await page.getByRole('textbox').first().fill('done');
  await page.getByRole('button', { name: 'Finish' }).click();
  await expect(page.getByRole('heading', { name: 'Thanks!' })).toBeVisible({
    timeout: 20_000,
  });
});

// Unknown / unpublished tokens surface a friendly error, never a blank page.
test('unknown test token shows a friendly error', async ({ page }) => {
  await page.goto('/t/definitely-not-a-real-token');
  await expect(page.getByText(/isn't available/i)).toBeVisible();
});

test('a draft test is not publicly runnable', async ({ page }) => {
  const created = await apiCreateTest({
    name: `${NAME_PREFIX} draft ${Date.now()}`,
    recordingModes: ['voice_only'],
    publish: false, // stays draft
  });
  await page.goto(`/t/${created.shareToken}`);
  await expect(page.getByText(/isn't available/i)).toBeVisible();
});
