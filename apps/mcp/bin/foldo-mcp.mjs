#!/usr/bin/env node
// Wrapper that runs the TS entry via tsx, so we don't need a separate
// compile step. The Foldo prototype keeps its TS sources runnable directly.

import { spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const entry = resolve(here, '..', 'src', 'index.ts');

const child = spawn(
  process.execPath,
  ['--import', 'tsx', entry, ...process.argv.slice(2)],
  { stdio: 'inherit', env: process.env },
);

child.on('exit', (code) => {
  process.exit(code ?? 0);
});
