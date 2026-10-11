import { useLoaderData, useNavigate } from '@remix-run/react';
import { useRef, useState, type ReactNode } from 'react';
import { EventBar, type EventInfo } from '~/components/header/EventBar';
import { SiteHeader } from '~/components/PageShell';
import { Icon } from '~/components/ui/icons';
import type { TemplateCard } from '~/lib/templates/client';
import { SiteFooter } from './MarketingNav';
import { ProjectCard, type GalleryItem } from './ProjectCard';
import { PROMPT_KEY, TEMPLATE_KEY } from './starters';

/*
 * Signed-out `/` (Landing and Landing-Mobile boards). One responsive page: below md the phone layout (menu button, track
 * carousel, stacked steps, no gallery strip); the hero keeps the stacked phone art until xl so the dog never sits under
 * the prompt box.
 */

const PLACEHOLDER = 'A scam checker for text messages…';

const EXAMPLES = [
  { label: 'Scam checker', prompt: 'A scam checker for text messages: paste a message and get a risk score with the red flags explained.' },
  { label: 'Budget coach', prompt: 'A budget coach for students that splits a monthly income into rent, food and savings.' },
  { label: 'Bill splitter', prompt: 'A bill splitter for a group trip that shows who owes whom and the exact amounts.' },
];

const TRACKS = [
  {
    name: 'Payments',
    short: 'Payments',
    art: 'track-payments',
    alt: 'Shopkeeper Foldo behind a paper counter, holding a coin in its mouth for the next customer',
    blurb: 'Move money faster, cheaper and clearer.',
    phoneTitle: 'Move money, clearly.',
    phoneBlurb: 'Make moving money faster, cheaper and clearer.',
  },
  {
    name: 'Access to Finance',
    short: 'Access',
    art: 'track-access',
    alt: 'Foldo turning a big paper key in the door of a little bank',
    blurb: 'Open doors for people banks overlook.',
    phoneTitle: 'Unlock the bank.',
    phoneBlurb: 'Open doors for people banks overlook.',
  },
  {
    name: 'Fraud and Security',
    short: 'Fraud',
    art: 'track-fraud',
    alt: 'Detective Foldo in a deerstalker studying a hooked envelope through a magnifying glass',
    blurb: 'Spot the scam before it costs someone.',
    phoneTitle: 'Catch the phish.',
    phoneBlurb: 'Spot the scam before it costs someone.',
  },
];

const STEPS: { art: string; alt: string; title: ReactNode; body: string }[] = [
  {
    art: 'step-describe',
    alt: 'Foldo barking an idea into a big paper speech bubble',
    title: 'Describe it',
    body: 'Tell Foldo what you want in plain English. A todo app, a landing page, a game.',
  },
  {
    art: 'step-build',
    alt: 'Foldo in a hard hat nudging paper blocks into a browser window',
    title: (
      <>
        Watch it <em>build</em>
      </>
    ),
    body: 'The code is written and the app runs live in your browser. No setup, no installs.',
  },
  {
    art: 'step-share',
    alt: 'Foldo balancing a paper plane on the tip of its nose',
    title: 'Share the link',
    body: 'Send a link. Anyone can run your project and remix their own copy.',
  },
];

// keep the choice in sessionStorage so it survives sign-up; Chat picks it up on the signed-in home
function remember(key: string, value: string) {
  try {
    sessionStorage.setItem(key, value);
  } catch {
    // private mode: they just retype it after signing up
  }
}

function forget(key: string) {
  try {
    sessionStorage.removeItem(key);
  } catch {
    // storage unavailable: nothing was kept
  }
}

function SectionHead({ id, eyebrow, title, aside }: { id: string; eyebrow: string; title: ReactNode; aside?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-6">
      <div className="flex flex-col gap-[10px] md:gap-3">
        <span className="eyebrow">{eyebrow}</span>
        <h2 id={id} className="m-0 text-balance font-serif text-[40px] font-normal leading-[.95] tracking-[-.015em] md:text-[clamp(40px,5vw,72px)]">
          {title}
        </h2>
      </div>
      {aside && <div className="hidden max-w-[380px] flex-col items-start gap-4 md:flex">{aside}</div>}
    </div>
  );
}

const Lead = ({ children }: { children: ReactNode }) => <p className="m-0 text-pretty text-[16px] leading-[1.55] text-ink2">{children}</p>;

