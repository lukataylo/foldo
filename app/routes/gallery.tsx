import { json, type LoaderFunctionArgs } from '@remix-run/node';
import { useLoaderData, useNavigation, useSearchParams } from '@remix-run/react';
import { useEffect, useRef } from 'react';
import { PageShell, type ShellData } from '~/components/PageShell';
import { SiteFooter } from '~/components/landing/MarketingNav';
import { Byline, LikeButton, Preview, ProjectCard, projectTitle, type GalleryItem } from '~/components/landing/ProjectCard';
import { TRACKS } from '~/components/landing/starters';
import { Icon } from '~/components/ui/icons';
import { getUser, shell } from '~/lib/.server/auth';
import { useEventMode } from '~/lib/hooks/useEventMode';
import { galleryCounts, galleryItems, projectSummary } from '~/lib/.server/gallery';
import { classNames } from '~/utils/classNames';

export const meta = () => [
  { title: 'Gallery · Foldo' },
  { property: 'og:title', content: 'Foldo gallery' },
  { property: 'og:image', content: '/og.jpg' },
];

const PAGE = 9;
const MAX_SHOWN = 60; // keeps the page (and its thumbnail frames) a sane size; filters narrow it further

/*
 * Public showcase of projects their owners chose to list. Anyone can browse; signed-in teams can like.
 * ?sort=new, ?track=<name>, ?n=<shown> ("Show more" asks the server for the next page).
 */
export async function loader({ request }: LoaderFunctionArgs) {
  const user = await getUser(request);
  const params = new URL(request.url).searchParams;
  const sort = params.get('sort') === 'new' ? 'new' : 'top';
  const track = TRACKS.find((t) => t === params.get('track')) ?? null;
  const shown = Math.min(Math.max(Number(params.get('n')) || PAGE, PAGE), MAX_SHOWN);

  // the featured card is the top of the "Most liked" list (all tracks), so it costs no extra query
  const withFeatured = sort === 'top' && !track;
  const items = galleryItems(user?.id, { sort, track, limit: shown + (withFeatured ? 1 : 0) });
  const featured = withFeatured && items[0]?.likes > 0 ? items[0] : null;
  const { templates: _templates, ...rest } = shell(user);

  return json({
    ...rest,
    sort,
    track,
    featured: featured ? { item: featured, summary: projectSummary(featured.id) } : null,
    items: featured ? items.slice(1) : items.slice(0, shown),
    counts: galleryCounts(),
    now: Date.now(),
  });
}

function Featured({ item, summary, signedIn, now }: { item: GalleryItem; summary: string; signedIn: boolean; now: number }) {
  const href = `/p/${item.shareId}`;

  return (
    <section
      aria-labelledby="featured-title"
      className="grid items-center gap-6 rounded-[16px] border border-solid border-rule bg-sheet p-6 md:grid-cols-2 md:gap-8 lg:grid-cols-[minmax(0,300px)_minmax(0,1.25fr)_minmax(0,1fr)]"
      data-testid="foldo-gallery-featured"
    >
      <img
        src="/art/gallery-winner.webp"
        alt="Foldo proudly wearing a rosette beside a paper trophy"
        width={1024}
        height={1024}
        className="hidden aspect-square h-auto w-full rounded-[12px] border border-solid border-rule object-cover lg:block"
      />
      <a href={href} tabIndex={-1} aria-hidden="true" className="block overflow-hidden rounded-[12px] border border-solid border-rule">
        <Preview item={item} size="featured" />
      </a>
      <div className="flex flex-col gap-[14px]">
        <span className="pill-live self-start">
          <span className="pill-dot" aria-hidden="true" />
          {useEventMode() ? 'Most liked this event' : 'Most liked'}
        </span>
        <h2 id="featured-title" className="m-0 font-serif text-[36px] font-normal leading-none tracking-[-.01em] md:text-[44px]">
          <a href={href} className="text-ink no-underline hover:underline">
            {projectTitle(item)}
          </a>
        </h2>
        {summary && <p className="m-0 text-pretty text-[16px] text-ink2">{summary}</p>}
        <Byline item={item} now={now} />
        <div className="mt-[6px] flex flex-wrap items-center gap-3">
          <a href={href} className="btn-primary btn-lg">
            Run it <Icon.ArrowRight />
          </a>
          <LikeButton item={item} signedIn={signedIn} large />
        </div>
      </div>
    </section>
  );
}

