import { randomBytes } from 'node:crypto';
import { createReadStream, statSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { requireAdmin } from '~/lib/.server/auth';
import { backupDir, isBackupName } from '~/lib/.server/backup';
import { db } from '~/lib/.server/db';

// Consistent snapshot of the live SQLite file (VACUUM INTO is safe while the app is serving traffic).
export async function loader({ request }: { request: Request }) {
  await requireAdmin(request);

  // ?file=<name>: download one of the automatic backups (names are validated against the real list: no path tricks)
  const wanted = new URL(request.url).searchParams.get('file');

  if (wanted) {
    if (!isBackupName(wanted)) {
      throw new Response('Not found', { status: 404 });
    }

    const stored = join(backupDir(), wanted);

    return new Response(Readable.toWeb(createReadStream(stored)) as ReadableStream, {
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Length': String(statSync(stored).size),
        'Content-Disposition': `attachment; filename="${wanted}"`,
        'Cache-Control': 'no-store',
      },
    });
  }

  const file = join(tmpdir(), `foldo-backup-${randomBytes(6).toString('hex')}.db`);
  db.exec(`VACUUM INTO '${file}'`);

  const size = statSync(file).size;
  const stream = createReadStream(file);
  stream.on('close', () => {
    try {
      unlinkSync(file);
    } catch {
      // already gone
    }
  });

  return new Response(Readable.toWeb(stream) as ReadableStream, {
    headers: {
      'Content-Type': 'application/octet-stream',
      'Content-Length': String(size),
      'Content-Disposition': `attachment; filename="foldo-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}.db"`,
      'Cache-Control': 'no-store',
    },
  });
}
