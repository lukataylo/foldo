// Installs each pack once (natively), then runs `vite build` for every template to catch broken imports/JSX.
// npm run test:templates
import { execSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

execSync('node scripts/build-templates.mjs', { stdio: 'inherit' });

const index = JSON.parse(readFileSync('public/templates/index.json', 'utf8'));
const work = mkdtempSync(join(tmpdir(), 'foldo-templates-'));
const installed = {};
let failed = 0;

for (const t of index.templates) {
  const spec = JSON.parse(readFileSync(`public/templates/${t.id}.json`, 'utf8'));

  if (!installed[t.pack]) {
    const dir = join(work, `pack-${t.pack}`);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'package.json'), spec.files['package.json']);
    console.log(`installing pack ${t.pack}...`);
    execSync('npm install --no-audit --no-fund --loglevel=error', { cwd: dir, stdio: 'inherit', env: { ...process.env, IBM_TELEMETRY_DISABLED: 'true' } });
    installed[t.pack] = dir;
  }

  const dir = join(work, t.id);
  mkdirSync(dir, { recursive: true });

  for (const [path, content] of Object.entries(spec.files)) {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), content);
  }

  symlinkSync(join(installed[t.pack], 'node_modules'), join(dir, 'node_modules'));

  try {
    execSync('npx vite build', { cwd: dir, stdio: 'pipe' });
    console.log(`PASS  ${t.id}`);
  } catch (e) {
    failed++;
    console.log(`FAIL  ${t.id}\n${String(e.stdout).split('\n').slice(-12).join('\n')}${String(e.stderr).slice(-600)}`);
  }
}

rmSync(work, { recursive: true, force: true });

// reminder: a pack whose hash has no bundled snapshot still works, but teams will run npm install
for (const [id, p] of Object.entries(index.packs)) {
  if (!existsSync(`templates/snapshots/${id}-${p.hash}.snap.gz`)) {
    console.log(`NOTE  no bundled snapshot for pack "${id}" (${p.hash}): build one in /admin/templates and commit it to templates/snapshots/`);
  }
}

process.exit(failed ? 1 : 0);
