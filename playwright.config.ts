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
  // Production smoke specs (e2e/deploy/*.spec.ts) talk to the live
  // api.foldo.dev surface — they don't need a local dev server. Skip the
  // webServer block when RUN_PROD_SMOKE=1 is set so the runner doesn't
  // boot `npm run dev` for nothing (and so this spec can run on a CI
  // job that doesn't have the full stack installed).
  webServer: process.env.RUN_PROD_SMOKE === '1' ? undefined : {
    command: 'npm run dev',
    url: process.env.FOLDO_WEB ?? 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      // Bring the shotter up alongside server/web/sample so Step 4's
      // capture-from-URL spec has a real backend without booting a second
      // dev server. Off in plain `npm run dev` — set explicitly here so the
      // suite is self-contained.
      FOLDO_SHOTTER_DEV: '1',
      // The spec asks the shotter to screenshot http://localhost:5174 (the
      // sample-app). The shotter's SSRF guard rejects private hostnames by
      // default; flip it on for e2e.
      FOLDO_SHOT_ALLOW_PRIVATE: '1',
      // Wire the canvas's Capture modal at build time so it knows where the
      // shotter lives. Vite inlines this into the bundle on first hit.
      VITE_SHOTTER_URL: 'http://localhost:5175',
    },
  },
});
