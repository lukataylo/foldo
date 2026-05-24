#!/usr/bin/env node
// Bundle-size budget gate. Run AFTER `npm --workspace @foldo/web run build`.
//
// Walks apps/web/dist/assets/*.js, sums raw and gzipped bytes, prints a
// per-chunk table, and fails (non-zero exit) if either total exceeds the
// budget. The budget is intentionally permissive today — the goal is to
// catch a future "oops, we shipped 4 MB of unused d3" regression, not to
// gate on the current size. See docs/PERF-BUDGETS.md for the rationale
// and how to update the budget when a real chunk needs more headroom.
//
// CI wires this into a dedicated `bundle-size` job in .github/workflows/ci.yml
// so it runs in parallel with typecheck and isn't blocked by anything else.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { join } from 'node:path';

// Budgets in bytes. Today's totals: ~530 KB raw, ~161 KB gzipped. Buffer
// generously so the gate doesn't fire on a normal feature add. Tighten as
// the bundle stabilises.
const BUDGET_RAW_BYTES = 2_000_000;        // 2 MB raw
const BUDGET_GZIP_BYTES = 600_000;         // 600 KB gzipped

const DIST_DIR = 'apps/web/dist/assets';

function fmtKb(bytes) {
  return `${(bytes / 1024).toFixed(1)} KB`;
}

function main() {
  let entries;
  try {
    entries = readdirSync(DIST_DIR);
  } catch (err) {
    console.error(
      `\n[check-bundle-size] ${DIST_DIR} does not exist.\n` +
        `Run \`npm --workspace @foldo/web run build\` first.\n`,
    );
    process.exit(2);
  }
  const jsFiles = entries
    .filter((f) => f.endsWith('.js'))
    .map((f) => join(DIST_DIR, f))
    .sort();
  if (jsFiles.length === 0) {
    console.error(`[check-bundle-size] no .js files in ${DIST_DIR}`);
    process.exit(2);
  }

  console.log(`\nbundle sizes (${DIST_DIR}):`);
  console.log('  ' + '─'.repeat(70));
  let totalRaw = 0;
  let totalGzip = 0;
  // Largest-first makes the offender obvious without grepping.
  const rows = jsFiles.map((path) => {
    const buf = readFileSync(path);
    const raw = statSync(path).size;
    const gz = gzipSync(buf).length;
    totalRaw += raw;
    totalGzip += gz;
    return { name: path.replace(`${DIST_DIR}/`, ''), raw, gz };
  });
  rows.sort((a, b) => b.raw - a.raw);
  for (const r of rows) {
    console.log(
      `  ${r.name.padEnd(42)} ${fmtKb(r.raw).padStart(10)}  gz:${fmtKb(r.gz).padStart(10)}`,
    );
  }
  console.log('  ' + '─'.repeat(70));
  console.log(
    `  ${'TOTAL'.padEnd(42)} ${fmtKb(totalRaw).padStart(10)}  gz:${fmtKb(totalGzip).padStart(10)}`,
  );
  console.log(
    `  ${'BUDGET'.padEnd(42)} ${fmtKb(BUDGET_RAW_BYTES).padStart(10)}  gz:${fmtKb(BUDGET_GZIP_BYTES).padStart(10)}`,
  );
  console.log();

  const failures = [];
  if (totalRaw > BUDGET_RAW_BYTES) {
    failures.push(
      `raw total ${fmtKb(totalRaw)} exceeds budget ${fmtKb(BUDGET_RAW_BYTES)}`,
    );
  }
  if (totalGzip > BUDGET_GZIP_BYTES) {
    failures.push(
      `gzip total ${fmtKb(totalGzip)} exceeds budget ${fmtKb(BUDGET_GZIP_BYTES)}`,
    );
  }
  if (failures.length > 0) {
    console.error('[check-bundle-size] FAIL:');
    for (const f of failures) console.error('  - ' + f);
    console.error(
      '\n  See docs/PERF-BUDGETS.md for how to update the budget when a real\n' +
        '  chunk justifies more headroom.\n',
    );
    process.exit(1);
  }
  const headroomRaw = ((1 - totalRaw / BUDGET_RAW_BYTES) * 100).toFixed(0);
  const headroomGz = ((1 - totalGzip / BUDGET_GZIP_BYTES) * 100).toFixed(0);
  console.log(
    `[check-bundle-size] OK — ${headroomRaw}% raw headroom, ${headroomGz}% gzip headroom`,
  );
}

main();
