import { json, type LoaderFunctionArgs } from '@remix-run/node';
import { useLoaderData, useSearchParams } from '@remix-run/react';
import { useState } from 'react';
import { toast } from 'react-toastify';
import { Logo } from '~/components/brand/Logo';
import { EventBar, type EventInfo } from '~/components/header/EventBar';
import { UserMenu } from '~/components/header/UserMenu';
import { iconFor } from '~/components/landing/starters';
import { getUser, shell } from '~/lib/.server/auth';
import { db } from '~/lib/.server/db';
import { timeAgo } from '~/utils/timeAgo';

export const meta = () => [
  { title: 'Gallery · Foldo' },
  { property: 'og:title', content: 'Foldo gallery' },
  { property: 'og:image', content: '/og.jpg' },
];

interface Item {
  id: string;
  shareId: string;
  description: string | null;
  name: string;
  updated: number;
  likes: number;
  liked: number;
  mine: number;
}

// Public showcase of projects their owners chose to list. Anyone can browse; signed-in teams can like.
export async function loader({ request }: LoaderFunctionArgs) {
  const user = await getUser(request);
  const sort = new URL(request.url).searchParams.get('sort') === 'new' ? 'new' : 'top';
  const items = db
    .prepare(
      `SELECT p.id, p.share_id AS shareId, p.description, u.name, p.updated,
         (SELECT COUNT(*) FROM likes l WHERE l.project_id = p.id) AS likes,
         (SELECT COUNT(*) FROM likes l WHERE l.project_id = p.id AND l.user_id = ?) AS liked,
         (p.user_id = ?) AS mine
       FROM projects p JOIN users u ON u.id = p.user_id
       WHERE p.listed = 1 AND p.share_id IS NOT NULL AND u.disabled = 0
       ORDER BY ${sort === 'new' ? 'p.updated' : 'likes DESC, p.updated'} DESC LIMIT 120`,
    )
    .all(user?.id ?? '', user?.id ?? '');

  return json({ ...shell(user), items });
}

function Card({ item, signedIn }: { item: Item; signedIn: boolean }) {
  const [likes, setLikes] = useState(item.likes);
  const [liked, setLiked] = useState(Boolean(item.liked));

  const toggle = async () => {
    if (!signedIn) {
      return (window.location.href = '/login?mode=register');
    }

    const res = await fetch('/api/like', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ shareId: item.shareId, like: !liked }),
    });

    if (!res.ok) {
      return toast.error(((await res.json().catch(() => ({}))) as any).error ?? 'Could not like this project');
    }

    const data = (await res.json()) as { likes: number; liked: boolean };
    setLikes(data.likes);
    setLiked(data.liked);
  };

  return (
    <li className="overflow-hidden rounded-2xl border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 transition hover:-translate-y-0.5 hover:border-[var(--foldo-yellow)]">
      <a href={`/p/${item.shareId}`} className="block">
        <div className="paper-tile flex h-36 items-center justify-center">
          <img src={`/art/icon-${iconFor(item.id, item.description)}.webp`} alt="" width={96} height={96} loading="lazy" />
        </div>
        <div className="px-4 pt-3">
          <div className="truncate font-semibold">{item.description || 'Untitled project'}</div>
          <div className="mt-0.5 truncate text-xs text-bolt-elements-textTertiary">
            by {item.name} · {timeAgo(item.updated)}
          </div>
        </div>
      </a>
      <div className="flex items-center justify-between px-4 pb-3 pt-2">
        <a href={`/p/${item.shareId}`} className="text-sm font-medium text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary">
          Run it →
        </a>
        <button
          onClick={toggle}
          disabled={Boolean(item.mine)}
          aria-pressed={liked}
          aria-label={liked ? 'Unlike' : 'Like'}
          className={`flex items-center gap-1 rounded-full border px-2.5 py-1 text-sm disabled:opacity-60 ${liked ? 'border-[var(--foldo-yellow)] bg-[var(--foldo-yellow)] text-[#111]' : 'border-bolt-elements-borderColor text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary'}`}
        >
          <span className={liked ? 'i-ph:heart-fill' : 'i-ph:heart'} /> {likes}
        </button>
      </div>
    </li>
  );
}

export default function Gallery() {
  const d = useLoaderData<typeof loader>() as any as { email?: string; name?: string; admin?: boolean; remaining?: number; event: EventInfo | null; items: Item[] };
  const [params, setParams] = useSearchParams();
  const sort = params.get('sort') === 'new' ? 'new' : 'top';

  return (
    <div className="h-full overflow-y-auto bg-bolt-elements-background-depth-1 text-bolt-elements-textPrimary">
      <header className="mx-auto flex max-w-[1100px] items-center justify-between px-6 py-5">
        <Logo size={32} />
        {d.email ? (
          <UserMenu email={d.email} name={d.name} admin={d.admin} remaining={d.remaining} />
        ) : (
          <a href="/login?mode=register" className="rounded-lg bg-bolt-elements-button-primary-background px-4 py-2 text-sm font-semibold text-bolt-elements-button-primary-text hover:bg-bolt-elements-button-primary-backgroundHover">
            Sign up free
          </a>
        )}
      </header>
      <EventBar event={d.event} />

      <main className="mx-auto max-w-[1100px] px-6 pb-16" data-testid="foldo-gallery">
        <div className="mb-8 mt-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="font-display text-4xl">Gallery</h1>
            <p className="mt-1 text-bolt-elements-textSecondary">Projects teams chose to show off. Run one, then like your favourites.</p>
          </div>
          <div className="flex rounded-full border border-bolt-elements-borderColor p-0.5 text-sm">
            {(['top', 'new'] as const).map((s) => (
              <button
                key={s}
                onClick={() => setParams(s === 'top' ? {} : { sort: s })}
                className={`rounded-full px-3 py-1 ${sort === s ? 'bg-[var(--foldo-yellow)] font-semibold text-[#111]' : 'text-bolt-elements-textSecondary'}`}
              >
                {s === 'top' ? 'Most liked' : 'Newest'}
              </button>
            ))}
          </div>
        </div>

        {d.items.length === 0 ? (
          <div className="flex flex-col items-center rounded-3xl border border-dashed border-bolt-elements-borderColor py-14 text-center" data-testid="foldo-gallery-empty">
            <img src="/art/trophy.webp" alt="" width={200} className="mb-6 rounded-2xl" />
            <h2 className="text-xl font-semibold">Nothing in the gallery yet</h2>
            <p className="mb-5 mt-1 max-w-sm text-bolt-elements-textSecondary">
              Build something, hit Share, and tick "Show in gallery". Be the first.
            </p>
            <a href="/" className="rounded-lg bg-bolt-elements-button-primary-background px-5 py-2.5 text-sm font-semibold text-bolt-elements-button-primary-text hover:bg-bolt-elements-button-primary-backgroundHover">
              Start building
            </a>
          </div>
        ) : (
          <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {d.items.map((item) => (
              <Card key={item.id} item={item} signedIn={Boolean(d.email)} />
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