function Empty({ filtered, onReset }: { filtered: boolean; onReset: () => void }) {
  const eventMode = useEventMode();
  const group = eventMode ? 'track' : 'category';

  return (
    <div className="flex flex-col items-center gap-5 rounded-[16px] border border-solid border-rule bg-sheet px-6 py-14 text-center" data-testid="foldo-gallery-empty">
      <img
        src="/art/empty-gallery.webp"
        alt="Foldo posing on an empty museum pedestal"
        width={1024}
        height={1024}
        className="h-auto w-[220px] rounded-[14px] border border-solid border-rule"
      />
      <div className="flex max-w-[420px] flex-col gap-2">
        <h2 className="m-0 font-serif text-[32px] font-normal leading-none">{filtered ? `Nothing in this ${group} yet` : 'Nothing in the gallery yet'}</h2>
        <p className="m-0 text-pretty text-[16px] text-ink2">
          {filtered
            ? `${eventMode ? 'No team' : 'Nobody'} has shared a project from this ${group}. Try another ${group}, or build the first one.`
            : 'Build something, open Share and turn on "Show in gallery". Be the first.'}
        </p>
      </div>
      <div className="flex flex-wrap justify-center gap-3">
        {filtered && (
          <button type="button" onClick={onReset} className="btn-secondary btn-md">
            Show all projects
          </button>
        )}
        <a href="/" className="btn-primary btn-md">
          Start building <Icon.ArrowRight />
        </a>
      </div>
    </div>
  );
}

