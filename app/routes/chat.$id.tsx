import { json, type LoaderFunctionArgs, type MetaFunction } from '@remix-run/node';
import { Studio } from '~/components/Studio';
import { requireUser, shell } from '~/lib/.server/auth';
import { db } from '~/lib/.server/db';

export const meta: MetaFunction<typeof loader> = ({ data }) => [{ title: `${data?.description ?? 'Project'} · Foldo` }];

export async function loader({ request, params }: LoaderFunctionArgs) {
  const user = await requireUser(request);
  const row = db
    .prepare('SELECT id, description, messages, share_id AS shareId, listed FROM projects WHERE id = ? AND user_id = ?')
    .get(params.id!, user.id) as any;

  if (!row) {
    throw new Response('Project not found', { status: 404 });
  }

  return json({
    ...shell(user),
    id: row.id,
    description: row.description,
    shareId: row.shareId,
    listed: Boolean(row.listed),
    messages: JSON.parse(row.messages),
  });
}

export default Studio;
