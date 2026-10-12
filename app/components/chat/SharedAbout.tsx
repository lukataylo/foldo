import { useLoaderData } from '@remix-run/react';
import type { Message } from 'ai';
import { useState, type ReactNode } from 'react';
import { toast } from 'react-toastify';
import { copyText } from '~/components/share/ShareDialog';
import type { TemplateCard } from '~/lib/templates/client';
import { modificationsRegex } from '~/utils/diff';
import { SIcon } from './studio-icons';
import { trackArt } from './TemplateIntro';

interface SharedInfo {
  shareId: string;
  owner: string;
  listed: boolean;
  likes: number;
  liked: boolean;
  mine: boolean;
  projectId?: string;
}

interface SharedData {
  description?: string;
  messages?: Message[];
  template?: string;
  templates?: TemplateCard[];
  sharedInfo?: SharedInfo;
  url?: string;
  email?: string;
}

interface Prompt {
  text: string;
  meta: string;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

// one line per prompt for the "Prompt history": what the team asked, and what the reply did with it
function promptHistory(messages: Message[] = []): Prompt[] {
  const prompts: Prompt[] = [];
  let built = false;

  messages.forEach((m, i) => {
    if (m.role !== 'user') {
      return;
    }

    const reply = messages[i + 1]?.role === 'assistant' ? messages[i + 1].content : '';
    const actions = [...reply.matchAll(/<boltAction\s[^>]*type="(file|shell)"[^>]*>([^<]*)/g)];
    const files = actions.filter((a) => a[1] === 'file').length;
    const starts = actions.some((a) => a[1] === 'shell' && /\b(npm run dev|npm start|vite)\b/.test(a[2]));
    const steps = actions.length;

    let did: string;

    if (!steps) {
      did = 'answered in chat';
    } else if (!built) {
      did = starts ? 'created the app and started it' : `created ${plural(files, 'file')}`;
    } else {
      did = `updated ${plural(files, 'file')}`;
    }

    built ||= steps > 0;
    prompts.push({ text: m.content.replace(modificationsRegex, '').trim(), meta: steps ? `${plural(steps, 'step')} · ${did}` : did });
  });

  return prompts;
}

export function useSharedMeta() {
  const data = useLoaderData() as SharedData;
  const track = data.templates?.find((t) => t.id === data.template)?.track;
  const prompts = promptHistory(data.messages);
  const owner = data.sharedInfo?.owner ?? 'A Foldo maker';
  const parts = [owner, track && track !== 'Any track' ? track : undefined].filter(Boolean) as string[];

  return {
    data,
    track,
    owner,
    prompts,
    title: data.description || 'Shared project',
    line: [...parts, plural(prompts.length, 'message')].join(' · '),
    // after "Built by <owner>"
    rest: [track && track !== 'Any track' ? track : undefined, plural(prompts.length, 'message')].filter(Boolean).join(' · '),
    byline: parts.join(' · '),
  };
}

// Like: signed-out visitors are sent to sign in; listed projects only (the gallery counts them)
function LikeButton({ info, large }: { info: SharedInfo; large?: boolean }) {
  const { email } = useLoaderData() as SharedData;
  const [likes, setLikes] = useState(info.likes);
  const [liked, setLiked] = useState(info.liked);
  const [busy, setBusy] = useState(false);

  const toggle = async () => {
    if (!email) {
      location.href = `/login?next=${encodeURIComponent(location.pathname)}`;
      return;
    }

    setBusy(true);

    try {
      const res = await fetch('/api/like', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shareId: info.shareId, like: !liked }),
      });
      const body = (await res.json()) as { likes?: number; liked?: boolean; error?: string };

      if (!res.ok) {
        toast.error(body.error === "You can't like your own project." ? body.error : "Couldn't save your like. Try again in a moment.");
      } else {
        setLikes(body.likes ?? likes);
        setLiked(Boolean(body.liked));
      }
    } catch {
      toast.error("Couldn't save your like. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      aria-pressed={liked}
      aria-label={`Like, ${likes} ${likes === 1 ? 'like' : 'likes'}`}
      aria-busy={busy || undefined}
      onClick={toggle}
      className={`inline-flex flex-none items-center gap-[6px] rounded-full border border-field bg-sheet px-3 font-medium text-ink outline-none hover:bg-wash focus-visible:shadow-[0_0_0_2px_#FBF8F1,0_0_0_4px_#16140F] ${large ? 'h-[40px] text-[14px]' : 'h-[36px] text-[13px]'}`}
    >
      <SIcon.Heart size={large ? 18 : 16} fill={liked ? 'currentColor' : 'none'} className={liked ? 'text-error' : undefined} />
      <span className="font-mono text-[13px]">{likes}</span>
    </button>
  );
}

/*
 * Shared-Viewer (signed out): instead of the chat, a card about the project (art, who built it, the prompt history,
 * the full conversation on demand), a like card for listed projects, and a note that visitors can't edit it.
 */
