import { useLoaderData } from '@remix-run/react';
import type { ReactNode } from 'react';
import { Icon } from '~/components/ui/icons';
import { useEventMode } from '~/lib/hooks/useEventMode';
import { ProjectThumb } from './ProjectThumb';
import { editedAgo, projectTag, projectTitle, PROMPT_PILL, TAG_PILL, type ProjectSummary, type TemplateInfo } from './projects';

/*
 * Signed-in home: the studio's empty state before the first message.
 * - Home-FirstRun (no projects yet): full-bleed yellow hero with the build card, then three big track cards.
 * - Home (returning): headline + prompt, "Continue where you left off", compact template rows per track.
 * BaseChat renders this instead of the message list and hands over the prompt box (`prompt`); it may pass a function to
 * get the variant ('hero' = the white card on yellow, 'home' = the plain box). Keep the #intro and #examples ids:
 * Chat.client animates them away when the first message is sent.
 */
export type PromptVariant = 'hero' | 'home';

interface HomeData {
  name?: string;
  recent?: ProjectSummary[];
  projectCount?: number;
  templates?: TemplateInfo[];
  now?: number;
}

interface HomeProps {
  prompt: ReactNode | ((variant: PromptVariant) => ReactNode);
  onStartTemplate?: (id: string) => void;
}

const TRACKS = [
  {
    track: 'Payments',
    img: 'track-payments',
    alt: 'Shopkeeper Foldo behind a paper counter, holding a coin for the next customer',
    altCompact: 'Shopkeeper Foldo taking a payment with a paper coin',
    blurb: 'Checkouts, payment links and transfers.',
  },
  {
    track: 'Access to Finance',
    img: 'track-access',
    alt: 'Foldo turning a big paper key in the door of a little bank',
    altCompact: 'Foldo unlocking the bank door with a big paper key',
    blurb: 'Budgeting, savings and fair micro-loans.',
  },
  {
    track: 'Fraud and Security',
    img: 'track-fraud',
    alt: 'Detective Foldo studying a hooked envelope through a magnifying glass',
    altCompact: 'Detective Foldo inspecting a hooked envelope with a magnifying glass',
    blurb: 'Scam checkers and fraud monitoring.',
  },
  { track: 'Any track', img: '', alt: '', altCompact: '', blurb: '' },
];

// board order inside a track; the first one is what a big track card starts
const ORDER = [
  'payments-checkout',
  'payments-transfer',
  'access-budget',
  'access-loan',
  'fraud-scam-check',
  'fraud-ops-console',
  'blank-finance',
  'blank-carbon',
];

const rank = (id: string) => (ORDER.includes(id) ? ORDER.indexOf(id) : ORDER.length);
const inTrack = (templates: TemplateInfo[], track: string) =>
  templates.filter((t) => t.track === track).sort((a, b) => rank(a.id) - rank(b.id));

const FOCUS = 'outline-none focus-visible:shadow-[0_0_0_2px_#FBF8F1,0_0_0_4px_#16140F]';

function SectionHead({ id, title, size, children }: { id: string; title: string; size: number; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-4 border-b border-ink pb-3">
      <h2 id={id} className="m-0 font-serif font-normal leading-[1.1]" style={{ fontSize: size }}>
        {title}
      </h2>
      {children}
    </div>
  );
}

const FREE_NOTE = <p className="m-0 text-[13px] text-pencil">Templates start instantly and cost no AI messages.</p>;

// "Welcome, Team Dachshund." with the last word in italics
function Welcome({ name }: { name?: string }) {
  const words = (name ?? '').trim().split(/\s+/).filter(Boolean);
  const last = words.pop();

  return (
    <h1
      id="welcome-title"
      className="m-0 font-serif text-[64px] font-normal leading-none tracking-[-.02em] text-ink [text-wrap:balance] max-sm:text-[44px]"
    >
      {last ? (
        <>
          {`Welcome, ${words.length ? `${words.join(' ')} ` : ''}`}
          <em>{`${last}.`}</em>
        </>
      ) : (
        <>
          Welcome to <em>Foldo.</em>
        </>
      )}
    </h1>
  );
}

