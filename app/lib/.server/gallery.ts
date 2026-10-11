import type { GalleryItem } from '~/components/landing/ProjectCard';
import { db } from './db';
import { templateIndex } from './templates';

/*
 * Projects their owners chose to list, newest or most liked first. The track and icon come from the template the project
 * started from (projects built from a plain prompt have neither).
 */
export function galleryItems(userId: string | undefined, sort: 'top' | 'new', limit: number): GalleryItem[] {
  const templates = new Map(templateIndex().templates.map((t) => [t.id, t]));
  const rows = db
    .prepare(
      `SELECT p.id, p.share_id AS shareId, p.description, p.template, u.name, p.updated,
         (SELECT COUNT(*) FROM likes l WHERE l.project_id = p.id) AS likes,
         (SELECT COUNT(*) FROM likes l WHERE l.project_id = p.id AND l.user_id = ?) AS liked,
         (p.user_id = ?) AS mine
       FROM projects p JOIN users u ON u.id = p.user_id
       WHERE p.listed = 1 AND p.share_id IS NOT NULL AND u.disabled = 0
       ORDER BY ${sort === 'new' ? 'p.updated' : 'likes DESC, p.updated'} DESC LIMIT ?`,
    )
    .all(userId ?? '', userId ?? '', limit) as any[];

  return rows.map(({ template, liked, mine, ...row }) => {
    const t = template ? templates.get(template) : undefined;

    return { ...row, icon: t?.icon ?? null, track: t && t.track !== 'Any track' ? t.track : null, liked: Boolean(liked), mine: Boolean(mine) };
  });
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
