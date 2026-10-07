import { createWriteStream, mkdirSync, renameSync, unlinkSync } from 'node:fs';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { json, type ActionFunctionArgs } from '@remix-run/node';
import { requireAdmin } from '~/lib/.server/auth';
import { snapshotDir, snapshotFile, templateIndex } from '~/lib/.server/templates';

const MAX_BYTES = 250 * 1024 * 1024;

// PUT /api/admin-snapshot?pack=core&hash=abc... with a gzip body (built in the browser by /admin/templates)
export async function action({ request }: ActionFunctionArgs) {
  await requireAdmin(request);

  const url = new URL(request.url);
  const pack = templateIndex().packs[url.searchParams.get('pack') ?? ''];

  if (request.method !== 'PUT' || !pack || pack.hash !== url.searchParams.get('hash') || !request.body) {
    return json({ error: 'Bad request' }, 400);
  }

  if (Number(request.headers.get('content-length') ?? 0) > MAX_BYTES) {
    return json({ error: 'Snapshot too large' }, 413);
  }

  mkdirSync(snapshotDir(), { recursive: true });
  const target = snapshotFile(pack.id, pack.hash);
  const temp = `${target}.${process.pid}.tmp`;
  let written = 0;

  try {
    await pipeline(
      Readable.fromWeb(request.body as never),
      async function* (source) {
        for await (const chunk of source) {
          written += (chunk as Buffer).length;

          if (written > MAX_BYTES) {
            throw new Error('too large');
          }

          yield chunk;
        }
      },
      createWriteStream(temp),
    );
  } catch {
    try {
      unlinkSync(temp);
    } catch {
      // nothing written
    }

    return json({ error: 'Upload failed' }, 400);
  }

  renameSync(temp, target); // atomic: teams never download a half-written file

  return json({ ok: true, bytes: written });
}
