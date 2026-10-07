import { copyFileSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

// ponytail: SQLite file on a Railway volume (set DB_PATH=/data/foldo.db); move to Postgres if we need >1 instance
const path = process.env.DB_PATH || './data/foldo.db';
mkdirSync(dirname(path), { recursive: true });

export const dataDir = dirname(path);

// Disaster recovery without a shell: set RESTORE_BACKUP=<file in /data/backups> and redeploy. The current database is kept as
// <db>.before-restore, and a marker file stops the restore from repeating on every restart (remove the variable afterwards).
const restore = process.env.RESTORE_BACKUP;

if (restore && /^foldo-[0-9-]{19}\.db$/.test(restore)) {
  const source = join(dataDir, 'backups', restore);
  const marker = join(dataDir, `restored-${restore}`);

  if (existsSync(source) && !existsSync(marker)) {
    if (existsSync(path)) {
      copyFileSync(path, `${path}.before-restore`);
    }

    for (const ext of ['-wal', '-shm']) {
      rmSync(path + ext, { force: true });
    }

    copyFileSync(source, path);
    writeFileSync(marker, new Date().toISOString());
    console.warn(`[restore] database restored from ${restore}`);
  }
}

export const db = new DatabaseSync(path);

db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA busy_timeout = 5000;
  PRAGMA foreign_keys = ON;
  CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, password TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL, expires INTEGER NOT NULL);
  CREATE INDEX IF NOT EXISTS sessions_user ON sessions (user_id);
  CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY, user_id TEXT NOT NULL, description TEXT, messages TEXT NOT NULL,
    share_id TEXT UNIQUE, updated INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS projects_user ON projects (user_id, updated);
  CREATE TABLE IF NOT EXISTS usage (user_id TEXT NOT NULL, day TEXT NOT NULL, n INTEGER NOT NULL, PRIMARY KEY (user_id, day));
  CREATE TABLE IF NOT EXISTS provider_usage (day TEXT NOT NULL, provider TEXT NOT NULL, n INTEGER NOT NULL, PRIMARY KEY (day, provider));
  CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS providers (
    id TEXT PRIMARY KEY, base_url TEXT, model TEXT, key_enc TEXT, enabled INTEGER NOT NULL DEFAULT 1
  );
  CREATE TABLE IF NOT EXISTS likes (project_id TEXT NOT NULL, user_id TEXT NOT NULL, PRIMARY KEY (project_id, user_id));
`);

// additive migrations for databases created before these columns existed
for (const ddl of [
  "ALTER TABLE users ADD COLUMN name TEXT NOT NULL DEFAULT ''",
  "ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'user'",
  'ALTER TABLE users ADD COLUMN disabled INTEGER NOT NULL DEFAULT 0',
  'ALTER TABLE users ADD COLUMN created INTEGER NOT NULL DEFAULT 0',
  'ALTER TABLE projects ADD COLUMN listed INTEGER NOT NULL DEFAULT 0',
  'ALTER TABLE providers ADD COLUMN max_tokens INTEGER',
  'ALTER TABLE projects ADD COLUMN template TEXT',
]) {
  try {
    db.exec(ddl);
  } catch {
    // column already exists
  }
}

db.exec('CREATE INDEX IF NOT EXISTS projects_listed ON projects (listed, updated)');

export const today = () => new Date().toISOString().slice(0, 10);
