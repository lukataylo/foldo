#!/usr/bin/env node
// Generate the PWA icon variants + iOS splash screens from the canonical
// SVG mark at apps/web/public/foldo-mark.svg.
//
// Output:
//   apps/web/public/apple-touch-icon.png      180x180  (iOS home-screen)
//   apps/web/public/icon-192.png              192x192  (manifest icon)
//   apps/web/public/icon-512.png              512x512  (manifest icon)
//   apps/web/public/icon-192-maskable.png     192x192  (manifest, safe-area padded)
//   apps/web/public/icon-512-maskable.png     512x512  (manifest, safe-area padded)
//   apps/web/public/splash/apple-splash-*.png — dark splashes for iPad sizes
//
// Approach: we synthesise a per-target SVG in /tmp with the right viewBox
// and embedded background, then ask `sips` (built into macOS) to rasterise
// it to PNG at the exact pixel dimensions. On non-macOS, the script bails
// with a clear message — committed PNGs in the repo cover the common case.
//
// Idempotent. Safe to re-run; each call overwrites.

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir, platform } from 'node:os';

const ROOT = resolve(new URL('..', import.meta.url).pathname);
const PUBLIC = join(ROOT, 'apps/web/public');
const SPLASH = join(PUBLIC, 'splash');
const SRC_SVG = join(PUBLIC, 'foldo-mark.svg');

// Brand colours (mirrored from src/marketing/shared.tsx; kept in sync by eye —
// these very rarely change).
const SPLASH_BG = '#0f1014';
const PILLOW = '#FDB306';

function ensure(dir) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

function checkTools() {
  if (platform() !== 'darwin') {
    console.warn(
      '[gen-pwa-assets] non-macOS host detected. This script uses macOS `sips` to ' +
        'rasterise SVG → PNG. On Linux/CI, install librsvg (`apt-get install librsvg2-bin`) ' +
        'and rerun via `rsvg-convert`. The PNGs already committed in apps/web/public/ ' +
        "are the canonical assets — regenerating them isn't part of CI.",
    );
    process.exit(0);
  }
}

function rasterise(svgPath, pngPath, size) {
  // sips can read SVG natively on modern macOS and resample to any size.
  execFileSync(
    'sips',
    ['-s', 'format', 'png', '-z', String(size), String(size), svgPath, '--out', pngPath],
    { stdio: ['ignore', 'ignore', 'inherit'] },
  );
}

function tmpSvg(name, contents) {
  const path = join(tmpdir(), `foldo-pwa-${name}.svg`);
  writeFileSync(path, contents);
  return path;
}

// -------- icons --------

function genTouchIcon() {
  // The committed mark is already a yellow rounded square — iOS will round
  // the corners itself with a hardware mask, so we want the *full* yellow
  // bleed (transparent corners would show black). sips on the raw SVG
  // gives us exactly that.
  const out = join(PUBLIC, 'apple-touch-icon.png');
  rasterise(SRC_SVG, out, 180);
  console.log(`  apple-touch-icon.png       180x180`);
}

function genManifestIcon(size, maskable) {
  const file = maskable ? `icon-${size}-maskable.png` : `icon-${size}.png`;
  const out = join(PUBLIC, file);
  if (maskable) {
    // Maskable icons must keep their content inside a 40% safe zone — i.e.
    // the foldo dog must not get cropped by an OS-side circle/squircle mask.
    // We scale the mark to 72% inside a full-bleed yellow square.
    const inner = readFileSync(SRC_SVG, 'utf8');
    // Pull the inner `<g …>…</g>` and rect from the source SVG via regex —
    // simpler than parsing. The source has exactly one outer rect + one g.
    const innerContent = inner.match(/<rect[^/]+\/>([\s\S]+)<\/svg>/)?.[1] ?? '';
    const wrapped = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1254 1254" width="1254" height="1254">
  <rect x="0" y="0" width="1254" height="1254" fill="${PILLOW}"/>
  <g transform="translate(627 627) scale(0.72) translate(-627 -627)">
    <rect x="0" y="0" width="1254" height="1254" fill="${PILLOW}"/>
    ${innerContent}
  </g>
</svg>`;
    const svgPath = tmpSvg(`maskable-${size}`, wrapped);
    rasterise(svgPath, out, size);
  } else {
    rasterise(SRC_SVG, out, size);
  }
  console.log(`  ${file.padEnd(26)} ${size}x${size}`);
}

// -------- splash screens --------

// iPad portrait sizes we care about. Apple expects the asset to be exactly
// the native resolution of the device; the `media` query in the <link> tells
// iOS which one to pick. Landscape variants use the inverse dimensions but
// the same image content (square-centered, so the mark sits centered in
// either orientation when we make the image square-tall).
const SPLASH_TARGETS = [
  { w: 2048, h: 2732, label: 'iPad Pro 12.9" portrait' },
  { w: 1668, h: 2388, label: 'iPad Pro 11" portrait' },
  { w: 1640, h: 2360, label: 'iPad Air portrait' },
  { w: 1488, h: 2266, label: 'iPad Mini portrait' },
];

// Extract the SVG inner content (rect + g) once — every splash embeds it
// inline (sips' SVG renderer doesn't follow `<image href="file://…">`).
function loadMarkInner() {
  const raw = readFileSync(SRC_SVG, 'utf8');
  // The mark is a single <rect> + single <g> inside the outer <svg viewBox="0 0 1254 1254">.
  // Grab everything between the opening <svg …> tag and </svg>.
  const m = raw.match(/<svg[^>]*>([\s\S]+)<\/svg>/);
  if (!m) throw new Error('foldo-mark.svg structure unexpected — cannot extract inner');
  return m[1];
}

function genSplash(w, h, markInner) {
  // The mark is sized to 22% of the shorter edge so it never crowds the
  // safe-area on the narrower iPad Mini. SVG viewBox keeps it crisp at
  // every density.
  const shortEdge = Math.min(w, h);
  const markSize = Math.round(shortEdge * 0.22);
  const cx = w / 2 - markSize / 2;
  const cy = h / 2 - markSize / 2;
  // The inner mark uses a 1254x1254 viewBox; we render it into our own
  // viewBox via a nested <svg> with the right xy + size.
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">
  <rect width="${w}" height="${h}" fill="${SPLASH_BG}"/>
  <svg x="${cx}" y="${cy}" width="${markSize}" height="${markSize}" viewBox="0 0 1254 1254">
    ${markInner}
  </svg>
</svg>`;
  const svgPath = tmpSvg(`splash-${w}x${h}`, svg);
  const out = join(SPLASH, `apple-splash-${w}x${h}.png`);
  // -z fits to the longer edge; then -c crops/pads to exact w×h.
  rasterise(svgPath, out, Math.max(w, h));
  execFileSync(
    'sips',
    ['-c', String(h), String(w), out],
    { stdio: ['ignore', 'ignore', 'inherit'] },
  );
  console.log(`  apple-splash-${w}x${h}.png`.padEnd(36));
}

function main() {
  checkTools();
  ensure(SPLASH);
  console.log('PWA icons:');
  genTouchIcon();
  genManifestIcon(192, false);
  genManifestIcon(512, false);
  genManifestIcon(192, true);
  genManifestIcon(512, true);
  console.log('\niPad splash screens:');
  const markInner = loadMarkInner();
  for (const { w, h } of SPLASH_TARGETS) genSplash(w, h, markInner);
  console.log('\nDone. Commit the PNGs alongside the SVG source.');
}

main();
