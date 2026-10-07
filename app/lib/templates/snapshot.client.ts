import { webcontainer } from '~/lib/webcontainer';
import { encodeMsgpack } from './msgpack';

// Things a running Vite app never needs. Pruning them keeps the download small.
const EXCLUDES = ['**/*.map', '**/*.d.ts', '**/*.d.mts', '**/*.d.cts', '**/*.md', '**/*.markdown', '**/test/**', '**/tests/**', '**/__tests__/**', '**/.github/**', '**/.cache/**', 'lucide-react/dist/cjs/**', 'lucide-react/dist/umd/**', '@carbon/icons-react/lib/**'];

interface RuntimeNode {
  d?: Record<string, RuntimeNode>;
  f?: { c?: string; b?: boolean; m?: number; s?: number; l?: string };
}

const latin1 = (s: string) => Uint8Array.from(s, (c) => c.charCodeAt(0) & 255);

/**
 * The runtime's serialiser returns JSON ({d: {...}, f: {c: text}}); mount() wants the msgpack snapshot format
 * with bytes for contents and the node_modules folder included (mountPoint is ignored for snapshots).
 */
function toSnapshot(runtimeJson: Uint8Array): Uint8Array {
  const text = new TextEncoder();
  const tree = JSON.parse(new TextDecoder().decode(runtimeJson)) as RuntimeNode;

  const convert = (dir: Record<string, RuntimeNode>) => {
    for (const node of Object.values(dir)) {
      if (node.d) {
        convert(node.d);
      } else if (node.f && node.f.c !== undefined) {
        (node.f as { c: unknown }).c = node.f.b ? latin1(node.f.c) : text.encode(node.f.c);
        delete node.f.b;
        delete node.f.m; // permissions are not part of the format; mountSnapshot() restores the bin links' exec bit
      }
    }
  };

  convert(tree.d ?? {});

  return encodeMsgpack({ d: { node_modules: { d: tree.d } } });
}

/**
 * Admin-only. Installs a pack's packages inside a WebContainer once, packs node_modules into a snapshot,
 * gzips it and uploads it to the server. Teams then mount that snapshot instead of running npm install.
 */
export async function buildSnapshot(pack: { id: string; hash: string }, files: Record<string, string>, log: (line: string) => void) {
  const wc = await webcontainer;

  // start from nothing: leftovers (another pack's packages or Vite cache) must never leak into this snapshot
  await wc.fs.rm('node_modules', { recursive: true, force: true });
  await wc.fs.rm('package-lock.json', { force: true });

  log('Writing the pack files...');

  for (const dir of [...new Set(Object.keys(files).map((p) => p.split('/').slice(0, -1).join('/')).filter(Boolean))].sort()) {
    await wc.fs.mkdir(dir, { recursive: true });
  }

  await Promise.all(Object.entries(files).map(([path, content]) => wc.fs.writeFile(path, content)));

  log('Running npm install (this is the slow, one-time step)...');
  const proc = await wc.spawn('npm', ['install', '--no-audit', '--no-fund', '--loglevel=error'], { env: { IBM_TELEMETRY_DISABLED: 'true' } });
  // eslint-disable-next-line no-control-regex
  proc.output.pipeTo(new WritableStream({ write: (d) => log(String(d).replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '').trim()) }));

  if ((await proc.exit) !== 0) {
    throw new Error('npm install failed');
  }

  await warmViteCache(wc, log);

  log('Packing node_modules...');
  const runtime = await wc.internal.serialize('node_modules', { excludes: EXCLUDES });
  const snapshot = toSnapshot(runtime);
  log(`Packed ${(snapshot.byteLength / 1e6).toFixed(1)} MB, compressing...`);

  const gz = await new Response(new Blob([snapshot as unknown as BlobPart]).stream().pipeThrough(new CompressionStream('gzip'))).blob();
  log(`Compressed to ${(gz.size / 1e6).toFixed(1)} MB, uploading...`);

  const res = await fetch(`/api/admin-snapshot?pack=${pack.id}&hash=${pack.hash}`, { method: 'PUT', body: gz });

  if (!res.ok) {
    throw new Error(`Upload failed (${res.status})`);
  }

  log('Done. Teams will now use this snapshot.');

  return gz.size;
}

/**
 * Start Vite once so it pre-bundles every dependency into node_modules/.vite, then stop it. That cache travels inside the
 * snapshot, which is what makes a new project show its preview in seconds instead of re-bundling in each browser.
 */
async function warmViteCache(wc: Awaited<typeof webcontainer>, log: (line: string) => void) {
  log('Warming the Vite cache (pre-bundling dependencies, one time)...');
  // Vite keys its cache on the lockfile. Teams start without one, so warm the cache without one too.
  await wc.fs.rm('package-lock.json', { force: true });
  const dev = await wc.spawn('npm', ['run', 'dev', '--', '--port', '5199']);
  let ready = false;
  // eslint-disable-next-line no-control-regex
  dev.output.pipeTo(new WritableStream({ write: (d) => { const t = String(d).replace(/\x1b\[[0-9;?]*[A-Za-z]/g, ''); ready ||= /Local:|ready in/.test(t); } }));

  for (let i = 0; i < 120 && !ready; i++) {
    await new Promise((r) => setTimeout(r, 500));
  }

  // a request makes Vite resolve and finish optimising everything the entry needs
  const hit = await wc.spawn('node', ['-e', "fetch('http://localhost:5199/').then(()=>fetch('http://localhost:5199/src/main.jsx')).then(r=>r.text()).then(()=>process.exit(0)).catch(()=>process.exit(1))"]);
  await Promise.race([hit.exit, new Promise((r) => setTimeout(r, 240_000))]); // never hang the build on a stuck request

  for (let i = 0; i < 360; i++) {
    const done = await wc.fs.readFile('node_modules/.vite/deps/_metadata.json', 'utf-8').then(() => true).catch(() => false);

    if (done) {
      break;
    }

    await new Promise((r) => setTimeout(r, 500));
  }

  await new Promise((r) => setTimeout(r, 2000)); // let it flush
  dev.kill();
  const deps = await wc.fs.readdir('node_modules/.vite/deps').catch(() => [] as string[]);
  log(`Vite cache ready (${deps.length} files).`);
}
