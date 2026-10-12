import { json, type LoaderFunctionArgs } from '@remix-run/node';
import { useFetcher, useLoaderData } from '@remix-run/react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { PageShell } from '~/components/PageShell';
import { SiteFooter } from '~/components/landing/MarketingNav';
import type { LegalData } from '~/components/landing/legal';
import { Icon } from '~/components/ui/icons';
import { getUser, shell } from '~/lib/.server/auth';
import { legalInfo, perUserLimit } from '~/lib/.server/config';

// a sample price for Pro, shown while checkout is not open yet
const PRO_PRICE = '£12';
import { normalizeEmail } from '~/lib/email';

export const meta = () => [
  { title: 'Pricing · Foldo' },
  { name: 'description', content: 'Foldo is free while in beta. Pro is coming soon, and Foldo can host your hackathon, class or workshop.' },
];

export async function loader({ request }: LoaderFunctionArgs) {
  const { templates: _templates, ...data } = shell((await getUser(request)) ?? undefined);

  return json({ ...data, legal: legalInfo(), perDay: perUserLimit() });
}

type PricingData = LegalData & { perDay: number };

const card = 'flex flex-col gap-5 rounded-[14px] border border-solid border-rule bg-sheet p-6 md:p-7';

function Feature({ children }: { children: ReactNode }) {
  return (
    <li className="flex items-start gap-[10px] text-[15px] leading-[1.45] text-ink2">
      <Icon.Check size={16} className="mt-[3px] shrink-0 text-ink" />
      <span>{children}</span>
    </li>
  );
}

function PlanHead({ id, tag, title, blurb }: { id: string; tag: ReactNode; title: string; blurb: string }) {
  return (
    <div className="flex flex-col gap-3">
      {tag}
      <h2 id={id} className="m-0 font-serif text-[40px] font-normal leading-none tracking-[-.01em] md:text-[44px]">
        {title}
      </h2>
      <p className="m-0 text-pretty text-[16px] leading-[1.5] text-ink2">{blurb}</p>
    </div>
  );
}

// "Get notified" for Pro: POST /api/waitlist (no account needed); the same calm answer whether or not the address was new
function Notify() {
  const fetcher = useFetcher<{ ok?: boolean; message?: string; error?: string }>();
  const [error, setError] = useState('');
  const field = useRef<HTMLInputElement>(null);
  const busy = fetcher.state !== 'idle';
  const done = fetcher.data?.ok;

  useEffect(() => {
    if (fetcher.data?.error) {
      setError(fetcher.data.error);
      field.current?.focus();
    }
  }, [fetcher.data]);

  if (done) {
    return (
      <p role="status" className="m-0 flex items-start gap-2 rounded-[10px] border border-solid border-live-border bg-live-bg px-4 py-3 text-[15px] text-ink" data-testid="foldo-waitlist-done">
        <Icon.Check size={16} className="mt-[3px] shrink-0 text-live" />
        {fetcher.data?.message}
      </p>
    );
  }

  return (
    <fetcher.Form
      method="post"
      action="/api/waitlist"
      noValidate
      className="flex flex-col gap-2"
      data-testid="foldo-waitlist-form"
      onSubmit={(e) => {
        if (!normalizeEmail(new FormData(e.currentTarget).get('email'))) {
          e.preventDefault();
          setError('Enter a valid email address.');
          field.current?.focus();
        }
      }}
    >
      <label htmlFor="notify-email" className="input-label">
        Email
      </label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          ref={field}
          id="notify-email"
          name="email"
          type="email"
          autoComplete="email"
          required
          maxLength={254}
          placeholder="you@example.com"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? 'notify-error' : 'notify-help'}
          onInput={() => setError('')}
          className="input w-full min-w-0 sm:flex-1"
        />
        <button type="submit" className="btn-secondary btn-lg shrink-0" aria-busy={busy || undefined} disabled={busy}>
          {busy && <Icon.Spinner />}
          Get notified
        </button>
      </div>
      {error ? (
        <p id="notify-error" role="alert" className="input-error m-0">
          <Icon.Alert className="mt-px shrink-0" />
          {error}
        </p>
      ) : (
        <span id="notify-help" className="input-help">
          Checkout is coming soon. One email when it opens, nothing else.
        </span>
      )}
    </fetcher.Form>
  );
}

