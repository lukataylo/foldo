import { useLoaderData } from '@remix-run/react';
import { useEffect, useState, type ReactNode } from 'react';
import { iconProps, type TemplateCard } from '~/lib/templates/client';
import { timeAgo } from '~/utils/timeAgo';

/*
 * Signed-in home: the studio's empty state before the first message (Home and Home-FirstRun boards).
 * BaseChat renders this instead of the message list and hands over the prompt box, so the layout around the prompt lives
 * here. Keep the #intro and #examples ids: Chat.client animates them away when the first message is sent.
 */
interface HomeData {
  email?: string;
  recent?: { id: string; description: string | null; updated: number }[];
  projectCount?: number;
}

const ONBOARDING = [
  { img: 'step-describe', text: 'Describe the app you want' },
  { img: 'step-build', text: 'Watch it build and run live' },
  { img: 'step-share', text: 'Share a link, let friends remix' },
];

function Onboarding() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    try {
      setOpen(!localStorage.getItem('foldo_onboarded'));
    } catch {
      setOpen(true);
    }
  }, []);

  if (!open) {
    return null;
  }

  return (
    <div
      data-testid="foldo-onboarding"
      className="relative mt-8 rounded-2xl border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-4"
    >
      <button
        aria-label="Dismiss"
        className="i-ph:x absolute right-3 top-3 text-bolt-elements-textTertiary hover:text-bolt-elements-textPrimary"
        onClick={() => {
          try {
            localStorage.setItem('foldo_onboarded', '1');
          } catch {
            // dismissal just won't persist
          }

          setOpen(false);
        }}
      />
      <div className="mb-3 text-sm font-semibold text-bolt-elements-textPrimary">Welcome to Foldo. Here's how it works</div>
      <div className="grid grid-cols-3 gap-3">
        {ONBOARDING.map((o) => (
          <div key={o.img} className="text-center text-xs text-bolt-elements-textSecondary">
            <img src={`/art/${o.img}.webp`} alt="" width={120} height={120} className="mx-auto mb-2 rounded-xl" />
            {o.text}
          </div>
        ))}
      </div>
    </div>
  );
}

const TRACKS = ['Payments', 'Access to Finance', 'Fraud and Security', 'Any track'];

function HomeExtras({ onStartTemplate }: { onStartTemplate?: (id: string) => void }) {
  const { recent = [], projectCount = 0, templates = [] } = useLoaderData() as HomeData & { templates?: TemplateCard[] };

  return (
    <>
      <div className="space-y-5" data-testid="foldo-templates">
        {TRACKS.map((track) => {
          const items = templates.filter((t) => t.track === track);

          if (!items.length) {
            return null;
          }

          return (
            <section key={track}>
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-bolt-elements-textTertiary">{track}</h2>
              <div className="grid grid-cols-2 gap-3">
                {items.map((t) => (
                  <button
                    key={t.id}
                    data-testid="foldo-home-starter"
                    onClick={() => onStartTemplate?.(t.id)}
                    className="group flex items-start gap-3 rounded-2xl border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-3 text-left transition hover:-translate-y-0.5 hover:border-[var(--foldo-yellow)]"
                  >
                    <img {...iconProps(t.icon)} alt="" width={44} height={44} className="shrink-0" />
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold text-bolt-elements-textPrimary">{t.title}</span>
                      <span className="mt-0.5 block text-xs leading-snug text-bolt-elements-textSecondary">{t.summary}</span>
                    </span>
                  </button>
                ))}
              </div>
            </section>
          );
        })}
        <p className="text-center text-xs text-bolt-elements-textTertiary">Templates start instantly and cost no AI messages. Or just describe your own idea above.</p>
      </div>

      {recent.length > 0 && (
        <div className="mt-8">
          <div className="mb-2 flex items-center justify-between text-sm">
            <span className="font-semibold text-bolt-elements-textPrimary">Continue where you left off</span>
            <a href="/projects" className="text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary">
              View all{projectCount > recent.length ? ` (${projectCount})` : ''} →
            </a>
          </div>
          <div className="space-y-1.5">
            {recent.map((p) => (
              <a
                key={p.id}
                href={`/chat/${p.id}`}
                className="flex items-center justify-between rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 px-3 py-2 text-sm text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary"
              >
                <span className="truncate">{p.description || 'Untitled project'}</span>
                <span className="ml-3 shrink-0 text-xs text-bolt-elements-textTertiary">{timeAgo(p.updated)}</span>
              </a>
            ))}
          </div>
        </div>
      )}

      {projectCount === 0 && <Onboarding />}
    </>
  );
}

export function Home({ prompt, onStartTemplate }: { prompt: ReactNode; onStartTemplate?: (id: string) => void }) {
  return (
    <>
      <div id="intro" className="mt-[12vh] max-w-chat mx-auto px-4 text-center">
        <img src="/foldo-mark.svg" alt="" width={56} height={56} className="mx-auto mb-4 rounded-[22%]" />
        <h1 className="text-4xl text-center font-bold text-bolt-elements-textPrimary mb-2">What do you want to build?</h1>
        <p className="mb-5 text-center text-bolt-elements-textSecondary">
          Pick a starter for your track, or describe your own idea. Foldo builds it and runs it right here.
        </p>
      </div>
      <div className="pt-6 px-6">{prompt}</div>
      <div id="examples" className="relative w-full mt-6 px-6 pb-16">
        <div className="mx-auto w-full max-w-chat">
          <HomeExtras onStartTemplate={onStartTemplate} />
        </div>
      </div>
    </>
  );
}
