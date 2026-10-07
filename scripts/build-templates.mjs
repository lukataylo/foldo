// Bundles templates/<id> (overlay) + templates/packs/<pack> (shared base) into public/templates/<id>.json.
// Runs automatically before `npm run dev` and `npm run build`. Output is generated, not committed.
import { createHash } from 'node:crypto';
import { mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = 'templates';
const OUT = 'public/templates';
const TEXT = /\.(jsx?|json|css|html|md|svg|txt)$/;

function walk(dir, base = dir, out = {}) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);

    if (statSync(p).isDirectory()) {
      walk(p, base, out);
    } else if (TEXT.test(name)) {
      out[relative(base, p).split('\\').join('/')] = readFileSync(p, 'utf8');
    }
  }

  return out;
}

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

const packs = {};

for (const id of readdirSync(join(ROOT, 'packs'))) {
  const files = walk(join(ROOT, 'packs', id));
  // the pack hash is what a prebuilt node_modules snapshot is keyed on: it changes only when dependencies change
  const hash = createHash('sha1').update(files['package.json']).update(files['vite.config.js'] ?? '').digest('hex').slice(0, 10);
  packs[id] = { id, hash, files };
}

const index = [];

for (const id of readdirSync(ROOT).filter((n) => !['packs', 'snapshots'].includes(n) && statSync(join(ROOT, n)).isDirectory())) {
  const meta = JSON.parse(readFileSync(join(ROOT, id, 'template.json'), 'utf8'));
  const pack = packs[meta.pack];

  if (!pack) {
    throw new Error(`${id}: unknown pack "${meta.pack}"`);
  }

  const overlay = walk(join(ROOT, id));
  delete overlay['template.json'];

  if (overlay['package.json']) {
    throw new Error(`${id}: templates must not ship their own package.json (it belongs to the "${meta.pack}" pack so one snapshot serves all)`);
  }

  const files = { ...pack.files, ...overlay };
  writeFileSync(join(OUT, `${id}.json`), JSON.stringify({ ...meta, packHash: pack.hash, files }));
  index.push({ ...meta, packHash: pack.hash, fileCount: Object.keys(files).length, bytes: Buffer.byteLength(JSON.stringify(files)) });
}

writeFileSync(
  join(OUT, 'index.json'),
  JSON.stringify({ templates: index, packs: Object.fromEntries(Object.values(packs).map((p) => [p.id, { id: p.id, hash: p.hash, dependencies: Object.keys(JSON.parse(p.files['package.json']).dependencies) }])) }),
);

console.log(`templates: ${index.length} built (${index.map((t) => t.id).join(', ')})`);
