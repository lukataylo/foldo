import type { SourceFile } from '@foldo/protocol';
import { db } from '../db.ts';
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

export function getSource(
  repoSlug: string,
  commitSha: string,
  path: string,
): SourceFile | null {
  const r = db
    .prepare(
      `SELECT * FROM sources WHERE repo_slug = ? AND commit_sha = ? AND path = ?`,
    )
    .get(repoSlug, commitSha, path) as SourceRow | undefined;
  return r ? rowToSource(r) : null;
}

export function upsertSource(s: SourceFile): SourceFile {
  db.prepare(
    `INSERT INTO sources (repo_slug, commit_sha, path, body, content_type, updated_at)
     VALUES (@repo_slug, @commit_sha, @path, @body, @content_type, @updated_at)
     ON CONFLICT(repo_slug, commit_sha, path) DO UPDATE SET
       body = excluded.body,
       content_type = excluded.content_type,
       updated_at = excluded.updated_at`,
  ).run({
    repo_slug: s.repoSlug,
    commit_sha: s.commitSha,
    path: s.path,
    body: s.body,
    content_type: s.contentType,
    updated_at: s.updatedAt ?? nowIso(),
  });
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
