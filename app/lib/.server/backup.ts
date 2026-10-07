import { copyFileSync, existsSync, mkdirSync, readdirSync, statSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { dataDir, db } from './db';

// Automatic database backups on the volume: a consistent SQLite snapshot every BACKUP_INTERVAL_MIN minutes (default 10),
// the newest BACKUP_KEEP kept (default 36 = 6 hours). Restore with RESTORE_BACKUP=<file name> (see restoreIfRequested).
export const backupDir = () => join(dataDir, 'backups');
const NAME = /^foldo-[0-9-]{19}\.db$/;

export function listBackups() {
  if (!existsSync(backupDir())) {
    return [];
  }

  return readdirSync(backupDir())
    .filter((n) => NAME.test(n))
    .map((name) => {
      const s = statSync(join(backupDir(), name));

      return { name, bytes: s.size, mtime: s.mtimeMs };
    })
    .sort((a, b) => b.mtime - a.mtime);
}

export function runBackup(): string {
  mkdirSync(backupDir(), { recursive: true });
  const name = `foldo-${new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19)}.db`;
  const file = join(backupDir(), name);

  if (!existsSync(file)) {
    db.exec(`VACUUM INTO '${file.replace(/'/g, "''")}'`);
  }

  const keep = Math.max(2, Number(process.env.BACKUP_KEEP || 36));

  for (const old of listBackups().slice(keep)) {
    try {
      unlinkSync(join(backupDir(), old.name));
    } catch {
      // already gone
    }
  }

  return name;
}

// referenced from a loader so the module (and its timer) is loaded when the server boots
export const backupsScheduled = () => minutes > 0;

export const isBackupName = (name: string) => NAME.test(name) && existsSync(join(backupDir(), name));

const g = globalThis as unknown as { __foldoBackups?: boolean };
const minutes = Number(process.env.BACKUP_INTERVAL_MIN ?? 10);

if (!g.__foldoBackups && minutes > 0) {
  g.__foldoBackups = true;
  setTimeout(() => {
    try {
      runBackup();
    } catch (e) {
      console.error('[backup] failed:', (e as Error).message);
    }
  }, 60_000).unref(); // first one a minute after boot, then on the interval
  setInterval(() => {
    try {
      console.log(`[backup] wrote ${runBackup()}`);
    } catch (e) {
      console.error('[backup] failed:', (e as Error).message);
    }
  }, minutes * 60_000).unref();
}
