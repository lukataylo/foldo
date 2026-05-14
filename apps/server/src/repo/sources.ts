import type { SourceFile } from '@foldo/protocol';
import { queryOne, exec } from '../db.ts';
import { nowIso } from '../util.ts';

interface SourceRow {
  repo_slug: string;
  commit_sha: string;
  path: string;
  body: string;
  content_type: SourceFile['contentType'];
  updated_at: string;
}

function rowToSource(r: SourceRow): SourceFile {
  return {
    repoSlug: r.repo_slug,
    commitSha: r.commit_sha,
    path: r.path,
    body: r.body,
    contentType: r.content_type,
    updatedAt: r.updated_at,
  };
}

export async function getSource(
  repoSlug: string,
  commitSha: string,
  path: string,
): Promise<SourceFile | null> {
  const r = await queryOne<SourceRow>(
    `SELECT * FROM sources WHERE repo_slug = $1 AND commit_sha = $2 AND path = $3`,
    [repoSlug, commitSha, path],
  );
  return r ? rowToSource(r) : null;
}

export async function upsertSource(s: SourceFile): Promise<SourceFile> {
  await exec(
    `INSERT INTO sources (repo_slug, commit_sha, path, body, content_type, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT(repo_slug, commit_sha, path) DO UPDATE SET
       body = EXCLUDED.body,
       content_type = EXCLUDED.content_type,
       updated_at = EXCLUDED.updated_at`,
    [s.repoSlug, s.commitSha, s.path, s.body, s.contentType, s.updatedAt ?? nowIso()],
  );
  return s;
}

export function inferContentType(path: string): SourceFile['contentType'] {
  if (path.endsWith('.md')) return 'markdown';
  if (path.endsWith('.tsx')) return 'tsx';
  if (path.endsWith('.ts')) return 'ts';
  if (path.endsWith('.jsx')) return 'jsx';
  if (path.endsWith('.js')) return 'js';
  if (path.endsWith('.css')) return 'css';
  if (path.endsWith('.json')) return 'json';
  return 'other';
}
