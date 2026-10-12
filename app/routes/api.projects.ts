import { json, type ActionFunctionArgs, type LoaderFunctionArgs } from '@remix-run/node';
import { randomBytes } from 'node:crypto';
import { requireApiUser } from '~/lib/.server/auth';
import { db } from '~/lib/.server/db';
import { cleanName } from '~/lib/.server/names';
import { queuePreview } from '~/lib/.server/previews';
import { getTemplateMeta } from '~/lib/.server/templates';

const MAX_BYTES = 5_000_000;
const newId = () => randomBytes(6).toString('hex');

export async function loader({ request }: LoaderFunctionArgs) {
  const user = await requireApiUser(request);
  const rows = db
    .prepare('SELECT id, description, share_id AS shareId, updated FROM projects WHERE user_id = ? ORDER BY updated DESC')
    .all(user.id) as any[];

  return json(rows.map((r) => ({ ...r, urlId: r.id, timestamp: new Date(r.updated).toISOString() })));
}

// PUT {id?, description, messages} = save · POST {id, share} = (un)share · POST {id, rename} = rename · DELETE {id}
export async function action({ request }: ActionFunctionArgs) {
  const user = await requireApiUser(request);
  const body = (await request.json()) as any;
  const owned = body.id && db.prepare('SELECT id FROM projects WHERE id = ? AND user_id = ?').get(body.id, user.id);

  if (request.method === 'PUT') {
    // an id that isn't this team's project (deleted in another tab, or someone else's) is never re-created as a copy;
    // new projects come from a PUT without an id
    if (body.id && !owned) {
      return json({ error: 'not found' }, 404);
    }

    if (!Array.isArray(body.messages) || JSON.stringify(body.messages).length > MAX_BYTES) {
      return json({ error: 'bad messages' }, 400);
    }

    const messages = JSON.stringify(body.messages);
    const template = getTemplateMeta(body.template)?.id ?? null; // only known template ids are stored
    const first = body.messages.find((m: any) => m?.role === 'user' && typeof m.content === 'string');
    const description =
      (typeof body.description === 'string' && body.description.slice(0, 200)) ||
      (first ? first.content.replace(/\s+/g, ' ').trim().slice(0, 60) : null);

    if (owned) {
      // a name the team chose (rename) wins over whatever description the autosave sends
      db.prepare(
        // a new version of the app gets fresh thumbnail attempts
        'UPDATE projects SET description = CASE WHEN renamed = 1 THEN description ELSE ? END, messages = ?, template = COALESCE(?, template), updated = ?, preview_fail_n = 0 WHERE id = ?',
      ).run(
        description,
        messages,
        template,
        Date.now(),
        body.id,
      );

      return json({ id: body.id });
    }

    const id = newId();
    db.prepare('INSERT INTO projects (id, user_id, description, messages, template, updated) VALUES (?, ?, ?, ?, ?, ?)').run(
      id,
      user.id,
      description,
      messages,
      template,
      Date.now(),
    );

    return json({ id });
  }

  if (!owned) {
    return json({ error: 'not found' }, 404);
  }

  if (request.method === 'DELETE') {
    db.prepare('DELETE FROM likes WHERE project_id = ?').run(body.id);
    db.prepare('DELETE FROM projects WHERE id = ?').run(body.id);

    return json({ ok: true });
  }

  if (request.method === 'POST' && 'rename' in body) {
    const description = cleanName(body.rename, 80);

    if (!description) {
      return json({ error: 'Give your project a name.' }, 400);
    }

    db.prepare('UPDATE projects SET description = ?, renamed = 1, updated = ? WHERE id = ?').run(description, Date.now(), body.id);

    return json({ ok: true, description });
  }

  if (request.method === 'POST') {
    // share: true keeps an existing link stable; share: false also removes it from the gallery
    const row = db.prepare('SELECT share_id, hidden_at FROM projects WHERE id = ?').get(body.id) as any;

    // an organizer hid it from the gallery: sharing still works, listing doesn't
    if (body.listed && row?.hidden_at) {
      return json({ error: 'The organizers removed this project from the gallery. Your share link still works.', hidden: true }, 403);
    }

    const existing = row?.share_id;
    const shareId = body.share ? existing || newId() + newId() : null;
    const listed = shareId ? (body.listed === undefined ? undefined : body.listed ? 1 : 0) : 0;

    db.prepare('UPDATE projects SET share_id = ?, listed = COALESCE(?, listed) WHERE id = ?').run(
      shareId,
      listed ?? null,
      body.id,
    );

    const isListed = shareId ? Boolean((db.prepare('SELECT listed FROM projects WHERE id = ?').get(body.id) as any).listed) : false;

    // the gallery thumbnail is drawn in the background (only if it has none or it is stale)
    if (isListed) {
      queuePreview(body.id);
    }

    return json({ shareId, listed: isListed });
  }

  return json({ error: 'method not allowed' }, 405);
}
