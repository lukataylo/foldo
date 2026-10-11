import { useId, useRef, useState } from 'react';
import { toast } from 'react-toastify';
import { Icon } from '~/components/ui/icons';
import { iconProps } from '~/lib/templates/client';
import { classNames } from '~/utils/classNames';
import { timeAgo } from '~/utils/timeAgo';

// what the gallery loaders send (lib/.server/gallery.ts)
export interface GalleryItem {
  id: string;
  shareId: string;
  description: string | null;
  name: string;
  updated: number;
  icon: string | null;
  track: string | null;
  likes: number;
  liked: boolean;
  mine: boolean;
}

export const projectTitle = (item: GalleryItem) => item.description || 'Untitled project';

// like / unlike with the server's count; visitors are sent to sign in, owners can't like their own project
export function useLike(item: GalleryItem, signedIn: boolean) {
  const [state, setState] = useState({ likes: item.likes, liked: item.liked });
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);

  const toggle = async () => {
    if (!signedIn) {
      window.location.href = `/login?next=${encodeURIComponent(location.pathname + location.search)}`;
      return;
    }

    // a second click while the first is on its way would send a stale like/unlike
    if (inFlight.current) {
      return;
    }

    inFlight.current = true;
    setBusy(true);

    try {
      const res = await fetch('/api/like', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shareId: item.shareId, like: !state.liked }),
      });
      const data = (await res.json().catch(() => ({}))) as { likes?: number; liked?: boolean; error?: string };

      if (!res.ok || data.likes === undefined) {
        toast.error(
          res.status === 404
            ? 'That project is no longer listed.'
            : res.status === 429
              ? 'Slow down a little and try again.'
              : res.status === 401
                ? 'Please sign in again to like projects.'
                : (data.error ?? 'Could not save your like. Try again.'),
        );
        return;
      }

      setState({ likes: data.likes, liked: Boolean(data.liked) });
    } catch {
      toast.error('Could not reach Foldo. Check your connection and try again.');
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  return { ...state, busy, toggle };
}

export function LikeButton({ item, signedIn, large = false }: { item: GalleryItem; signedIn: boolean; large?: boolean }) {
  const { likes, liked, busy, toggle } = useLike(item, signedIn);
  const title = projectTitle(item);
  const countId = useId();

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={item.mine}
      aria-busy={busy || undefined}
      aria-pressed={liked}
      aria-label={`Like ${title}`}
      aria-describedby={countId}
      title={item.mine ? 'This is your project' : undefined}
      className={classNames(
        'inline-flex shrink-0 cursor-pointer items-center border border-solid font-mono font-medium outline-none transition-colors duration-fast focus-visible:shadow-[0_0_0_2px_#FBF8F1,0_0_0_4px_#16140F] disabled:cursor-default',
        large ? 'min-h-[44px] gap-2 rounded-[8px] px-4 text-[14px]' : 'h-[32px] gap-[6px] rounded-full px-3 text-[13px]',
        liked ? 'border-ink bg-wash text-ink' : 'border-field bg-sheet text-ink2 enabled:hover:bg-wash enabled:hover:text-ink',
      )}
    >
      <Icon.Heart size={large ? 18 : 16} fill={liked ? 'currentColor' : 'none'} />
      <span id={countId} aria-label={`${likes} ${likes === 1 ? 'like' : 'likes'}`}>
        {likes}
      </span>
    </button>
  );
}

export function TrackTag({ track }: { track: string | null }) {
  return track ? (
    <span className="inline-flex h-[24px] items-center rounded-full border border-solid border-rule bg-paper px-[10px] text-[12px] font-medium text-ink2">
      {track}
    </span>
  ) : null;
}

// `now` comes from the loader so the server and the browser print the same "2h ago"
export function Byline({ item, now }: { item: GalleryItem; now: number }) {
  return (
    <div className="flex flex-wrap items-center gap-[10px] text-[13px] text-pencil">
      <span>
        by {item.name} · {timeAgo(item.updated, now)}
      </span>
      <TrackTag track={item.track} />
    </div>
  );
}

const FRAME = {
  strip: 'aspect-[16/10] px-8 pt-6',
  grid: 'aspect-[16/9] px-7 pt-5',
  featured: 'aspect-[16/10] px-10 pt-7',
};

/*
 * Stand-in for a screenshot: a browser window on Wash with the project's template art. Projects have no stored
 * screenshot, and booting each one in a WebContainer just to draw a card would be far too heavy.
 */
export function Preview({ item, size = 'grid' }: { item: GalleryItem; size?: 'strip' | 'grid' | 'featured' }) {
  const featured = size === 'featured';

  return (
    <div
      className={classNames('flex items-end overflow-hidden bg-wash', FRAME[size])}
    >
      <div
        className={classNames(
          'flex h-full w-full flex-col overflow-hidden border border-b-0 border-solid border-rule bg-sheet',
          featured ? 'rounded-t-[10px]' : 'rounded-t-[8px]',
        )}
      >
        <div
          className={classNames(
            'flex shrink-0 items-center border-b border-solid border-rule2',
            featured ? 'h-[28px] gap-[5px] px-[10px]' : 'h-[22px] gap-1 px-2',
          )}
        >
          {[0, 1, 2].map((i) => (
            <span key={i} className={classNames('rounded-full bg-rule', featured ? 'h-[7px] w-[7px]' : 'h-[6px] w-[6px]')} />
          ))}
          <span className="ml-3 truncate font-mono text-[10px] text-pencil">/p/{item.shareId.slice(0, 8)}</span>
        </div>
        <div className="flex min-h-0 flex-1 items-center justify-center p-3">
          <img
            {...iconProps(item.icon ?? undefined)}
            alt=""
            width={featured ? 160 : 112}
            height={featured ? 160 : 112}
            loading="lazy"
            className="h-auto max-h-full w-auto max-w-[45%] object-contain"
          />
        </div>
      </div>
    </div>
  );
}

// gallery card (Landing strip and Gallery grid): preview, serif title, byline + track, Run it and the like count
export function ProjectCard({
  item,
  signedIn,
  now,
  size = 'grid',
}: {
  item: GalleryItem;
  signedIn: boolean;
  now: number;
  size?: 'strip' | 'grid';
}) {
  const href = `/p/${item.shareId}`;
  const title = projectTitle(item);

  return (
    <li className="flex flex-col overflow-hidden rounded-[12px] border border-solid border-rule bg-sheet">
      <a href={href} tabIndex={-1} aria-hidden="true" className="block border-b border-solid border-rule no-underline">
        <Preview item={item} size={size} />
      </a>
      <div className={classNames('flex flex-1 flex-col gap-2 px-5 pb-4', size === 'strip' ? 'pt-5' : 'pt-[18px]')}>
        <h3 className="m-0 font-serif text-[24px] font-normal leading-[1.1]">
          <a href={href} className="text-ink no-underline hover:underline">
            {title}
          </a>
        </h3>
        <Byline item={item} now={now} />
        <div className="mt-auto flex items-center justify-between gap-3 border-t border-solid border-rule2 pt-3">
          <a
            href={href}
            aria-label={`Run ${title}`}
            className="inline-flex min-h-[32px] items-center gap-[6px] rounded-[4px] text-[14px] font-semibold text-ink no-underline outline-none hover:underline focus-visible:shadow-[0_0_0_2px_#16140F]"
          >
            Run it <Icon.ArrowRight />
          </a>
          <LikeButton item={item} signedIn={signedIn} />
        </div>
      </div>
    </li>
  );
}
