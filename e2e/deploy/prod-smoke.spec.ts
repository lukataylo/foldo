// Post-deploy smoke gate. Hits the LIVE Foldo API surface and confirms
// the basics: /health responds, /metrics serves Prometheus exposition
// with the Foldo counter registered, and an authenticated endpoint
// accepts a scrape-only token.
//
// Gated by `RUN_PROD_SMOKE=1` so it never runs in the standard PR CI —
// PR CI spins up a local dev server which has no api.foldo.dev surface.
// Wire this into a post-deploy GitHub Action (repository_dispatch from
// the Railway deploy webhook) for an automatic gate; see
// docs/DEPLOYMENT.md §6.
//
// Env:
//   RUN_PROD_SMOKE         — must be `1` for the spec to run (otherwise skip)
//   FOLDO_PROD_BASE        — default https://api.foldo.dev
//   FOLDO_PROD_SMOKE_TOKEN — optional; when set, the auth check runs.
//                            When unset, the auth check is marked skip.

import { expect, test } from '@playwright/test';

const SHOULD_RUN = process.env.RUN_PROD_SMOKE === '1';
// `||` not `??`: the post-deploy workflow exports FOLDO_PROD_BASE='' when the
// dispatch payload carries no base_url, and an empty string must still fall
// back to the default (an empty BASE makes every request an invalid URL).
const BASE = (process.env.FOLDO_PROD_BASE || 'https://api.foldo.dev').replace(/\/+$/, '');
const TOKEN = process.env.FOLDO_PROD_SMOKE_TOKEN ?? '';

// `test.describe.skip` when the gate is off — the spec still appears in
// `--list` so a reader sees it exists; it just doesn't execute. The
// alternative (a top-level early return) would silently drop the file.
const describe = SHOULD_RUN ? test.describe : test.describe.skip;

describe('deploy: production smoke', () => {
  // Each check uses `request` rather than driving a browser — the API
  // surface is what we're verifying, no UI needed. Playwright's
  // APIRequestContext gives us per-request timeouts and a nicer report
  // than a raw fetch.

  test('GET /health returns ok', async ({ request }) => {
    const res = await request.get(`${BASE}/health`, { timeout: 10_000 });
    expect(res.status(), 'health status').toBe(200);
    const body = await res.json();
    expect(body, 'health body').toMatchObject({ ok: true });
    expect(typeof body.ts, 'health ts is a string').toBe('string');
  });

  test('GET /metrics serves Prometheus exposition with Foldo counter', async ({
    request,
  }) => {
    const res = await request.get(`${BASE}/metrics`, { timeout: 10_000 });
    expect(res.status(), 'metrics status').toBe(200);
    const contentType = res.headers()['content-type'] ?? '';
    expect(contentType, 'metrics content-type').toContain('text/plain');
    const text = await res.text();
    // The default prom-client metrics would serve even if registerMetrics()
    // never ran. Asserting on a Foldo-specific counter proves the
    // server's metrics.ts wiring is live, not just the library default.
    expect(text, 'foldo counter registered').toContain(
      '# HELP foldo_http_requests_total',
    );
  });

  test('GET /api/home accepts the scrape token', async ({ request }) => {
    test.skip(
      !TOKEN,
      'FOLDO_PROD_SMOKE_TOKEN unset — mint one in Settings → API tokens',
    );
    const res = await request.get(`${BASE}/api/home`, {
      headers: { authorization: `Bearer ${TOKEN}` },
      timeout: 10_000,
    });
    expect(res.status(), 'api/home status (token rejected if 401)').toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.boards), 'boards is an array').toBe(true);
  });
});
