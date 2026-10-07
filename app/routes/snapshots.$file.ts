import { createReadStream, statSync } from 'node:fs';
import { Readable } from 'node:stream';
import { findSnapshot, templateIndex } from '~/lib/.server/templates';

// GET /snapshots/<pack>-<hash>.snap : one gzip'd file with the pack's node_modules, cached forever (the hash is in the URL).
export function loader({ params }: { params: { file?: string } }) {
  const m = /^([a-z0-9-]+)-([a-f0-9]{10})\.snap$/.exec(params.file ?? '');
  const pack = m && templateIndex().packs[m[1]];

  if (!m || !pack || pack.hash !== m[2]) {
    throw new Response('Not found', { status: 404 });
  }

  const file = findSnapshot(m[1], m[2]);

  if (!file) {
    throw new Response('Snapshot not built yet', { status: 404 });
  }

  return new Response(Readable.toWeb(createReadStream(file)) as ReadableStream, {
    headers: {
      'Content-Type': 'application/octet-stream',
      'Content-Encoding': 'gzip', // stored compressed; the browser inflates it transparently
      'Content-Length': String(statSync(file).size),
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
}
