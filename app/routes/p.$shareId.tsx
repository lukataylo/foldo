import { json, type LoaderFunctionArgs, type MetaFunction } from '@remix-run/node';
import { Studio } from '~/components/Studio';
import { getUser, shell } from '~/lib/.server/auth';
import { db } from '~/lib/.server/db';

export const meta: MetaFunction<typeof loader> = ({ data }) => [
  { title: `${data?.description ?? 'Shared project'} · Foldo` },
  { property: 'og:title', content: data?.description ?? 'A project built on Foldo' },
  { property: 'og:description', content: 'Run it in your browser, then remix it into your own copy.' },
  { property: 'og:image', content: '/og.jpg' },
  { name: 'twitter:card', content: 'summary_large_image' },
];

// Public share link: anyone can open and run the project; chatting requires an account and forks it.
export async function loader({ request, params }: LoaderFunctionArgs) {
  const row = db.prepare('SELECT description, messages, template FROM projects WHERE share_id = ?').get(params.shareId!) as any;

  if (!row) {
    throw new Response('Shared project not found', { status: 404 });
  }

  const user = await getUser(request);

  return json({
    shared: true,
    ...shell(user),
    description: row.description,
    template: row.template ?? undefined,
    messages: JSON.parse(row.messages),
  });
}

export default Studio;
