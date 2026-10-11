import { json, type LoaderFunctionArgs } from '@remix-run/node';
import { useLoaderData, useSearchParams } from '@remix-run/react';
import { useState } from 'react';
import { EventBar } from '~/components/header/EventBar';
import { AppHeader, SiteHeader, type ShellData } from '~/components/PageShell';
import { MobileNav, SiteFooter } from '~/components/landing/MarketingNav';
import { Byline, LikeButton, Preview, ProjectCard, projectTitle, type GalleryItem } from '~/components/landing/ProjectCard';
import { Icon } from '~/components/ui/icons';
import { getUser, shell } from '~/lib/.server/auth';
import { galleryItems, projectSummary } from '~/lib/.server/gallery';
import { classNames } from '~/utils/classNames';

export const meta = () => [
  { title: 'Gallery · Foldo' },
  { property: 'og:title', content: 'Foldo gallery' },
  { property: 'og:image', content: '/og.jpg' },
];

const TRACKS = ['Payments', 'Access to Finance', 'Fraud and Security'];
const PAGE = 9;

// Public showcase of projects their owners chose to list. Anyone can browse; signed-in teams can like.
export async function loader({ request }: LoaderFunctionArgs) {
  const user = await getUser(request);
  const sort = new URL(request.url).searchParams.get('sort') === 'new' ? 'new' : 'top';
  const items = galleryItems(user?.id, sort, 500);

  // the most liked project gets the featured card, whichever sort is showing
  const top = sort === 'top' ? items[0] : galleryItems(user?.id, 'top', 1)[0];
  const featured = top && top.likes > 0 ? { id: top.id, summary: projectSummary(top.id) } : null;
  const { templates: _templates, ...rest } = shell(user);

  return json({ ...rest, items, featured });
}

