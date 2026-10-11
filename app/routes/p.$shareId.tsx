import { json, type LoaderFunctionArgs, type MetaFunction } from '@remix-run/node';
import { Studio } from '~/components/Studio';
import { getUser, shell } from '~/lib/.server/auth';
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
  const proto = request.headers.get('x-forwarded-proto')?.split(',')[0].trim() || url.protocol.replace(':', '');

  return `${proto}://${host}`;
}

// Public share link: anyone can open and run the project; chatting requires an account and forks it.
export async function loader({ request, params }: LoaderFunctionArgs) {
  const row = db.prepare('SELECT description, messages, template FROM projects WHERE share_id = ?').get(params.shareId!) as any;

  if (!row) {
    throw new Response('Shared project not found', { status: 404 });
  }

  const user = await getUser(request);
  const origin = publicOrigin(request);

  return json({
    shared: true,
    origin,
    url: `${origin}/p/${params.shareId}`,
    ...shell(user),
    description: row.description,
    template: row.template ?? undefined,
    messages: JSON.parse(row.messages),
  });
}

export default Studio;