export default function Pricing() {
  const data = useLoaderData<typeof loader>() as unknown as PricingData;
  const { perDay } = data;
  const signedIn = Boolean(data.email);

  return (
    <PageShell data={data} active="pricing" mainClassName="flex flex-col gap-12 pb-24 pt-8 md:gap-16 md:pt-12" footer={<SiteFooter compact />}>
      <section aria-labelledby="pricing-title" className="grid items-center gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,560px)] lg:gap-14">
        <div className="flex max-w-[620px] flex-col gap-4">
          <span className="eyebrow">Pricing</span>
          <h1 id="pricing-title" className="m-0 text-balance font-serif text-[56px] font-normal leading-[.94] tracking-[-.02em] md:text-[80px]">
            Free while in <em>beta.</em>
          </h1>
          <p className="m-0 max-w-[520px] text-pretty text-[18px] leading-[1.55] text-ink2 md:text-[20px]">
            Build, share and remix apps at no cost while Foldo is in beta. No card, no checkout.
          </p>
        </div>
        <img
          src="/art/pricing.webp"
          alt="Foldo the paper dachshund offering a yellow gift box in front of a striped paper market stall"
          width={1536}
          height={1024}
          className="block h-auto w-full rounded-[16px] border border-solid border-rule"
        />
      </section>

      <div className="grid gap-6 lg:grid-cols-3" data-testid="foldo-pricing">
        <section aria-labelledby="plan-free" className={card}>
          <PlanHead
            id="plan-free"
            tag={
              <span className="pill-live self-start">
                <span className="pill-dot" aria-hidden="true" />
                Available now
              </span>
            }
            title="Free"
            blurb="Everything Foldo does today, for anyone with an account."
          />
          <ul className="m-0 flex list-none flex-col gap-[10px] border-t border-solid border-rule2 p-0 pt-5">
            <Feature>
              <strong className="font-semibold text-ink" data-testid="foldo-pricing-allowance">
                {`${perDay} AI ${perDay === 1 ? 'message' : 'messages'} a day`}
              </strong>
            </Feature>
            <Feature>Every starter template, at no message cost</Feature>
            <Feature>Share links anyone can open and remix</Feature>
            <Feature>A place in the public gallery</Feature>
            <Feature>Download any project as a zip</Feature>
          </ul>
          <a href={signedIn ? '/' : '/login?mode=register'} className="btn-primary btn-lg mt-auto">
            {signedIn ? 'Start building' : 'Get started'} <Icon.ArrowRight />
          </a>
        </section>

        <section aria-labelledby="plan-pro" className={card}>
          <PlanHead
            id="plan-pro"
            tag={<span className="pill-muted self-start">Coming soon</span>}
            title="Pro"
            blurb="For people who build with Foldo every day. Free stays free."
          />
          <p className="m-0 flex items-baseline gap-2" data-testid="foldo-pricing-pro-price">
            <span className="font-serif text-[48px] leading-none tracking-[-.01em] text-ink">{PRO_PRICE}</span>
            <span className="text-[15px] text-pencil">per month</span>
          </p>
          <ul className="m-0 flex list-none flex-col gap-[10px] border-t border-solid border-rule2 p-0 pt-5">
            <Feature>
              <strong className="font-semibold text-ink">{`${perDay * 10} AI messages a day`}</strong>
            </Feature>
            <Feature>Priority on the strongest AI models</Feature>
            <Feature>Private share links with a password</Feature>
            <Feature>Everything in Free</Feature>
          </ul>
          <div className="mt-auto">
            <Notify />
          </div>
        </section>

        <section id="events" aria-labelledby="plan-events" className={`${card} scroll-mt-6`}>
          <PlanHead
            id="plan-events"
            tag={<span className="pill-neutral self-start">Hackathons · classrooms · workshops</span>}
            title="Foldo for events"
            blurb="Run your event on Foldo. Everyone builds in the browser, and nobody installs a thing."
          />
          <ul className="m-0 flex list-none flex-col gap-[10px] border-t border-solid border-rule2 p-0 pt-5">
            <Feature>Event bar with a live countdown</Feature>
            <Feature>Invite codes and a sign-up switch</Feature>
            <Feature>Daily message limits per team</Feature>
            <Feature>Starter templates for each track</Feature>
            <Feature>A public gallery with likes</Feature>
            <Feature>An admin console with pause and backups</Feature>
          </ul>
        </section>
      </div>
    </PageShell>
  );
}
