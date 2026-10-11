import type { GalleryItem } from '~/components/landing/ProjectCard';
import { TRACKS } from '~/components/landing/starters';
import { db } from './db';
import { templateIndex } from './templates';

const LISTED = 'p.listed = 1 AND p.share_id IS NOT NULL AND u.disabled = 0';

/*
 * Listed projects, newest or most liked first, optionally one track. The track and icon come from the template the
 * project started from (projects built from a plain prompt have neither, so they only appear under "All").
 */
export function galleryItems(
  userId: string | undefined,
  { sort, track, limit, offset = 0 }: { sort: 'top' | 'new'; track?: string | null; limit: number; offset?: number },
): GalleryItem[] {
  const templates = templateIndex().templates;
  const byId = new Map(templates.map((t) => [t.id, t]));
  const inTrack = track ? templates.filter((t) => t.track === track).map((t) => t.id) : [];

  if (track && !inTrack.length) {
    return [];
  }

  const rows = db
    .prepare(
      `SELECT p.id, p.share_id AS shareId, p.description, p.template, u.name, p.updated,
         (SELECT COUNT(*) FROM likes l WHERE l.project_id = p.id) AS likes,
         (SELECT COUNT(*) FROM likes l WHERE l.project_id = p.id AND l.user_id = ?) AS liked,
         (p.user_id = ?) AS mine
       FROM projects p JOIN users u ON u.id = p.user_id
       WHERE ${LISTED} ${track ? `AND p.template IN (${inTrack.map(() => '?').join(',')})` : ''}
       ORDER BY ${sort === 'new' ? 'p.updated DESC' : 'likes DESC, p.updated DESC'} LIMIT ? OFFSET ?`,
    )
    .all(userId ?? '', userId ?? '', ...inTrack, limit, offset) as any[];

  return rows.map(({ template, liked, mine, ...row }) => {
    const t = template ? byId.get(template) : undefined;

    return { ...row, icon: t?.icon ?? null, track: t && t.track !== 'Any track' ? t.track : null, liked: Boolean(liked), mine: Boolean(mine) };
  });
}

// listed projects per track, plus the total ("All")
export function galleryCounts(): Record<string, number> {
  const byId = new Map(templateIndex().templates.map((t) => [t.id, t.track]));
  const rows = db
    .prepare(`SELECT p.template, COUNT(*) AS n FROM projects p JOIN users u ON u.id = p.user_id WHERE ${LISTED} GROUP BY p.template`)
    .all() as { template: string | null; n: number }[];
  const counts: Record<string, number> = { all: 0, ...Object.fromEntries(TRACKS.map((t) => [t, 0])) };

  for (const { template, n } of rows) {
    counts.all += n;

    const track = template ? byId.get(template) : undefined;

    if (track && track in counts) {
      counts[track] += n;
    }
  }

  return counts;
}

// one line about a project for the featured card: the team's first prompt, else the template's summary
export function projectSummary(projectId: string): string {
  const row = db
    .prepare(
      `SELECT p.template,
         (SELECT json_extract(m.value, '$.content') FROM json_each(p.messages) m
           WHERE json_extract(m.value, '$.role') = 'user' AND json_extract(m.value, '$.id') != 'tpl-intro' LIMIT 1) AS prompt
       FROM projects p WHERE p.id = ?`,
    )
    .get(projectId) as { template: string | null; prompt: unknown } | undefined;

  const prompt = typeof row?.prompt === 'string' ? row.prompt.replace(/\s+/g, ' ').trim() : '';

  if (prompt) {
    return prompt.length > 160 ? `${prompt.slice(0, 157).trimEnd()}…` : prompt;
  }

  return templateIndex().templates.find((t) => t.id === row?.template)?.summary ?? '';
}
