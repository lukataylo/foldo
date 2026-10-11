import { useStore } from '@nanostores/react';
import { useLoaderData } from '@remix-run/react';
import { templateStatus, type TemplateCard } from '~/lib/templates/client';
import { SIcon } from './studio-icons';

// one paper-craft scene per track (public/art); "Any track" starters get the build scene
const TRACK_ART: Record<string, { src: string; alt: string }> = {
  Payments: { src: '/art/track-payments.webp', alt: 'Foldo the paper dachshund as a shopkeeper behind a little counter, holding up a coin' },
  'Access to Finance': { src: '/art/track-access.webp', alt: 'Foldo the paper dachshund unlocking a little paper bank with a key' },
  'Fraud and Security': {
    src: '/art/track-fraud.webp',
    alt: 'Foldo the paper dachshund as a detective, inspecting a hooked envelope through a magnifier',
  },
};

export const trackArt = (track?: string) =>
  (track && TRACK_ART[track]) || { src: '/art/step-build.webp', alt: 'Foldo in a hard hat nudging paper blocks into a browser window' };

// The first message of a template project (Build-Template board). It is UI only: the model never sees it (see api.chat).
export function TemplateIntro({ id, onSend }: { id: string; onSend?: (text: string) => void }) {
  const { templates = [] } = useLoaderData() as { templates?: TemplateCard[] };
  const status = useStore(templateStatus);
  const t = templates.find((x) => x.id === id);

  if (!t) {
    return <p className="m-0">Your starter project is ready.</p>;
  }

  const art = trackArt(t.track);
  const kind = t.track && TRACK_ART[t.track] ? `${t.track} starter` : 'Starter';

  return (
    <article className="overflow-hidden rounded-[14px] border border-rule bg-sheet" data-testid="foldo-template-intro">
      <img
        src={art.src}
        alt={art.alt}
        width={378}
        height={190}
        className="block h-[190px] w-full border-b border-rule object-cover object-[center_40%]"
      />
      <div className="flex flex-col gap-[14px] px-4 pb-[18px] pt-4">
        <div className="flex flex-col gap-1">
          <span className="eyebrow">{kind}</span>
          <h2 className="m-0 font-serif text-[24px] font-normal leading-[1.1]">{t.title}</h2>
        </div>
        {status ? (
          <p role="status" className="m-0 inline-flex items-center gap-2 text-[14px] text-ink2">
            <SIcon.Arc className="text-ink" /> {status}
          </p>
        ) : (
          <p className="m-0 text-[14px] text-ink2">
            It is running in the preview. Explore it, then ask me to change it. I will edit this project, not start over.
          </p>
        )}
        {t.ideas.length > 0 && (
          <div className="flex flex-col gap-[6px]">
            <span className="text-[12px] font-medium text-pencil">Try asking</span>
            {t.ideas.map((idea) => (
              <button
                key={idea}
                type="button"
                onClick={() => onSend?.(idea)}
                className="flex min-h-[38px] items-center justify-between gap-2 rounded-[8px] border border-rule bg-paper px-3 py-2 text-left font-sans text-[14px] text-ink transition-colors duration-120 hover:border-field hover:bg-wash focus-visible:shadow-[0_0_0_2px_#FBF8F1,0_0_0_4px_#16140F] outline-none"
              >
                {idea}
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#6B6457" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="flex-none">
                  <path d="M5 12h14M13 6l6 6-6 6" />
                </svg>
              </button>
            ))}
          </div>
        )}
      </div>
    </article>
  );
}
