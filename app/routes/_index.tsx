import { json, type LoaderFunctionArgs, type MetaFunction } from '@remix-run/node';
import { useLoaderData } from '@remix-run/react';
import { Studio } from '~/components/Studio';
import { Landing } from '~/components/landing/Landing';
import { getUser, shell } from '~/lib/.server/auth';
import { db } from '~/lib/.server/db';

export const meta: MetaFunction = () => [
  { title: 'Foldo · Describe it. Watch it build. Share the link.' },
  { name: 'description', content: 'Foldo turns a sentence into a running web app in your browser. Edit it, share it, remix it.' },
  { property: 'og:title', content: 'Foldo' },
  { property: 'og:description', content: 'Describe it. Watch it build. Share the link.' },
  { property: 'og:image', content: '/og.jpg' },
  { name: 'twitter:card', content: 'summary_large_image' },
];

// `/` is the landing page for visitors and the studio home for signed-in users
export async function loader({ request }: LoaderFunctionArgs) {
  const user = await getUser(request);

  if (!user) {
    return json({ event: shell().event });
  }

  const recent = db
    .prepare('SELECT id, description, updated FROM projects WHERE user_id = ? ORDER BY updated DESC LIMIT 3')
    .all(user.id);
  const { n } = db.prepare('SELECT COUNT(*) AS n FROM projects WHERE user_id = ?').get(user.id) as { n: number };

  return json({ ...shell(user), recent, projectCount: n });
}

export default function Index() {
  const { email } = useLoaderData() as { email?: string };

  return email ? <Studio /> : <Landing />;
}