function Featured({ item, summary, signedIn }: { item: GalleryItem; summary: string; signedIn: boolean }) {
  const href = `/p/${item.shareId}`;

  return (
    <section
      aria-labelledby="featured-title"
      className="grid items-center gap-8 rounded-[16px] border border-solid border-rule bg-sheet p-6 lg:grid-cols-[minmax(0,300px)_minmax(0,1.25fr)_minmax(0,1fr)]"
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
          Most liked this event
        </span>
        <h2 id="featured-title" className="m-0 font-serif text-[44px] font-normal leading-none tracking-[-.01em]">
          <a href={href} className="text-ink no-underline hover:underline">
            {projectTitle(item)}
          </a>
        </h2>
        {summary && <p className="m-0 text-pretty text-[16px] text-ink2">{summary}</p>}
        <Byline item={item} />
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
        <h2 className="m-0 font-serif text-[32px] font-normal leading-none">{filtered ? 'Nothing in this track yet' : 'Nothing in the gallery yet'}</h2>
        <p className="m-0 text-pretty text-[16px] text-ink2">
          {filtered
            ? 'No team has shared a project from this track. Try another track, or build the first one.'
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
  const d = useLoaderData<typeof loader>() as unknown as ShellData & { items: GalleryItem[]; featured: { id: string; summary: string } | null };
  const [params, setParams] = useSearchParams();
  const [shown, setShown] = useState(PAGE);
  const sort = params.get('sort') === 'new' ? 'new' : 'top';
  const track = TRACKS.find((t) => t === params.get('track')) ?? null;
  const signedIn = Boolean(d.email);

  const set = (next: { sort?: string; track?: string | null }) => {
    const p = new URLSearchParams(params);

    for (const [k, v] of Object.entries(next)) {
      if (v && !(k === 'sort' && v === 'top')) {
        p.set(k, v);
      } else {
        p.delete(k);
      }
    }

    setShown(PAGE);
    setParams(p, { preventScrollReset: true });
  };

  const inTrack = track ? d.items.filter((i) => i.track === track) : d.items;
  const featured = !track && d.featured ? d.items.find((i) => i.id === d.featured!.id) : undefined;
  const rest = featured ? inTrack.filter((i) => i.id !== featured.id) : inTrack;
  const offset = featured ? 1 : 0;
  const visible = rest.slice(0, shown);
  const total = d.items.length;

  const chip = (label: string, count: number, value: string | null) => {
    const on = track === value;

    return (
      <button
        key={label}
        type="button"
        aria-pressed={on}
        onClick={() => set({ track: value })}
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
    // PageShell's frame plus the marketing footer (PageShell has no footer slot yet)
    <div className="h-full overflow-y-auto bg-paper text-[15px] leading-[1.5] text-ink">
      <EventBar event={d.event} variant={signedIn ? 'app' : 'marketing'} />
      {signedIn ? (
        <AppHeader data={d} active="gallery" />
      ) : (
        <>
          <div className="hidden md:block">
            <SiteHeader active="gallery" />
          </div>
          <div className="md:hidden">
            <MobileNav />
          </div>
        </>
      )}
      <main className={classNames(signedIn ? 'container-app pt-12' : 'container-marketing pt-6', 'flex flex-col gap-10 pb-24')}>
      <div className="flex flex-col gap-7" data-testid="foldo-gallery">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div className="flex flex-col gap-3">
            <span className="eyebrow">
              {d.event?.name ? `${d.event.name} · ` : ''}
              {total} {total === 1 ? 'project' : 'projects'}
            </span>
            <h1 className="m-0 font-serif text-[64px] font-normal leading-[.92] tracking-[-.02em] md:text-[88px]">Gallery</h1>
            <p className="m-0 max-w-[560px] text-pretty text-[18px] text-ink2">
              Projects teams chose to show off. Run one, then like your <span className="marker">favourites.</span>
            </p>
          </div>
          <div role="group" aria-label="Sort projects" className="inline-flex rounded-[7px] border border-solid border-rule bg-paper p-[2px]">
            {(['top', 'new'] as const).map((s) => (
              <button
                key={s}
                type="button"
                aria-pressed={sort === s}
                onClick={() => set({ sort: s })}
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
          <div role="group" aria-label="Filter by track" className="flex flex-wrap gap-2">
            {chip('All', total, null)}
            {TRACKS.map((t) => chip(t, d.items.filter((i) => i.track === t).length, t))}
          </div>
          {!signedIn && (
            <p className="m-0 text-[14px] text-pencil">
              <a href="/login" className="font-semibold text-ink underline underline-offset-3">
                Sign in
              </a>{' '}
              to like projects.
            </p>
          )}
        </div>
      </div>

      {featured && <Featured item={featured} summary={d.featured!.summary} signedIn={signedIn} />}

      {rest.length === 0 ? (
        !featured && <Empty filtered={Boolean(track) && total > 0} onReset={() => set({ track: null })} />
      ) : (
        <section aria-labelledby="all-title" className="flex flex-col gap-5">
          <div className="flex items-baseline justify-between gap-4">
            <h2 id="all-title" className="m-0 font-serif text-[32px] font-normal leading-none">
              {track ?? (featured ? 'All projects' : 'Projects')}
            </h2>
            <span className="font-mono text-[12px] text-pencil">
              Showing {offset + 1}–{offset + visible.length} of {offset + rest.length}
            </span>
          </div>
          <ul className="m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(min(360px,100%),1fr))] gap-6 p-0">
            {visible.map((item) => (
              <ProjectCard key={item.id} item={item} signedIn={signedIn} />
            ))}
          </ul>
          {visible.length < rest.length && (
            <div className="mt-4 flex justify-center">
              <button type="button" onClick={() => setShown(shown + PAGE)} className="btn-secondary btn-lg">
                Show more projects
              </button>
            </div>
          )}
        </section>
      )}
      </main>
      {!signedIn && <SiteFooter compact />}
    </div>
  );
}