export default function Gallery() {
  const d = useLoaderData<typeof loader>() as unknown as ShellData & {
    sort: 'top' | 'new';
    track: string | null;
    items: GalleryItem[];
    featured: { item: GalleryItem; summary: string } | null;
    counts: Record<string, number>;
    now: number;
  };
  const [params, setParams] = useSearchParams();
  const navigation = useNavigation();
  const loading = navigation.state === 'loading' && navigation.location?.pathname === '/gallery';
  const list = useRef<HTMLUListElement>(null);
  const focusFrom = useRef<number | null>(null);
  const { sort, track, items, featured, counts, now } = d;
  const signedIn = Boolean(d.email);
  const eventMode = useEventMode();
  const offset = featured ? 1 : 0;
  const total = (track ? counts[track] : counts.all) ?? 0;
  const remaining = total - offset - items.length;

  // after "Show more", move focus to the first new card
  useEffect(() => {
    const from = focusFrom.current;

    if (from !== null && items.length > from) {
      focusFrom.current = null;
      list.current?.querySelectorAll<HTMLAnchorElement>('li h3 a')[from]?.focus();
    }
  }, [items]);

  const set = (next: Record<string, string | null>) => {
    const p = new URLSearchParams(params);

    for (const [k, v] of Object.entries(next)) {
      if (v && !(k === 'sort' && v === 'top')) {
        p.set(k, v);
      } else {
        p.delete(k);
      }
    }

    setParams(p, { preventScrollReset: true });
  };

  const chip = (label: string, count: number, value: string | null) => {
    const on = track === value;

    return (
      <button
        key={label}
        type="button"
        aria-pressed={on}
        onClick={() => set({ track: value, n: null })}
        className={classNames(
          'inline-flex h-[34px] cursor-pointer items-center gap-2 rounded-full border border-solid px-[14px] font-sans text-[14px] font-medium outline-none transition-colors duration-fast focus-visible:shadow-[0_0_0_2px_#FBF8F1,0_0_0_4px_#16140F]',
          on ? 'border-ink bg-ink text-paper' : 'border-field bg-sheet text-ink hover:bg-wash',
        )}
      >
        {label}
        <span className={classNames('font-mono text-[12px]', on ? 'text-field' : 'text-pencil')}>{count}</span>
      </button>
    );
  };

  return (
    <PageShell
      data={d}
      active="gallery"
      mainClassName={signedIn ? 'flex flex-col gap-10 pb-24 pt-12' : 'flex flex-col gap-10 pb-24 pt-6'}
      footer={!signedIn && <SiteFooter compact />}
    >
      <div className="flex flex-col gap-7" data-testid="foldo-gallery">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div className="flex flex-col gap-3">
            <span className="eyebrow">
              {d.event?.name ? `${d.event.name} · ` : ''}
              {counts.all} {counts.all === 1 ? 'project' : 'projects'}
            </span>
            <h1 className="m-0 font-serif text-[64px] font-normal leading-[.92] tracking-[-.02em] md:text-[88px]">Gallery</h1>
            <p className="m-0 max-w-[560px] text-pretty text-[18px] text-ink2">
              {eventMode ? 'Projects teams chose to show off.' : 'Projects people made with Foldo and chose to show off.'} Run one, then like your <span className="marker">favourites.</span>
            </p>
          </div>
          <div role="group" aria-label="Sort projects" className="inline-flex rounded-[7px] border border-solid border-rule bg-paper p-[2px]">
            {(['top', 'new'] as const).map((s) => (
              <button
                key={s}
                type="button"
                aria-pressed={sort === s}
                onClick={() => set({ sort: s, n: null })}
                className={classNames(
                  'h-[36px] cursor-pointer rounded-[6px] border border-solid px-[14px] font-sans text-[14px] outline-none focus-visible:shadow-[0_0_0_2px_#16140F]',
                  sort === s ? 'border-rule bg-sheet font-semibold text-ink' : 'border-transparent bg-transparent font-medium text-ink2 hover:text-ink',
                )}
              >
                {s === 'top' ? 'Most liked' : 'Newest'}
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-4 border-t border-solid border-rule pt-5">
          <div role="group" aria-label={eventMode ? 'Filter by track' : 'Filter by category'} className="flex flex-wrap gap-2">
            {chip('All', counts.all, null)}
            {TRACKS.map((t) => chip(t, counts[t] ?? 0, t))}
          </div>
          {!signedIn && (
            <p className="m-0 text-[14px] text-pencil">
              <a href="/login?next=%2Fgallery" className="font-semibold text-ink underline underline-offset-3">
                Sign in
              </a>{' '}
              to like projects.
            </p>
          )}
        </div>
      </div>

      {featured && <Featured item={featured.item} summary={featured.summary} signedIn={signedIn} now={now} />}

      {items.length === 0 ? (
        !featured && <Empty filtered={Boolean(track) && counts.all > 0} onReset={() => set({ track: null, n: null })} />
      ) : (
        <section aria-labelledby="all-title" className="flex flex-col gap-5">
          <div className="flex items-baseline justify-between gap-4">
            <h2 id="all-title" className="m-0 font-serif text-[32px] font-normal leading-none">
              {track ?? (featured ? 'All projects' : 'Projects')}
            </h2>
            <span className="font-mono text-[12px] text-pencil">
              Showing {offset + 1}–{offset + items.length} of {total}
            </span>
          </div>
          <ul ref={list} className="m-0 grid list-none grid-cols-1 gap-6 p-0 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((item) => (
              <ProjectCard key={item.id} item={item} signedIn={signedIn} now={now} />
            ))}
          </ul>
          {remaining > 0 && items.length < MAX_SHOWN && (
            <div className="mt-4 flex justify-center">
              <button
                type="button"
                aria-busy={loading || undefined}
                disabled={loading}
                onClick={() => {
                  focusFrom.current = items.length;
                  set({ n: String(items.length + PAGE) });
                }}
                className="btn-secondary btn-lg"
              >
                {loading && <Icon.Spinner />}
                Show more projects
              </button>
            </div>
          )}
        </section>
      )}
    </PageShell>
  );
}
