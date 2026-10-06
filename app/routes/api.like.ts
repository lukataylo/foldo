import { json, type ActionFunctionArgs } from '@remix-run/node';
import { requireApiUser, throttled } from '~/lib/.server/auth';
import { db } from '~/lib/.server/db';

// POST {shareId, like: boolean}: one like per signed-in user per listed project
export async function action({ request }: ActionFunctionArgs) {
  const user = await requireApiUser(request);

  if (request.method !== 'POST' || throttled(`like:${user.id}`, 60, 60_000)) {
    return json({ error: 'slow down' }, 429);
  }

  const body = (await request.json().catch(() => ({}))) as { shareId?: string; like?: boolean };
  const row = db
    .prepare('SELECT id, user_id FROM projects WHERE share_id = ? AND listed = 1')
    .get(String(body.shareId ?? '')) as any;

  if (!row) {
    return json({ error: 'not found' }, 404);
  }

  if (row.user_id === user.id) {
    return json({ error: "You can't like your own project." }, 400);
  }

  if (body.like) {
    db.prepare('INSERT OR IGNORE INTO likes (project_id, user_id) VALUES (?, ?)').run(row.id, user.id);
  } else {
    db.prepare('DELETE FROM likes WHERE project_id = ? AND user_id = ?').run(row.id, user.id);
  }

  const { n } = db.prepare('SELECT COUNT(*) AS n FROM likes WHERE project_id = ?').get(row.id) as { n: number };

  return json({ likes: n, liked: Boolean(body.like) });
}
