#!/usr/bin/env node
// Convert every PNG under apps/web/public/marketing/ to .webp alongside the
// original. The PNGs are kept as <picture> fallbacks for the (tiny) set of
// browsers without WebP support, but the WebP is what 99% of visitors get.
//
// Requires `cwebp` on PATH (`brew install webp` on macOS, `apt install webp`
// on Debian/Ubuntu). Quality 82 is the sweet spot — visually
// indistinguishable from the source PNG at this asset scale (illustrations,
// not photos), and around 30× smaller in our measurements.
//
// Usage: node scripts/convert-marketing-webp.mjs
//
// Idempotent: re-runs always overwrite. Safe to call from a pre-commit
// hook or a content-pipeline step.

import { readdirSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, basename } from 'node:path';

const DIR = 'apps/web/public/marketing';
const QUALITY = 82;

function fmtKb(bytes) {
  return `${(bytes / 1024).toFixed(0)} KB`;
}

function main() {
  const entries = readdirSync(DIR)
    .filter((f) => f.toLowerCase().endsWith('.png'))
    .sort();
  if (entries.length === 0) {
    console.warn(`[convert-marketing-webp] no PNGs in ${DIR}`);
    return;
  }
  let totalPng = 0;
  let totalWebp = 0;
  for (const file of entries) {
    const src = join(DIR, file);
    const dst = join(DIR, basename(file, '.png') + '.webp');
    execFileSync('cwebp', ['-q', String(QUALITY), '-m', '6', '-mt', '-quiet', src, '-o', dst]);
    const srcSize = statSync(src).size;
    const dstSize = statSync(dst).size;
    totalPng += srcSize;
    totalWebp += dstSize;
    const ratio = ((1 - dstSize / srcSize) * 100).toFixed(1);
    console.log(`  ${file.padEnd(28)} ${fmtKb(srcSize).padStart(10)}  →  ${fmtKb(dstSize).padStart(8)}  (−${ratio}%)`);
  }
  const totalRatio = ((1 - totalWebp / totalPng) * 100).toFixed(1);
  console.log(
    `\n  ${'TOTAL'.padEnd(28)} ${fmtKb(totalPng).padStart(10)}  →  ${fmtKb(totalWebp).padStart(8)}  (−${totalRatio}%)`,
  );
}

main();
