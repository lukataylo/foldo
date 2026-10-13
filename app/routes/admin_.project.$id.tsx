import { json, type LoaderFunctionArgs, type MetaFunction } from '@remix-run/node';
import { Studio } from '~/components/Studio';
import { requireAdmin, shell } from '~/lib/.server/auth';
import { db } from '~/lib/.server/db';

export const meta: MetaFunction<typeof loader> = ({ data }) => [{ title: `${data?.description ?? 'Project'} · Admin · Foldo` }];

// Organizers can open any team's project read-only (judging works even if it was never shared); a message forks a copy
export async function loader({ request, params }: LoaderFunctionArgs) {
  const admin = await requireAdmin(request);
  const row = db
    .prepare(
      `SELECT p.id, p.description, p.messages, p.template, p.share_id AS shareId, u.name AS ownerName, u.email
       FROM projects p LEFT JOIN users u ON u.id = p.user_id WHERE p.id = ?`,
    )
    .get(params.id!) as any;

  if (!row) {
    throw new Response('Project not found', { status: 404 });
  }

  const url = new URL(request.url);

  return json({
    shared: true,
    url: row.shareId ? `${url.origin}/p/${row.shareId}` : url.href,
    ...shell(admin),
    sharedInfo: {
      shareId: row.shareId ?? undefined,
      owner: row.ownerName || row.email || 'A team',
      listed: false,
      likes: 0,
      liked: false,
      mine: false,
    },
    description: row.description,
    template: row.template ?? undefined,
    messages: JSON.parse(row.messages),
  });
}

export default Studio;
