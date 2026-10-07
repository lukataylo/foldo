import { backupsScheduled } from '~/lib/.server/backup';
import { db } from '~/lib/.server/db';

export function loader() {
  db.prepare('SELECT 1').get();

  return new Response('ok', { headers: { 'Cache-Control': 'no-store', 'X-Foldo-Backups': backupsScheduled() ? 'on' : 'off' } });
}
