import { json, type LoaderFunctionArgs, type MetaFunction } from '@remix-run/node';
import { Studio } from '~/components/Studio';
import { getUser, shell } from '~/lib/.server/auth';
import { eventMode } from '~/lib/.server/config';
import { db } from '~/lib/.server/db';

const PREVIEW_COPY = 'Open it, run it in your browser, then remix it into your own copy.';

// link unfurlers (Slack, WhatsApp, X, iMessage) ignore relative og:image/og:url, so these are absolute
export const meta: MetaFunction<typeof loader> = ({ data }) => {
  const title = data?.description ?? 'A project built on Foldo';
  const image = data ? `${data.origin}/og.jpg` : '/og.jpg';

  return [
    { title: `${title} · Foldo` },
    { name: 'description', content: PREVIEW_COPY },
    { property: 'og:type', content: 'website' },
    { property: 'og:site_name', content: 'Foldo' },
    { property: 'og:title', content: title },
    { property: 'og:description', content: PREVIEW_COPY },
    { property: 'og:image', content: image },
    ...(data ? [{ property: 'og:url', content: data.url }, { tagName: 'link', rel: 'canonical', href: data.url }] : []),
    { name: 'twitter:card', content: 'summary_large_image' },
    { name: 'twitter:title', content: title },
    { name: 'twitter:description', content: PREVIEW_COPY },
    { name: 'twitter:image', content: image },
  ];
};

// behind the reverse proxy the request URL is the internal one; trust the forwarded host like server.mjs does
function publicOrigin(request: Request) {
  const url = new URL(request.url);
  const host = request.headers.get('x-forwarded-host')?.split(',')[0].trim() || request.headers.get('host') || url.host;
  const proto = request.headers.get('x-forwarded-proto')?.split(',')[0].trim().toLowerCase();

  // the headers are client-controlled, so only a plain hostname and http(s) make it into the page
  return `${proto === 'https' || proto === 'http' ? proto : url.protocol.replace(':', '')}://${/^[a-z0-9.-]+(:\d{1,5})?$/i.test(host) ? host : url.host}`;
}

// Public share link: anyone can open and run the project; chatting requires an account and forks it.
export async function loader({ request, params }: LoaderFunctionArgs) {
  const row = db
    .prepare(
      `SELECT p.id, p.description, p.messages, p.template, p.listed, p.user_id AS owner, u.name AS ownerName,
         (SELECT COUNT(*) FROM likes l WHERE l.project_id = p.id) AS likes
       FROM projects p LEFT JOIN users u ON u.id = p.user_id WHERE p.share_id = ?`,
    )
    .get(params.shareId!) as any;

  if (!row) {
    throw new Response('Shared project not found', { status: 404 });
  }

  const user = await getUser(request);
  const origin = publicOrigin(request);

  const liked = user ? Boolean(db.prepare('SELECT 1 FROM likes WHERE project_id = ? AND user_id = ?').get(row.id, user.id)) : false;

  return json({
    shared: true,
    origin,
    url: `${origin}/p/${params.shareId}`,
    ...shell(user),
    // for the viewer card: who built it, likes (listed projects only), and whether this visitor owns it
    sharedInfo: {
      shareId: params.shareId!,
      owner: row.ownerName || (eventMode() ? 'A Foldo team' : 'A Foldo maker'),
      listed: Boolean(row.listed),
      likes: row.likes as number,
      liked,
      mine: user?.id === row.owner,
      // only the owner gets the project id (for "Open in studio")
      projectId: user?.id === row.owner ? (row.id as string) : undefined,
    },
    description: row.description,
    template: row.template ?? undefined,
    messages: JSON.parse(row.messages),
  });
}

export default Studio;