function Hero({ onStart }: { onStart: (prompt: string) => void }) {
  const [prompt, setPrompt] = useState('');
  const field = useRef<HTMLTextAreaElement>(null);

  // an empty box just takes focus; we never invent a prompt for them
  const submit = () => (prompt.trim() ? onStart(prompt.trim()) : field.current?.focus());

  return (
    <section
      aria-labelledby="hero-title"
      className="lg:grid lg:grid-cols-2 lg:items-center min-[1360px]:!flex min-[1360px]:min-h-[716px] min-[1360px]:bg-[url(/art/hero-band.webp)] min-[1360px]:bg-[length:auto_100%] min-[1360px]:bg-right-bottom min-[1360px]:bg-no-repeat"
    >
      <div className="container-marketing pt-5 lg:pb-12 lg:pt-8 min-[1360px]:!pb-24 min-[1360px]:!pt-12">
        {/* on the band, the column stops >= 24px short of the dog's tail (art starts ~713px from the right edge) */}
        <div className="flex max-w-[580px] flex-col gap-4 md:gap-5 min-[1360px]:max-w-[min(580px,calc(100vw-800px))]">
          <h1 id="hero-title" className="m-0 text-balance font-serif text-[56px] font-normal leading-[.92] tracking-[-.02em] text-ink md:text-[clamp(56px,7vw,100px)]">
            Describe it. Watch it <em>build.</em>
          </h1>
          <p className="m-0 max-w-[480px] text-pretty text-[17px] leading-[1.5] text-ink md:text-[20px]">
            One sentence becomes a running web app<span className="hidden md:inline">, right in your browser</span>.
          </p>
          <form
            className="mt-1 flex flex-col gap-4 md:mt-4"
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
          >
            <div
              className="flex cursor-text flex-col gap-3 rounded-[16px] border border-solid border-[rgba(22,20,15,.10)] bg-sheet px-[14px] pb-3 pt-[14px] shadow-float md:px-[18px] md:pb-[14px] md:pt-[18px]"
              onClick={() => field.current?.focus()}
            >
              <label htmlFor="hero-prompt" className="sr-only">
                What do you want to build?
              </label>
              <textarea
                id="hero-prompt"
                ref={field}
                rows={2}
                maxLength={2000}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    submit();
                  }
                }}
                placeholder={PLACEHOLDER}
                className="resize-none border-0 bg-transparent p-0 font-sans text-[17px] leading-[1.5] text-ink outline-none placeholder:text-placeholder md:text-[18px]"
              />
              <div className="flex flex-wrap items-center justify-between gap-3 md:border-t md:border-solid md:border-rule2 md:pt-3">
                <span className="hidden font-mono text-[12px] text-pencil md:inline">
                  <kbd className="rounded-[4px] border border-b-2 border-solid border-rule bg-paper px-[6px] py-px font-mono text-[11px] font-medium text-ink2">
                    Enter
                  </kbd>{' '}
                  to build
                </span>
                <button type="submit" className="btn-dark btn-lg min-h-[48px] w-full md:min-h-[44px] md:w-auto">
                  Build <Icon.ArrowRight />
                </button>
              </div>
            </div>
            <div className="hidden flex-wrap items-center gap-2 md:flex">
              <span className="mr-1 text-[14px] text-ink">Try</span>
              {EXAMPLES.map((ex) => (
                <button
                  key={ex.label}
                  type="button"
                  onClick={() => {
                    setPrompt(ex.prompt);
                    field.current?.focus();
                  }}
                  className="h-[32px] cursor-pointer rounded-[6px] border border-solid border-[rgba(22,20,15,.22)] bg-[rgba(255,255,255,.6)] px-3 font-sans text-[13px] font-medium text-ink outline-none transition-colors duration-fast hover:bg-sheet focus-visible:shadow-[0_0_0_2px_#16140F]"
                >
                  {ex.label}
                </button>
              ))}
            </div>
          </form>
        </div>
      </div>
      <img
        src="/art/hero-mobile.webp"
        alt="Foldo, a paper-folded dachshund, typing on a paper laptop while a little app pops up out of the screen"
        width={1536}
        height={1024}
        className="mt-2 block aspect-[3/2] h-auto w-full md:ml-auto md:max-w-[640px] lg:mt-0 lg:max-w-none min-[1360px]:!hidden"
      />
    </section>
  );
}

