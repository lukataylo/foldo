import { defineConfig } from '@playwright/test';

/**
 * E2E tests for the Foldo "user tests" feature — the creator builder and the
 * tester-facing /t/:token runner. The runner needs getUserMedia, so chromium
 * launches with fake-media flags so recording resolves without a real device
 * or a permission prompt.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false, // tests share one dev server + DB; run them serially
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  timeout: 45_000,
  reporter: [['list']],
  use: {
    baseURL: process.env.FOLDO_WEB ?? 'http://localhost:5173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        browserName: 'chromium',
        viewport: { width: 1440, height: 900 },
        launchOptions: {
          args: [
            '--use-fake-ui-for-media-stream',
            '--use-fake-device-for-media-stream',
            '--auto-select-desktop-capture-source=Entire screen',
          ],
        },
      },
    },
  ],
  webServer: {
    command: 'npm run dev',
    url: process.env.FOLDO_WEB ?? 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
