import { useLoaderData } from '@remix-run/react';
import type { ReactNode } from 'react';
import { Icon } from '~/components/ui/icons';
import { clock } from './studio-state';
import { SIcon } from './studio-icons';

/*
 * System cards that live in the chat column: the cut-off reply (Build-Limits), the quota and pause cards that replace
 * the composer (Build-Limits, Build-Paused), the auto-fix note (Build-Error) and the remix moment (Shared-Remix).
 */

export function CutOffCard({ left, onContinue, blocked }: { left?: number; onContinue: () => void; blocked?: string }) {
  const none = left === 0;

  return (
    <div role="status" data-testid="foldo-cutoff" className="flex items-center gap-[14px] rounded-[12px] border border-rule bg-sheet p-3">
      <img
        src="/art/cut-off.webp"
        alt="Foldo carrying the next piece of a toy train track in its mouth"
        width={120}
        height={120}
        className="block h-[120px] w-[120px] flex-none rounded-[12px] border border-rule object-cover"
      />
      <div className="flex min-w-0 flex-1 flex-col items-start gap-2">
        <span className="text-[14px] font-semibold">That reply was cut off before the app was finished.</span>
        <span id="foldo-cutoff-note" className="text-[13px] text-ink2">
          {none
            ? 'Continuing uses one message, and you have none left today. It will be here when your messages reset.'
            : 'Continue picks up where Foldo stopped. It uses one message.'}
        </span>
        <button
          type="button"
          disabled={none || Boolean(blocked)}
          title={blocked}
          aria-describedby="foldo-cutoff-note"
          onClick={onContinue}
          className="btn-primary btn-sm disabled:!text-pencil"
        >
          Continue <Icon.ArrowRight size={14} />
        </button>
      </div>
    </div>
  );
}

export function QuotaCard() {
  const { limit } = useLoaderData() as { limit?: number };
  const n = limit ?? 0;

  return (
    <div role="status" data-testid="foldo-quota-card" className="flex items-center gap-4 rounded-[12px] border border-rule bg-sheet p-4">
      <img
        src="/art/quota-empty.webp"
        alt="Foldo lying content beside a licked-clean bowl"
        width={128}
        height={128}
        className="block h-[128px] w-[128px] flex-none rounded-[12px] border border-rule object-cover"
      />
      <div className="flex min-w-0 flex-1 flex-col gap-[6px]">
        <h2 className="m-0 font-serif text-[24px] font-normal leading-[1.1]">That’s all {n} messages for today.</h2>
        <p className="m-0 text-[13px] text-ink2">You’ve used all {n} messages for tonight. Ask an organizer if you need more.</p>
        <p className="m-0 text-[13px] text-pencil">Your projects stay saved and your share links keep working.</p>
      </div>
    </div>
  );
}

// the composer stand-in under the quota card
export function UsedUpBar() {
  return (
    <form aria-disabled="true" className="flex items-center gap-2 rounded-[10px] border border-rule bg-wash px-3 py-[10px]" onSubmit={(e) => e.preventDefault()}>
      <label htmlFor="chat-input" className="sr-only">
        Ask for a change
      </label>
      <input
        id="chat-input"
        type="text"
        disabled
        placeholder="Messages are used up for today"
        className="min-w-0 flex-1 border-0 bg-transparent font-sans text-[14px] text-pencil outline-none"
      />
      <button
        type="submit"
        disabled
        aria-label="Send message"
        className="inline-flex h-[32px] items-center gap-[6px] rounded-[7px] border border-rule bg-paper px-3 text-[13px] font-semibold text-pencil"
      >
        Send <Icon.ArrowRight size={14} />
      </button>
    </form>
  );
}

