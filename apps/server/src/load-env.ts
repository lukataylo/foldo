// Loads the repo-root .env file into process.env for local dev. Production
// (Railway etc.) injects env vars directly, so a missing file is fine, only
// swallow ENOENT. Imported for side effects from src/index.ts and src/seed.ts.
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

try {
  const here = dirname(fileURLToPath(import.meta.url));
  // src/ -> apps/server/ -> apps/ -> <repo root>
  process.loadEnvFile(resolve(here, '../../../.env'));
} catch (err) {
  const code = (err as NodeJS.ErrnoException)?.code;
  if (code !== 'ENOENT') throw err;
}