export function SharedAbout({ conversation }: { conversation: ReactNode }) {
  const { data, track, prompts, title, owner, rest } = useSharedMeta();
  const [full, setFull] = useState(false);
  const art = trackArt(track);
  const info = data.sharedInfo;

  return (
    <aside aria-label="About this project" className="flex min-h-0 w-full flex-col md:w-[420px] md:flex-none lt-md:hidden">
      <div className="flex min-h-0 flex-1 flex-col gap-[14px] overflow-y-auto pb-4 pl-5 pr-4 pt-5">
        <article className="flex-none overflow-hidden rounded-[12px] border border-rule bg-sheet">
          <img src={art.src} alt={art.alt} className="block h-[120px] w-full border-b border-rule object-cover object-[50%_40%]" />
          <div className="flex flex-col gap-1 px-[18px] pb-[6px] pt-4">
            <span className="eyebrow">Shared project</span>
            <h2 className="m-0 font-serif text-[28px] font-normal leading-[1.1]">{title}</h2>
            <p className="m-0 text-[13px] text-ink2">
              Built by <strong className="font-semibold">{owner}</strong> · {rest}
            </p>
          </div>
          {prompts.length > 0 && (
            <div className="px-[18px] pb-1 pt-3">
              <h3 className="m-0 mb-2 font-mono text-[12px] font-normal uppercase tracking-[.08em] text-pencil">Prompt history</h3>
              <ol className="m-0 flex list-none flex-col p-0">
                {prompts.map((p, i) => (
                  <li key={i} className="flex gap-3 border-t border-rule2 py-[10px]">
                    <span className="w-[20px] flex-none pt-[2px] font-mono text-[12px] font-medium text-pencil">{String(i + 1).padStart(2, '0')}</span>
                    <div className="flex min-w-0 flex-col gap-[2px]">
                      <span className="line-clamp-3 text-[14px] text-ink">{p.text}</span>
                      <span className="text-[12px] text-pencil">{p.meta}</span>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          )}
          <div className="border-t border-rule2 px-[10px] pb-[10px] pt-[6px]">
            <button
              type="button"
              aria-expanded={full}
              onClick={() => setFull(!full)}
              className="flex h-[36px] w-full items-center justify-between rounded-[6px] border-0 bg-transparent px-2 font-sans text-[13px] font-medium text-ink2 hover:bg-wash"
            >
              {full ? 'Hide the full conversation' : 'Show the full conversation'}
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={full ? 'rotate-180' : ''}>
                <path d="M6 9l6 6 6-6" />
              </svg>
            </button>
          </div>
        </article>

        {full && <div className="flex-none">{conversation}</div>}

        {info?.listed && !info.mine && (
          <section aria-labelledby="like-title" className="flex flex-none items-center gap-[14px] rounded-[12px] border border-rule bg-sheet px-[18px] py-4">
            <div className="flex min-w-0 flex-1 flex-col gap-[2px]">
              <h3 id="like-title" className="m-0 font-serif text-[21px] font-normal leading-[1.15]">
                Like this project?
              </h3>
              <span className="text-[13px] text-pencil">
                {data.email ? 'Likes help it rise in the gallery.' : 'Sign in to like it. Likes help it rise in the gallery.'}
              </span>
            </div>
            <LikeButton info={info} />
          </section>
        )}
      </div>

      <div className="flex-none pb-4 pl-5 pr-4">
        <div className="flex items-center gap-[10px] rounded-[10px] border border-dashed border-field bg-wash px-[14px] py-3 text-[13px] text-ink2">
          <SIcon.Lock />
          <span>You can run and look around. Viewers can’t edit the original.</span>
        </div>
      </div>
    </aside>
  );
}

// Shared-Mobile: a bottom sheet over the running preview (phones can't run the editor, so remixing happens on a laptop)
export function SharedSheet() {
  const { data, title, byline } = useSharedMeta();
  const [open, setOpen] = useState(true);
  const info = data.sharedInfo;

  return (
    <section
      aria-labelledby="sheet-title"
      className="absolute inset-x-0 bottom-0 z-2 flex flex-col gap-[14px] rounded-t-[16px] border-t border-rule bg-sheet px-4 pb-5 pt-2 shadow-[0_-12px_40px_rgba(22,20,15,.14)] md:hidden"
    >
      <button
        type="button"
        aria-label={open ? 'Collapse project details' : 'Expand project details'}
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="flex h-[16px] w-[44px] items-center justify-center self-center border-0 bg-transparent p-0"
      >
        <span className="h-[4px] w-[36px] rounded-full bg-field" />
      </button>
      <div className="flex items-start gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-[2px]">
          <h1 id="sheet-title" className="m-0 font-serif text-[28px] font-normal leading-[1.05]">
            {title}
          </h1>
          <span className="text-[13px] text-ink2">{byline}</span>
        </div>
        {info?.listed && !info.mine && <LikeButton info={info} large />}
      </div>
      {open && (
        <>
          <button
            type="button"
            onClick={async () => {
              if (await copyText(data.url ?? location.href)) {
                toast.success('Link copied.');
              }
            }}
            className="btn-primary btn-lg min-h-[48px] w-full"
          >
            <SIcon.Link size={18} /> Copy link
          </button>
          <div className="flex items-start gap-[10px] rounded-[10px] bg-wash p-3">
            <SIcon.Laptop size={18} className="mt-[1px] text-ink2" />
            <p className="m-0 text-[13px] text-ink2">
              <strong className="font-semibold text-ink">Remix on a laptop.</strong> Open this link there, sign in, and send a message to make your own
              copy.
            </p>
          </div>
        </>
      )}
    </section>
  );
}
