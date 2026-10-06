import { json, type ActionFunctionArgs, type LoaderFunctionArgs } from '@remix-run/node';
import { randomBytes } from 'node:crypto';
import { requireApiUser } from '~/lib/.server/auth';
import { db } from '~/lib/.server/db';

const MAX_BYTES = 5_000_000;
const newId = () => randomBytes(6).toString('hex');

export async function loader({ request }: LoaderFunctionArgs) {
  const user = await requireApiUser(request);
  const rows = db
    .prepare('SELECT id, description, share_id AS shareId, updated FROM projects WHERE user_id = ? ORDER BY updated DESC')
    .all(user.id) as any[];

  return json(rows.map((r) => ({ ...r, urlId: r.id, timestamp: new Date(r.updated).toISOString() })));
}

// PUT {id?, description, messages} = save · POST {id, share} = (un)share · DELETE {id}
export async function action({ request }: ActionFunctionArgs) {
  const user = await requireApiUser(request);
  const body = (await request.json()) as any;
  const owned = body.id && db.prepare('SELECT id FROM projects WHERE id = ? AND user_id = ?').get(body.id, user.id);

  if (request.method === 'PUT') {
    if (!Array.isArray(body.messages) || JSON.stringify(body.messages).length > MAX_BYTES) {
      return json({ error: 'bad messages' }, 400);
    }

    const messages = JSON.stringify(body.messages);
    const first = body.messages.find((m: any) => m?.role === 'user' && typeof m.content === 'string');
    const description =
      (typeof body.description === 'string' && body.description.slice(0, 200)) ||
      (first ? first.content.replace(/\s+/g, ' ').trim().slice(0, 60) : null);

    if (owned) {
      db.prepare('UPDATE projects SET description = ?, messages = ?, updated = ? WHERE id = ?').run(
        description,
        messages,
        Date.now(),
        body.id,
      );

      return json({ id: body.id });
    }

    const id = newId();
    db.prepare('INSERT INTO projects (id, user_id, description, messages, updated) VALUES (?, ?, ?, ?, ?)').run(
      id,
      user.id,
      description,
      messages,
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

  if (request.method === 'POST') {
    // share: true keeps an existing link stable; share: false also removes it from the gallery
    const existing = (db.prepare('SELECT share_id FROM projects WHERE id = ?').get(body.id) as any)?.share_id;
    const shareId = body.share ? existing || newId() + newId() : null;
    const listed = shareId ? (body.listed === undefined ? undefined : body.listed ? 1 : 0) : 0;

    db.prepare('UPDATE projects SET share_id = ?, listed = COALESCE(?, listed) WHERE id = ?').run(
      shareId,
      listed ?? null,
      body.id,
    );

    return json({ shareId, listed: shareId ? Boolean((db.prepare('SELECT listed FROM projects WHERE id = ?').get(body.id) as any).listed) : false });
  }

  return json({ error: 'method not allowed' }, 405);
}
