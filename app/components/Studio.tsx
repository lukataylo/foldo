import { useLoaderData } from '@remix-run/react';
import { toast } from 'react-toastify';
import { ClientOnly } from 'remix-utils/client-only';
import { BaseChat } from '~/components/chat/BaseChat';
import { Chat } from '~/components/chat/Chat.client';
import { EventBar, type EventInfo } from '~/components/header/EventBar';
import { Header } from '~/components/header/Header';
import { copyText } from '~/components/share/ShareDialog';

export function Studio() {
  const { shared, url, email, event, paused } = useLoaderData() as {
    shared?: boolean;
    url?: string;
    email?: string;
    event?: EventInfo | null;
    paused?: { paused: boolean; message: string };
  };

  return (
    <div className="flex flex-col h-full w-full">
      <EventBar event={event} />
      {paused?.paused && (
        <div role="status" className="flex h-9 shrink-0 items-center justify-center gap-2 bg-[#b42318] px-4 text-sm font-medium text-white">
          <span className="i-ph:pause-circle-bold" />
          {paused.message || 'The organizers have paused new builds for a moment. Hang tight.'}
        </div>
      )}
      <Header />
      {shared && (
        <div
          data-testid="foldo-share-banner"
          className="flex h-10 shrink-0 items-center justify-center gap-2 bg-[#FFC21A] px-3 text-sm font-medium text-[#111] sm:gap-3 sm:px-4"
        >
          <span className="i-ph:eye shrink-0 text-base" />
          {/* one line at any width: on a phone the full sentence wrapped under the header */}
          <span className="min-w-0 truncate">
            <span className="sm:hidden">Shared project</span>
            <span className="hidden sm:inline">
              You're viewing a shared project.{' '}
              {email ? 'Send a message to remix it into your own copy.' : 'Sign up free to remix it.'}
            </span>
          </span>
          <button
            data-testid="foldo-share-banner-copy"
            onClick={async () => {
              if (await copyText(url ?? location.href)) {
                toast.success('Link copied.');
              }
            }}
            className="btn h-7 shrink-0 border border-black/20 px-2.5 text-xs font-semibold text-[#111] hover:bg-black/10"
          >
            <span className="i-ph:link-simple-bold" /> Copy link
          </button>
          {!email && (
            <a
              href="/login?mode=register"
              className="btn h-7 shrink-0 bg-[#111] px-2.5 text-xs font-semibold text-white hover:bg-black"
            >
              <span className="sm:hidden">Remix</span>
              <span className="hidden sm:inline">Sign up to remix</span>
            </a>
          )}
        </div>
      )}
      <ClientOnly fallback={<BaseChat />}>{() => <Chat />}</ClientOnly>
    </div>
  );
}
