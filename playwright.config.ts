import { defineConfig } from '@playwright/test';

/** E2E tests for the Foldo canvas, share viewer, auth and dispatch flows. */
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
    // Hosts with a pre-provisioned chromium that doesn't match the pinned
    // playwright revision can point at it (e.g. /opt/pw-browsers/chromium).
    // Unset (the normal case, incl. CI) → playwright's own browser resolve.
    launchOptions: process.env.FOLDO_CHROMIUM_PATH
      ? { executablePath: process.env.FOLDO_CHROMIUM_PATH }
      : {},
  },
  projects: [
    {
      name: 'chromium',
      use: {
        browserName: 'chromium',
        viewport: { width: 1440, height: 900 },
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
    // CI's "boot dev servers" step in .github/workflows/ci.yml already
    // launches the stack and waits for :5173 before this step runs, so
    // Playwright must reuse it — the default `!process.env.CI` causes a
    // port-in-use crash on every CI run. Locally we also reuse a stray
    // dev server so the suite is dev-friendly.
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
