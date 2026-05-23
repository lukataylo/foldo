import { defineConfig } from 'vitest/config';

// Repo-wide unit-test runner. Tests live next to the code they cover under
// __tests__/ subfolders or as *.test.ts siblings — Vitest picks both up by
// default. The Playwright e2e suite under e2e/ is intentionally excluded;
// that's `npm run test:e2e`.
//
// apps/web is mostly excluded (its React component tests will need jsdom +
// testing-library — Phase 4), but the plugins/ subtree is opted IN because
// each plugin is a self-contained module exercising pure logic (postMessage
// helpers, style serialisers, …) that Node-only Vitest can run as-is.
export default defineConfig({
  test: {
    include: ['**/*.{test,spec}.{ts,tsx}'],
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      'e2e/**',
      'apps/web/src/components/**',
      'apps/web/src/state/**',
      'apps/web/src/hooks/**',
      'apps/web/src/api/**',
      'apps/web/src/capture/**',
      'apps/web/src/data/**',
      'apps/web/src/home/**',
      'apps/web/src/iframe/**',
      'apps/web/src/marketing/**',
      'apps/web/src/multiplayer/**',
      'apps/web/src/routing/**',
      'apps/web/src/settings/**',
      'apps/web/src/share/**',
      'apps/web/src/test/**',
      'apps/web/src/plugins/slots/**',
    ],
    // Reporters are intentionally terse; the verbose dot reporter is the
    // signal-to-noise sweet spot for a small-but-growing suite.
    reporters: ['default'],
  },
});