function FirstRun({
  name,
  prompt,
  templates,
  onStartTemplate,
}: {
  name?: string;
  prompt: ReactNode;
  templates: TemplateInfo[];
  onStartTemplate?: (id: string) => void;
}) {
  const tracks = TRACKS.filter((t) => t.img).map((t) => ({ ...t, start: inTrack(templates, t.track)[0] }));
  const eventMode = useEventMode();

  return (
    <div className="w-full bg-paper text-[15px] leading-[1.5] text-ink" data-testid="foldo-home-first-run">
      {/*
       * Wide screens: the band art sits right of the text column. Below 1240px it would slide under the build card, so the
       * art stacks under the card instead (the mobile hero art, same #FDB914 field).
       */}
      <section
        aria-labelledby="welcome-title"
        className="flex min-h-[540px] items-center bg-heroyellow bg-[length:auto_100%] bg-[position:right_bottom] bg-no-repeat min-[1240px]:bg-[url(/art/hero-band.webp)] max-[1239px]:min-h-0"
      >
        <div className="container-app pb-16 pt-14 max-[1239px]:pb-0 max-sm:pt-10">
          <div className="flex max-w-[620px] flex-col gap-[14px]">
            <div id="intro" className="flex flex-col gap-[14px]">
              <Welcome name={name} />
              <p className="m-0 text-[18px] text-ink [text-wrap:pretty]">
                Describe your first app, or start from a {eventMode ? 'track' : 'template'} below.
              </p>
            </div>
            <div className="mt-[14px]">{prompt}</div>
          </div>
          <img
            src="/art/hero-mobile.webp"
            alt="Foldo, a paper-folded dachshund, typing on a paper laptop while a little app pops up out of the screen"
            width={1536}
            height={1024}
            className="mt-6 block aspect-[3/2] h-auto w-full max-w-[620px] min-[1240px]:hidden"
          />
        </div>
      </section>

      <div id="examples" className="container-app flex flex-col pb-24">
        <section aria-labelledby="tpl-title" className="mt-16 flex flex-col gap-7" data-testid="foldo-templates">
          <SectionHead id="tpl-title" title={eventMode ? 'Start from your track' : 'Starter templates'} size={36}>
            {FREE_NOTE}
          </SectionHead>
          <div className="grid gap-8 [grid-template-columns:repeat(auto-fit,minmax(min(320px,100%),1fr))]">
            {tracks.map((t) => (
              <button
                key={t.track}
                type="button"
                data-testid="foldo-home-starter"
                disabled={!t.start}
                onClick={() => t.start && onStartTemplate?.(t.start.id)}
                aria-label={t.start ? `Start ${t.track}: ${t.start.title}` : undefined}
                className={`group flex cursor-pointer flex-col overflow-hidden rounded-[14px] border border-rule bg-sheet p-0 text-left font-sans text-ink transition-[border-color,box-shadow] duration-fast hover:border-ink hover:shadow-[0_18px_40px_-28px_rgba(22,20,15,.35)] disabled:cursor-not-allowed ${FOCUS}`}
              >
                <img
                  src={`/art/${t.img}.webp`}
                  alt={t.alt}
                  width={1536}
                  height={1152}
                  className="block aspect-[4/3] h-auto w-full border-b border-rule object-cover"
                />
                <span className="flex flex-col gap-[6px] px-6 pb-[22px] pt-5">
                  <span className="font-serif text-[28px] leading-[1.1]">{t.track}</span>
                  <span className="text-[15px] text-ink2">{t.blurb}</span>
                  <span className="mt-2 inline-flex items-center gap-[6px] text-[15px] font-semibold group-hover:underline">
                    Start <Icon.ArrowRight size={16} />
                  </span>
                </span>
              </button>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

function RecentCard({ p, templates, now }: { p: ProjectSummary; templates: TemplateInfo[]; now: number }) {
  const tag = projectTag(p.template, templates);

  return (
    <a
      href={`/chat/${p.id}`}
      data-testid="foldo-home-recent"
      className={`group flex flex-col overflow-hidden rounded-[12px] border border-rule bg-sheet text-ink no-underline transition-[border-color,box-shadow] duration-fast hover:border-ink hover:shadow-[0_18px_40px_-28px_rgba(22,20,15,.35)] ${FOCUS}`}
    >
      <ProjectThumb template={p.template} height={168} />
      <div className="flex flex-col gap-2 px-4 pb-4 pt-[14px]">
        <span className="truncate font-serif text-[22px] leading-[1.15] decoration-1 underline-offset-[3px] group-hover:underline">
          {projectTitle(p)}
        </span>
        <span className="flex flex-wrap items-center gap-2">
          {p.shareId ? (
            <span className="pill-live px-[9px]">
              <span className="pill-dot" />
              Shared · live
            </span>
          ) : (
            <span className={tag.prompt ? PROMPT_PILL : TAG_PILL}>{tag.label}</span>
          )}
          <span className="text-[13px] text-pencil">Edited {editedAgo(p.updated, now)}</span>
        </span>
      </div>
    </a>
  );
}

function AnyTrackArt() {
  return (
    <div
      aria-hidden="true"
      className="grid h-[72px] w-[96px] flex-none grid-cols-2 gap-[6px] rounded-[10px] border border-dashed border-field bg-wash p-[10px]"
    >
      <div className="rounded-[3px] border border-rule bg-sheet" />
      <div className="rounded-[3px] border border-[#393939] bg-[#262626]" />
    </div>
  );
}

function Returning({
  recent,
  projectCount,
  now,
  prompt,
  templates,
  onStartTemplate,
}: {
  recent: ProjectSummary[];
  projectCount: number;
  now: number;
  prompt: ReactNode;
  templates: TemplateInfo[];
  onStartTemplate?: (id: string) => void;
}) {
  const eventMode = useEventMode();

  return (
    <div className="container-app flex flex-col gap-14 pb-[72px] pt-12 text-[15px] leading-[1.5] text-ink" data-testid="foldo-home">
      <section className="grid items-end gap-12 [grid-template-columns:repeat(auto-fit,minmax(min(360px,100%),1fr))]">
        <div id="intro" className="flex flex-col gap-3">
          <h1 className="m-0 font-serif text-[clamp(44px,5vw,68px)] font-normal leading-none tracking-[-.015em] [text-wrap:balance]">
            What do you want to <span className="marker">build?</span>
          </h1>
          <p className="m-0 max-w-[460px] text-[17px] text-ink2 [text-wrap:pretty]">
            Pick up a project below, start from {eventMode ? 'your track' : 'a template'}, or describe a new idea.
          </p>
        </div>
        <div>{prompt}</div>
      </section>

      <div id="examples" className="flex flex-col gap-14">
        {recent.length > 0 && (
          <section aria-labelledby="recent-title" className="flex flex-col gap-6">
            <SectionHead id="recent-title" title="Continue where you left off" size={32}>
              <a
                href="/projects"
                className={`inline-flex min-h-[44px] items-center rounded-[6px] text-[14px] font-semibold text-ink no-underline hover:underline ${FOCUS}`}
              >
                View all ({projectCount}) →
              </a>
            </SectionHead>
            <div className="grid gap-6 [grid-template-columns:repeat(auto-fit,minmax(min(300px,100%),1fr))]">
              {recent.map((p) => (
                <RecentCard key={p.id} p={p} templates={templates} now={now} />
              ))}
            </div>
          </section>
        )}

        <section aria-labelledby="tpl-title" className="flex flex-col gap-6" data-testid="foldo-templates">
          <SectionHead id="tpl-title" title={eventMode ? 'Start from your track' : 'Starter templates'} size={32}>
            {FREE_NOTE}
          </SectionHead>
          <div className="grid gap-6 [grid-template-columns:repeat(auto-fit,minmax(min(260px,100%),1fr))]">
            {TRACKS.map((t) => {
              const items = inTrack(templates, t.track);

              if (!items.length) {
                return null;
              }

              return (
                <div key={t.track} className="flex flex-col gap-[10px]">
                  <div className="flex items-center gap-3">
                    {t.img ? (
                      <img
                        src={`/art/${t.img}.webp`}
                        alt={t.altCompact}
                        width={1536}
                        height={1152}
                        className="block h-[72px] w-[96px] flex-none rounded-[10px] border border-rule object-cover"
                      />
                    ) : (
                      <AnyTrackArt />
                    )}
                    <h3 className="m-0 font-mono text-[12px] font-medium uppercase tracking-[.08em] text-ink2">
                      {!eventMode && t.track === 'Any track' ? 'Any idea' : t.track}
                    </h3>
                  </div>
                  {items.map((tpl) => (
                    <button
                      key={tpl.id}
                      type="button"
                      data-testid="foldo-home-starter"
                      onClick={() => onStartTemplate?.(tpl.id)}
                      className={`flex min-h-[48px] cursor-pointer items-center justify-between gap-2 rounded-[8px] border border-rule bg-sheet px-[14px] text-left font-sans text-[14px] font-medium text-ink transition-[border-color,background-color] duration-fast hover:border-ink ${FOCUS}`}
                    >
                      {tpl.title}
                      <Icon.ChevronRight size={16} />
                    </button>
                  ))}
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
}

export function Home({ prompt, onStartTemplate }: HomeProps) {
  const { name, recent = [], projectCount, templates = [], now = 0 } = useLoaderData() as HomeData;

  /*
   * Only `/` knows the project count. /chat/:id and /p/:id render the same studio and show this empty state for a moment
   * before their messages load: keep that frame blank instead of flashing the first-run hero.
   */
  if (projectCount === undefined) {
    return <div className="flex-1" aria-hidden="true" />;
  }

  const firstRun = projectCount === 0;
  const box = typeof prompt === 'function' ? prompt(firstRun ? 'hero' : 'home') : prompt;

  return firstRun ? (
    <FirstRun name={name} prompt={box} templates={templates} onStartTemplate={onStartTemplate} />
  ) : (
    <Returning recent={recent} projectCount={projectCount} now={now} prompt={box} templates={templates} onStartTemplate={onStartTemplate} />
  );
}
