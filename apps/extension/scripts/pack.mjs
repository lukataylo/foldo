#!/usr/bin/env node
// Builds the extension (Vite + @crxjs) and packages the dist/ output as a
// versioned zip ready to upload to the Chrome Web Store. The zip name
// embeds the short git sha so two builds from different commits don't
// collide on disk.
//
//   $ npm run pack:extension
//   → apps/extension/dist-pack/foldo-extension-<sha>.zip
//
// Step 4 of docs/PRODUCTION-PLAN.md — the marketed "Capture from URL" flow
// has two backends (extension + shotter). This script is the extension-side
// of "shipping it without the user touching `chrome://extensions`".

import { execFileSync, execSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const EXT_ROOT = resolve(HERE, '..');
const DIST_DIR = resolve(EXT_ROOT, 'dist');
const PACK_DIR = resolve(EXT_ROOT, 'dist-pack');

function shortSha() {
  // Falls back to a timestamped "nogit" tag when not in a git repo (e.g.
  // a CI tarball build), so the script never throws purely on this.
  try {
    const sha = execSync('git rev-parse HEAD', { cwd: EXT_ROOT, encoding: 'utf8' }).trim();
    return sha.slice(0, 7);
  } catch {
    return `nogit-${Date.now().toString(36)}`;
  }
}

function run(cmd, args, opts = {}) {
  process.stdout.write(`$ ${cmd} ${args.join(' ')}\n`);
  execFileSync(cmd, args, { stdio: 'inherit', ...opts });
}

// 1. Always build a fresh dist/ — packaging stale bytes is a footgun.
run('npm', ['run', 'build'], { cwd: EXT_ROOT });

if (!existsSync(DIST_DIR)) {
  console.error(`pack: expected ${DIST_DIR} after build, missing.`);
  process.exit(1);
}

mkdirSync(PACK_DIR, { recursive: true });
const sha = shortSha();
const outZip = resolve(PACK_DIR, `foldo-extension-${sha}.zip`);

// Overwrite any prior zip with the same sha (rebuilt locally with the same HEAD).
if (existsSync(outZip)) rmSync(outZip);

// `zip -r <out> .` from inside dist/ keeps the archive paths relative to
// the manifest root (Chrome expects `manifest.json` at the top level).
run('zip', ['-r', '-q', outZip, '.'], { cwd: DIST_DIR });

console.log(`\npack: wrote ${outZip}`);