function Tracks({ onTrack }: { onTrack: (track: string) => void }) {
  const [active, setActive] = useState(0);

  return (
    <section aria-labelledby="tracks-title" className="border-t border-solid border-rule lg:border-t-0">
      <div className="container-marketing flex flex-col gap-6 py-12 lg:gap-12 lg:pb-[104px] lg:pt-24">
        <SectionHead
          id="tracks-title"
          eyebrow="Tracks"
          title={
            <>
              Pick your track, <em>start in seconds.</em>
            </>
          }
          aside={<Lead>Each track opens a ready starter that runs instantly. Templates cost no AI messages, so your first build is free.</Lead>}
        />
        <ul
          aria-label="Tracks"
          onScroll={(e) => {
            const el = e.currentTarget;
            setActive(Math.round(el.scrollLeft / 300));
          }}
          className="-mx-4 m-0 flex snap-x snap-mandatory list-none gap-3 overflow-x-auto px-4 pb-1 [scroll-padding:16px] [scrollbar-width:none] lg:mx-0 lg:grid lg:grid-cols-3 lg:gap-6 lg:overflow-visible lg:p-0"
        >
          {TRACKS.map((t, i) => (
            <li key={t.name} className="flex-[0_0_288px] snap-start lg:flex-auto">
              <a
                href="/login?mode=register"
                onClick={(e) => {
                  e.preventDefault();
                  onTrack(t.name);
                }}
                className="group flex h-full flex-col overflow-hidden rounded-[14px] border border-solid border-rule bg-sheet text-ink no-underline outline-none transition-colors duration-fast hover:border-field focus-visible:shadow-[0_0_0_2px_#FBF8F1,0_0_0_4px_#16140F]"
              >
                <img
                  src={`/art/${t.art}.webp`}
                  alt={t.alt}
                  width={1536}
                  height={1152}
                  loading="lazy"
                  className="block aspect-[4/3] h-auto w-full border-b border-solid border-rule object-cover"
                />
                <div className="flex flex-1 flex-col gap-2 px-[18px] pb-[18px] pt-4 lg:gap-[10px] lg:px-6 lg:pb-7 lg:pt-6">
                  <span className="font-mono text-[12px] text-pencil lg:hidden">
                    0{i + 1} · {t.name}
                  </span>
                  <h3 className="m-0 text-balance font-serif text-[28px] font-normal leading-none lg:text-[36px]">
                    <span className="lg:hidden">{t.phoneTitle}</span>
                    <span className="hidden lg:inline">{t.name}</span>
                  </h3>
                  <p className="m-0 text-[14px] text-ink2 lg:text-balance lg:text-[16px]">
                    <span className="lg:hidden">{t.phoneBlurb}</span>
                    <span className="hidden lg:inline">{t.blurb}</span>
                  </p>
                  <span className="inline-flex items-center gap-[6px] pt-1 text-[14px] font-semibold group-hover:underline lg:mt-auto lg:pt-[10px] lg:text-[15px]">
                    <span className="lg:hidden">Start with {t.short}</span>
                    <span className="hidden lg:inline">Start with {t.name}</span>
                    <Icon.ArrowRight />
                  </span>
                </div>
              </a>
            </li>
          ))}
        </ul>
        <div aria-hidden="true" className="flex items-center gap-[6px] lg:hidden">
          {TRACKS.map((t, i) => (
            <span key={t.name} className={`h-[4px] rounded-full transition-all duration-base ${i === active ? 'w-[20px] bg-ink' : 'w-[6px] bg-field'}`} />
          ))}
        </div>
      </div>
    </section>
  );
}

