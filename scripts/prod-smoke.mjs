#!/usr/bin/env node
// Production smoke test. Hits the deployed Foldo API surface and exits
// non-zero on any failure. Used as a post-deploy gate.
//
// Env:
//   FOLDO_PROD_BASE          — base URL (default: https://api.foldo.dev)
//   FOLDO_PROD_SMOKE_TOKEN   — scrape-only API token (Settings → API tokens).
//                              When unset, only the unauthenticated checks
//                              run and the auth check is reported as SKIP.
//
// What it checks:
//   1. GET /health        — public, returns {"ok":true,...}
//   2. GET /metrics       — public, returns Prometheus exposition text
//   3. GET /api/home      — authenticated, returns {"boards":[...]}
//
// See docs/DEPLOYMENT.md §6.
//
// Kept dependency-free (uses the built-in fetch) so it works on any
// Node 20+ runner without a `node_modules` install.

import { exit, env, stdout } from 'node:process';

const BASE = (env.FOLDO_PROD_BASE ?? 'https://api.foldo.dev').replace(/\/+$/, '');
const TOKEN = env.FOLDO_PROD_SMOKE_TOKEN ?? '';
const TIMEOUT_MS = Number(env.FOLDO_PROD_SMOKE_TIMEOUT_MS ?? 10_000);

/**
 * One check = one row in the final report. `run()` swallows errors and
 * returns a structured result so a single check failure doesn't abort
 * the whole script — operators want the full picture, not "first failure
 * wins".
 */
async function run(name, fn) {
  const started = Date.now();
  try {
    const detail = await fn();
    return { name, ok: true, ms: Date.now() - started, detail: detail ?? '' };
  } catch (err) {
    return {
      name,
      ok: false,
      ms: Date.now() - started,
      detail: err instanceof Error ? err.message : String(err),
    };
  }
}

async function fetchWithTimeout(url, init = {}) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: ctl.signal });
  } finally {
    clearTimeout(t);
  }
}

async function checkHealth() {
  const res = await fetchWithTimeout(`${BASE}/health`);
  if (res.status !== 200) throw new Error(`status=${res.status}`);
  const body = await res.json();
  if (!body || body.ok !== true) {
    throw new Error(`unexpected body: ${JSON.stringify(body)}`);
  }
  return `ts=${body.ts}`;
}

async function checkMetrics() {
  const res = await fetchWithTimeout(`${BASE}/metrics`);
  if (res.status !== 200) throw new Error(`status=${res.status}`);
  const ct = res.headers.get('content-type') ?? '';
  if (!ct.includes('text/plain')) {
    throw new Error(`expected text/plain; got ${ct}`);
  }
  const text = await res.text();
  // Sanity: the Prometheus exposition format always has at least one
  // `# HELP` line for each metric. We also want to confirm the Foldo
  // counter exists — otherwise the route is serving the default-only
  // prom-client registry, which means metrics.ts didn't register us.
  if (!text.includes('# HELP foldo_http_requests_total')) {
    throw new Error('foldo_http_requests_total missing from exposition');
  }
  return `bytes=${text.length}`;
}

async function checkAuthenticated() {
  if (!TOKEN) return 'SKIP (FOLDO_PROD_SMOKE_TOKEN unset)';
  const res = await fetchWithTimeout(`${BASE}/api/home`, {
    headers: { authorization: `Bearer ${TOKEN}` },
  });
  if (res.status === 401) {
    throw new Error('401 — token rejected (expired or wrong env?)');
  }
  if (res.status !== 200) throw new Error(`status=${res.status}`);
  const body = await res.json();
  if (!body || !Array.isArray(body.boards)) {
    throw new Error(`unexpected body: ${JSON.stringify(body).slice(0, 200)}`);
  }
  return `boards=${body.boards.length}`;
}

const results = [];
results.push(await run('GET /health', checkHealth));
results.push(await run('GET /metrics', checkMetrics));
results.push(await run('GET /api/home', checkAuthenticated));

stdout.write(`\nFoldo prod-smoke against ${BASE}\n`);
for (const r of results) {
  // SKIP is reported as ok=true with a SKIP-prefixed detail; render it
  // distinctly so it's not confused with a green check.
  const tag = !r.ok ? 'FAIL' : String(r.detail).startsWith('SKIP') ? 'SKIP' : 'PASS';
  const padded = `[${tag}]`.padEnd(7);
  const ms = `${r.ms}ms`.padStart(7);
  stdout.write(`  ${padded} ${r.name.padEnd(16)} ${ms}  ${r.detail}\n`);
}

const failed = results.filter((r) => !r.ok);
stdout.write(`\n${results.length - failed.length}/${results.length} checks passed\n`);
exit(failed.length === 0 ? 0 : 1);
