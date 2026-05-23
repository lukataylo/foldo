import { defineConfig } from 'vitest/config';

// Repo-wide unit-test runner. Tests live next to the code they cover under
// __tests__/ subfolders or as *.test.ts siblings — Vitest picks both up by
// default. The Playwright e2e suite under e2e/ is intentionally excluded;
// that's `npm run test:e2e`.
export default defineConfig({
  test: {
    include: ['**/*.{test,spec}.{ts,tsx}'],
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      'e2e/**',
      'apps/web/**', // web's tests live alongside React components; Phase 4.
    ],
    // Reporters are intentionally terse; the verbose dot reporter is the
    // signal-to-noise sweet spot for a small-but-growing suite.
    reporters: ['default'],
  },
});