function Steps() {
  return (
    <section aria-labelledby="steps-title" className="border-t border-solid border-rule bg-sheet">
      <div className="container-marketing flex flex-col gap-7 py-12 lg:gap-14 lg:pb-[104px] lg:pt-24">
        <SectionHead
          id="steps-title"
          eyebrow="How it works"
          title={
            <>
              Three steps, <em>no setup.</em>
            </>
          }
          aside={<Lead>Everything runs in the browser tab you already have open. Nothing to install, nothing to deploy.</Lead>}
        />
        <ol className="m-0 flex list-none flex-col p-0 lg:grid lg:grid-cols-3 lg:gap-x-8 lg:gap-y-10">
          {STEPS.map((s, i) => (
            <li
              key={s.art}
              className={`grid grid-cols-[104px_1fr] items-start gap-4 border-t border-solid py-4 last:pb-0 lg:flex lg:flex-col lg:gap-5 lg:border-t-0 lg:py-0 ${i === 0 ? 'border-ink' : 'border-rule'}`}
            >
              <img
                src={`/art/${s.art}.webp`}
                alt={s.alt}
                width={1024}
                height={1024}
                loading="lazy"
                className="block aspect-square h-[104px] w-[104px] rounded-[12px] border border-solid border-rule object-cover lg:h-auto lg:w-full lg:rounded-[14px]"
              />
              <div className="flex flex-col gap-1 lg:grid lg:grid-cols-[48px_1fr] lg:gap-x-3 lg:gap-y-2 lg:border-t lg:border-solid lg:border-ink lg:pt-5">
                <span className="font-mono text-[12px] text-pencil lg:hidden">Step {i + 1}</span>
                <span aria-hidden="true" className="row-span-2 hidden font-serif text-[44px] leading-[.8] text-pencil lg:block">
                  {i + 1}
                </span>
                <h3 className="m-0 font-serif text-[26px] font-normal leading-none lg:text-[32px]">{s.title}</h3>
                <p className="m-0 text-[14px] leading-[1.45] text-ink2 lg:text-pretty lg:text-[16px] lg:leading-[1.55]">{s.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

function GalleryStrip({ items, now }: { items: GalleryItem[]; now: number }) {
  if (!items.length) {
    return null;
  }

  return (
    <section aria-labelledby="gallery-title" className="hidden border-t border-solid border-rule lg:block">
      <div className="container-marketing flex flex-col gap-12 pb-[104px] pt-24">
        <SectionHead
          id="gallery-title"
          eyebrow="From the gallery"
          title={
            <>
              Made tonight, <em>shared</em> by teams.
            </>
          }
          aside={
            <>
              <Lead>Projects teams chose to show off. Run one in your browser, then remix your own copy.</Lead>
              <a href="/gallery" className="btn-secondary btn-lg">
                Browse the gallery <Icon.ArrowRight />
              </a>
            </>
          }
        />
        <ul className="m-0 grid list-none grid-cols-3 gap-6 p-0">
          {items.map((item) => (
            <ProjectCard key={item.id} item={item} signedIn={false} now={now} size="strip" />
          ))}
        </ul>
      </div>
    </section>
  );
}

function Closing({ inviteRequired }: { inviteRequired: boolean }) {
  return (
    <section aria-labelledby="closing-title" className="border-t border-solid border-rule md:bg-sheet">
      <div className="container-marketing grid items-center gap-5 py-12 md:grid-cols-2 md:gap-[clamp(32px,5vw,72px)] md:py-[104px]">
        <img
          src="/art/closing.webp"
          alt="Foldo in a sweatband sprinting for the finish tape, a giant paper stopwatch behind it"
          width={1536}
          height={1024}
          loading="lazy"
          className="block aspect-[2/1] h-auto w-full rounded-[14px] border border-solid border-rule object-cover object-[center_45%] md:aspect-[3/2] md:object-center"
        />
        <div className="flex flex-col gap-5 md:gap-6">
          <span className="eyebrow">The clock is running</span>
          <h2 id="closing-title" className="m-0 text-balance font-serif text-[44px] font-normal leading-[.95] tracking-[-.02em] md:text-[clamp(48px,6vw,88px)] md:leading-[.92]">
            Make something before the clock runs <em>out.</em>
          </h2>
          <p className="m-0 max-w-[460px] text-pretty text-[16px] leading-[1.55] text-ink2 md:text-[18px]">
            {inviteRequired ? 'Sign up with your team name and the invite code from your organizer.' : 'Sign up with your team name.'}
            <span className="hidden md:inline"> Your first app can be running in a minute.</span>
          </p>
          <div className="flex flex-col gap-3 md:flex-row md:flex-wrap md:items-center">
            <a href="/login?mode=register" className="btn-primary btn-lg min-h-[52px] px-6 text-[16px]">
              Get started <Icon.ArrowRight />
            </a>
            <a href="/login" className="btn-secondary btn-lg hidden min-h-[52px] px-[22px] text-[16px] md:inline-flex">
              Sign in
            </a>
            <a
              href="/gallery"
              className="mt-1 inline-flex min-h-[44px] items-center self-center text-[15px] font-medium text-ink2 underline decoration-field underline-offset-3 md:hidden"
            >
              Or browse the gallery
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}

export function Landing() {
  const navigate = useNavigate();
  const {
    event,
    templates = [],
    gallery = [],
    now = 0,
    inviteRequired = false,
  } = useLoaderData() as {
    event?: EventInfo | null;
    templates?: TemplateCard[];
    gallery?: GalleryItem[];
    now?: number;
    inviteRequired?: boolean;
  };

  const start = (text: string) => {
    // the latest choice wins: a typed prompt replaces a starter picked earlier, and the other way round
    forget(TEMPLATE_KEY);
    remember(PROMPT_KEY, text);
    navigate('/login?mode=register');
  };

  // a track card opens that track's first starter once the team has signed up
  const startTrack = (track: string) => {
    const first = templates.find((t) => t.track === track);

    forget(PROMPT_KEY);

    if (first) {
      remember(TEMPLATE_KEY, first.id);
    } else {
      forget(TEMPLATE_KEY);
    }

    navigate('/login?mode=register');
  };

  return (
    <div className="h-full overflow-y-auto bg-paper font-sans text-[16px] leading-[1.55] text-ink" data-testid="foldo-marketing-landing">
      <EventBar event={event} variant="marketing" />
      <div className="bg-heroyellow">
        <SiteHeader tone="yellow" />
      </div>
      <main>
        <div className="bg-heroyellow">
          <Hero onStart={start} />
        </div>
        <Tracks onTrack={startTrack} />
        <Steps />
        <GalleryStrip items={gallery} now={now} />
        <Closing inviteRequired={inviteRequired} />
      </main>
      <SiteFooter />
    </div>
  );
}