export function PausedCard({ since }: { since?: number | null }) {
  return (
    <div role="status" data-testid="foldo-paused-card" className="overflow-hidden rounded-[14px] border border-rule bg-sheet">
      <img
        src="/art/paused.webp"
        alt="Foldo asleep under a yellow blanket next to a tipped-over alarm clock"
        width={398}
        height={176}
        className="block h-[176px] w-full object-cover object-[center_55%]"
      />
      <div className="flex flex-col gap-2 border-t border-rule px-[18px] pb-[18px] pt-4">
        <h2 className="m-0 font-serif text-[28px] font-normal leading-[1.05]">Builds are paused</h2>
        <p className="m-0 text-[14px] text-ink2">Your preview keeps running and your work is saved. You can keep exploring the code.</p>
        <span className="font-mono text-[12px] text-pencil">
          Paused by organizers{since ? ` · ${clock(since)}` : ''}
        </span>
      </div>
    </div>
  );
}

export function AutoFixBanner() {
  return (
    <div role="status" data-testid="foldo-autofix" className="flex items-start gap-[10px] rounded-[10px] border border-info-border bg-info-bg px-3 py-[10px] text-[13px] text-ink">
      <Icon.Info className="mt-[2px] flex-none text-info" />
      <span>
        Your app hit an error after that build, so Foldo is fixing it.
        <span className="block text-ink2">You don’t need to do anything. Keep the preview open.</span>
      </span>
    </div>
  );
}

export function RemixCard() {
  return (
    <article aria-labelledby="remix-title" data-testid="foldo-remix-card" className="overflow-hidden rounded-[14px] border border-rule bg-sheet">
      <img
        src="/art/remix.webp"
        alt="Foldo the paper dachshund, delighted, watching two paper phone copies walk off holding hands"
        className="block aspect-[2/1] w-full border-b border-rule object-cover"
      />
      <div className="flex flex-col gap-[6px] px-5 pb-5 pt-[18px]">
        <h2 id="remix-title" className="m-0 font-serif text-[32px] font-normal leading-[1.05]">
          Make it <span className="marker italic">yours</span>
        </h2>
        <p className="m-0 text-[15px] text-ink2">Send a message to remix it into your own copy. The original stays exactly as it is.</p>
      </div>
    </article>
  );
}

// the owner opened their own share link: no remix, just the way back to the studio
export function OwnerCard({ projectId }: { projectId: string }) {
  return (
    <div role="status" data-testid="foldo-owner-card" className="flex flex-col items-start gap-3 rounded-[12px] border border-rule bg-sheet p-5">
      <h2 className="m-0 font-serif text-[28px] font-normal leading-[1.05]">This is your project</h2>
      <p className="m-0 text-[14px] text-ink2">This is the link others see. Open it in the studio to keep building; your changes show here after they save.</p>
      <a href={`/chat/${projectId}`} className="btn-primary btn-md no-underline">
        Open in studio <Icon.ArrowRight />
      </a>
    </div>
  );
}

// "Original conversation": the shared project's chat, folded so the remix moment leads
export function OriginalConversation({
  open,
  onToggle,
  meta,
  children,
}: {
  open: boolean;
  onToggle: () => void;
  meta: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4">
      <button
        type="button"
        aria-expanded={open}
        onClick={onToggle}
        className="flex w-full items-center gap-3 rounded-[12px] border border-rule bg-sheet px-[14px] py-3 text-left font-sans leading-normal text-ink"
      >
        <span className="inline-flex h-[32px] w-[32px] flex-none items-center justify-center rounded-[8px] bg-wash text-ink2">
          <Icon.Chat />
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="text-[14px] font-semibold">Original conversation</span>
          <span className="text-[12px] text-pencil">{meta}</span>
        </span>
        <Icon.ChevronDown size={15} className={`flex-none text-ink2 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && children}
    </div>
  );
}

export function RemixNote() {
  return (
    <span className="inline-flex items-center gap-[6px] text-[12px] text-pencil">
      <SIcon.Fork size={14} />
      Remixing creates a new project in{' '}
      <a href="/projects" className="text-ink2">
        Your projects
      </a>
    </span>
  );
}
